//! Board-independent footprint geometry. Coordinates are integer nanometres;
//! local +x points right, +y down. Reflection precedes clockwise rotation.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

use crate::{BoardSide, CompileError, Diagnostic, LayerSet, StackupLayer, TechnicalLayer};

pub const FOOTPRINT_VERSION: u32 = 1;
// JSON numbers must round-trip exactly through JavaScript.
const LIMIT: i64 = 9_007_199_254_740_991;

fn invalid(message: impl Into<String>) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBFP001", message))
}

/// Exact decimal parser. No floating-point conversion or silent rounding.
pub fn length(value: &str) -> Result<i64, CompileError> {
    let value = value.trim();
    let (digits, scale) = [
        ("mm", 1_000_000_i128),
        ("mil", 25_400),
        ("in", 25_400_000),
        ("um", 1_000),
        ("nm", 1),
    ]
    .into_iter()
    .find_map(|(unit, scale)| value.strip_suffix(unit).map(|s| (s, scale)))
    .ok_or_else(|| invalid("length requires nm, um, mm, mil, or in"))?;
    let negative = digits.starts_with('-');
    let digits = digits
        .strip_prefix('-')
        .or_else(|| digits.strip_prefix('+'))
        .unwrap_or(digits);
    let mut split = digits.split('.');
    let whole = split.next().unwrap_or_default();
    let fraction = split.next().unwrap_or_default();
    if split.next().is_some()
        || (whole.is_empty() && fraction.is_empty())
        || !whole
            .bytes()
            .chain(fraction.bytes())
            .all(|b| b.is_ascii_digit())
        || fraction.len() > 18
    {
        return Err(invalid(format!("invalid decimal length {value}")));
    }
    let denominator = 10_i128.pow(fraction.len() as u32);
    let whole: i128 = if whole.is_empty() {
        0
    } else {
        whole.parse().map_err(|_| invalid("length overflow"))?
    };
    let fraction: i128 = if fraction.is_empty() {
        0
    } else {
        fraction.parse().map_err(|_| invalid("length overflow"))?
    };
    let numerator = whole
        .checked_mul(denominator)
        .and_then(|v| v.checked_add(fraction))
        .and_then(|v| v.checked_mul(scale))
        .ok_or_else(|| invalid("length overflow"))?;
    if numerator % denominator != 0 {
        return Err(invalid("length is finer than one nanometre"));
    }
    checked(if negative {
        -(numerator / denominator)
    } else {
        numerator / denominator
    })
}

fn checked(value: i128) -> Result<i64, CompileError> {
    if value.abs() > i128::from(LIMIT) {
        return Err(invalid("coordinate exceeds exact JSON integer range"));
    }
    Ok(value as i64)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Role {
    FrontCopper,
    BackCopper,
    AllCopper,
    FrontMask,
    BackMask,
    AllMask,
    FrontPaste,
    BackPaste,
    FrontSilkscreen,
    BackSilkscreen,
    FrontCourtyard,
    BackCourtyard,
    FrontFabrication,
    BackFabrication,
}

impl Role {
    pub fn resolve(self, layers: &LayerSet, back: bool) -> Result<Vec<String>, CompileError> {
        let copper: Vec<_> = layers
            .stackup
            .entries
            .iter()
            .filter_map(|l| match l {
                StackupLayer::Copper { id, .. } => Some(id.clone()),
                _ => None,
            })
            .collect();
        let (kind, front) = match self {
            Self::AllCopper => return Ok(copper),
            Self::FrontCopper | Self::BackCopper => {
                let front = (self == Self::FrontCopper) != back;
                return Ok(vec![
                    if front { copper.first() } else { copper.last() }
                        .ok_or_else(|| invalid("board has no copper layers"))?
                        .clone(),
                ]);
            }
            Self::AllMask => {
                let mut result = Self::FrontMask.resolve(layers, false)?;
                result.extend(Self::BackMask.resolve(layers, false)?);
                return Ok(result);
            }
            Self::FrontMask => ("mask", true),
            Self::BackMask => ("mask", false),
            Self::FrontPaste => ("paste", true),
            Self::BackPaste => ("paste", false),
            Self::FrontSilkscreen => ("silkscreen", true),
            Self::BackSilkscreen => ("silkscreen", false),
            Self::FrontCourtyard => ("courtyard", true),
            Self::BackCourtyard => ("courtyard", false),
            Self::FrontFabrication => ("fabrication", true),
            Self::BackFabrication => ("fabrication", false),
        };
        let side = if front != back {
            BoardSide::Front
        } else {
            BoardSide::Back
        };
        let result: Vec<_> = layers
            .technical
            .iter()
            .filter_map(|layer| {
                let matches = match layer {
                    TechnicalLayer::SolderMask { side: s, .. } => kind == "mask" && *s == side,
                    TechnicalLayer::Paste { side: s, .. } => kind == "paste" && *s == side,
                    TechnicalLayer::Silkscreen { side: s, .. } => {
                        kind == "silkscreen" && *s == side
                    }
                    TechnicalLayer::Mechanical {
                        purpose, side: s, ..
                    } => {
                        s.as_ref() == Some(&side)
                            && matches!(
                                (kind, purpose),
                                ("courtyard", crate::MechanicalPurpose::Courtyard)
                                    | ("fabrication", crate::MechanicalPurpose::Fabrication)
                            )
                    }
                };
                matches.then(|| layer.id().to_owned())
            })
            .collect();
        if result.len() != 1 {
            return Err(invalid(format!(
                "role {self:?} requires one unambiguous board layer"
            )));
        }
        Ok(result)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Shape {
    Rect { size: [i64; 2] },
    RoundedRect { size: [i64; 2], radius: i64 },
    Circle { diameter: i64 },
    Oval { size: [i64; 2] },
}

impl Shape {
    pub fn size(&self) -> [i64; 2] {
        match self {
            Self::Circle { diameter } => [*diameter; 2],
            Self::Rect { size } | Self::RoundedRect { size, .. } | Self::Oval { size } => *size,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Purpose {
    Pad,
    PlatedHole,
    NonPlatedHole,
    Copper,
    MaskOpening,
    PasteOpening,
    Silkscreen,
    Courtyard,
    Fabrication,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Feature {
    pub id: String,
    pub purpose: Purpose,
    pub at: [i64; 2],
    pub shape: Shape,
    /// Clockwise degrees; only 0, 90, 180, 270 are currently supported.
    pub rotation: u16,
    pub layers: Vec<Role>,
    pub drill: Option<Drill>,
    /// Stroke width for documentation outlines; None means filled geometry.
    pub stroke: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Drill {
    pub diameter: i64,
    pub plated: bool,
}

/// Bounds use doubled nanometres so odd-width shapes have exact half-nm edges.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bounds {
    pub min2: [i64; 2],
    pub max2: [i64; 2],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhysicalFootprint {
    pub schema_version: u32,
    pub key: String,
    pub units: String,
    pub features: Vec<Feature>,
    pub bounds: Bounds,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FootprintInput {
    pub schema_version: u32,
    pub key: String,
    pub features: Vec<FeatureInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeatureInput {
    pub id: String,
    pub purpose: Purpose,
    pub at: [String; 2],
    pub shape: ShapeInput,
    #[serde(default)]
    pub rotation: u16,
    #[serde(default)]
    pub layers: Vec<Role>,
    pub drill: Option<DrillInput>,
    pub stroke: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ShapeInput {
    Rect { size: [String; 2] },
    RoundedRect { size: [String; 2], radius: String },
    Circle { diameter: String },
    Oval { size: [String; 2] },
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DrillInput {
    pub diameter: String,
    pub plated: bool,
}

pub fn compile_footprint(input: FootprintInput) -> Result<PhysicalFootprint, CompileError> {
    if input.schema_version != FOOTPRINT_VERSION {
        return Err(invalid("unsupported footprint authoring version"));
    }
    let pair =
        |v: [String; 2]| -> Result<[i64; 2], CompileError> { Ok([length(&v[0])?, length(&v[1])?]) };
    let features = input
        .features
        .into_iter()
        .map(|f| {
            Ok(Feature {
                id: f.id,
                purpose: f.purpose,
                at: pair(f.at)?,
                rotation: f.rotation,
                shape: match f.shape {
                    ShapeInput::Rect { size } => Shape::Rect { size: pair(size)? },
                    ShapeInput::RoundedRect { size, radius } => Shape::RoundedRect {
                        size: pair(size)?,
                        radius: length(&radius)?,
                    },
                    ShapeInput::Circle { diameter } => Shape::Circle {
                        diameter: length(&diameter)?,
                    },
                    ShapeInput::Oval { size } => Shape::Oval { size: pair(size)? },
                },
                layers: f.layers,
                drill: f
                    .drill
                    .map(|d| {
                        Ok(Drill {
                            diameter: length(&d.diameter)?,
                            plated: d.plated,
                        })
                    })
                    .transpose()?,
                stroke: f.stroke.map(|s| length(&s)).transpose()?,
            })
        })
        .collect::<Result<Vec<_>, CompileError>>()?;
    let bounds = bounds(&features)?;
    let result = PhysicalFootprint {
        schema_version: FOOTPRINT_VERSION,
        key: input.key,
        units: "nm".into(),
        features,
        bounds,
    };
    result.validate()?;
    Ok(result)
}

pub fn bounds(features: &[Feature]) -> Result<Bounds, CompileError> {
    if features.is_empty() {
        return Err(invalid("footprint requires physical features"));
    }
    let mut min = [i128::MAX; 2];
    let mut max = [i128::MIN; 2];
    for f in features {
        let mut size = f.shape.size();
        if f.rotation % 180 == 90 {
            size.swap(0, 1);
        }
        for axis in 0..2 {
            let center = i128::from(f.at[axis]) * 2;
            let extent = i128::from(size[axis]) + i128::from(f.stroke.unwrap_or(0));
            min[axis] = min[axis].min(center - extent);
            max[axis] = max[axis].max(center + extent);
        }
    }
    Ok(Bounds {
        min2: [checked(min[0])?, checked(min[1])?],
        max2: [checked(max[0])?, checked(max[1])?],
    })
}

impl PhysicalFootprint {
    /// Legacy binding index. Exact manufacturing geometry remains in features.
    pub fn compatibility_pads(&self) -> Vec<crate::FootprintPad> {
        self.features
            .iter()
            .filter(|f| f.purpose == Purpose::Pad)
            .map(|f| crate::FootprintPad {
                id: f.id.clone(),
                at: f.at.map(|n| n as f64 / 1_000_000.0),
                size: f.shape.size().map(|n| n as f64 / 1_000_000.0),
                shape: match f.shape {
                    Shape::Circle { .. } => crate::PadShape::Circle,
                    Shape::Oval { .. } => crate::PadShape::Oval,
                    _ => crate::PadShape::Rect,
                },
                rotation: f64::from(f.rotation),
                layers: f
                    .layers
                    .iter()
                    .map(|r| crate::PadLayer::Role { role: *r })
                    .collect(),
                drill: f.drill.as_ref().map(|d| crate::PadDrill {
                    diameter: d.diameter as f64 / 1_000_000.0,
                    plated: d.plated,
                }),
            })
            .collect()
    }

    pub fn validate(&self) -> Result<(), CompileError> {
        if self.schema_version != FOOTPRINT_VERSION
            || self.units != "nm"
            || self.key.trim().is_empty()
        {
            return Err(invalid("invalid physical footprint version, units, or key"));
        }
        let mut ids = BTreeSet::new();
        for f in &self.features {
            if f.id.trim().is_empty() || !ids.insert(&f.id) {
                return Err(invalid("feature IDs must be non-empty and unique"));
            }
            for value in f.at.into_iter().chain(f.shape.size()) {
                checked(i128::from(value))?;
            }
            if f.shape.size().into_iter().any(|s| s <= 0)
                || ![0, 90, 180, 270].contains(&f.rotation)
            {
                return Err(invalid(format!(
                    "invalid dimensions or rotation for {}",
                    f.id
                )));
            }
            if let Shape::RoundedRect { size, radius } = &f.shape
                && (*radius < 0 || i128::from(*radius) * 2 > i128::from(size[0].min(size[1])))
            {
                return Err(invalid(
                    "rounded rectangle radius exceeds half its smaller dimension",
                ));
            }
            let mut roles = BTreeSet::new();
            for role in &f.layers {
                if !roles.insert(format!("{role:?}")) {
                    return Err(invalid("duplicate feature layer role"));
                }
                let allowed = match f.purpose {
                    Purpose::Pad => matches!(
                        role,
                        Role::FrontCopper
                            | Role::BackCopper
                            | Role::AllCopper
                            | Role::FrontMask
                            | Role::BackMask
                            | Role::AllMask
                            | Role::FrontPaste
                            | Role::BackPaste
                    ),
                    Purpose::Copper => {
                        matches!(role, Role::FrontCopper | Role::BackCopper | Role::AllCopper)
                    }
                    Purpose::MaskOpening => {
                        matches!(role, Role::FrontMask | Role::BackMask | Role::AllMask)
                    }
                    Purpose::PasteOpening => matches!(role, Role::FrontPaste | Role::BackPaste),
                    Purpose::Silkscreen => {
                        matches!(role, Role::FrontSilkscreen | Role::BackSilkscreen)
                    }
                    Purpose::Courtyard => {
                        matches!(role, Role::FrontCourtyard | Role::BackCourtyard)
                    }
                    Purpose::Fabrication => {
                        matches!(role, Role::FrontFabrication | Role::BackFabrication)
                    }
                    Purpose::PlatedHole | Purpose::NonPlatedHole => false,
                };
                if !allowed {
                    return Err(invalid("feature purpose is incompatible with layer role"));
                }
            }
            let hole = matches!(f.purpose, Purpose::PlatedHole | Purpose::NonPlatedHole);
            if (f.layers.contains(&Role::AllCopper)
                && f.layers
                    .iter()
                    .any(|r| matches!(r, Role::FrontCopper | Role::BackCopper)))
                || (f.layers.contains(&Role::AllMask)
                    && f.layers
                        .iter()
                        .any(|r| matches!(r, Role::FrontMask | Role::BackMask)))
            {
                return Err(invalid("overlapping semantic layer roles"));
            }
            if hole
                && (!matches!(f.shape, Shape::Circle { .. })
                    || f.drill
                        .as_ref()
                        .is_some_and(|d| f.shape.size() != [d.diameter; 2]))
            {
                return Err(invalid(
                    "hole shape must be a circle matching its drill diameter",
                ));
            }
            if !hole && f.layers.is_empty() {
                return Err(invalid("feature requires semantic layers"));
            }
            if f.purpose == Purpose::Pad
                && !f
                    .layers
                    .iter()
                    .any(|r| matches!(r, Role::FrontCopper | Role::BackCopper | Role::AllCopper))
            {
                return Err(invalid("pad requires copper"));
            }
            if let Some(d) = &f.drill {
                checked(i128::from(d.diameter))?;
                if d.diameter <= 0
                    || d.diameter > f.shape.size()[0].min(f.shape.size()[1])
                    || (!hole && f.purpose != Purpose::Pad)
                    || (hole && d.plated != (f.purpose == Purpose::PlatedHole))
                {
                    return Err(invalid("invalid drill geometry or plating"));
                }
            } else if hole {
                return Err(invalid("hole requires drill geometry"));
            }
            if let Some(stroke) = f.stroke
                && (stroke <= 0
                    || !matches!(
                        f.purpose,
                        Purpose::Silkscreen | Purpose::Courtyard | Purpose::Fabrication
                    ))
            {
                return Err(invalid(
                    "stroke is only supported for documentation graphics",
                ));
            }
        }
        if self.bounds != bounds(&self.features)? {
            return Err(invalid("footprint bounds do not match geometry"));
        }
        Ok(())
    }

    pub fn place(
        &self,
        at: [i64; 2],
        rotation: u16,
        back: bool,
        layers: &LayerSet,
    ) -> Result<BTreeMap<String, PlacedFeature>, CompileError> {
        self.validate()?;
        for coordinate in at {
            checked(i128::from(coordinate))?;
        }
        if ![0, 90, 180, 270].contains(&rotation) {
            return Err(invalid("physical placement supports quarter turns only"));
        }
        let mut result = BTreeMap::new();
        for f in &self.features {
            let x = i128::from(f.at[0]) * if back { -1 } else { 1 };
            let y = i128::from(f.at[1]);
            let [x, y] = match rotation {
                0 => [x, y],
                90 => [-y, x],
                180 => [-x, -y],
                _ => [y, -x],
            };
            let position = [
                checked(x + i128::from(at[0]))?,
                checked(y + i128::from(at[1]))?,
            ];
            let mut resolved = BTreeSet::new();
            for role in &f.layers {
                for layer in role.resolve(layers, back)? {
                    if !resolved.insert(layer) {
                        return Err(invalid("overlapping semantic layer targets"));
                    }
                }
            }
            let mut geometry = f.clone();
            geometry.at = position;
            geometry.rotation = (rotation
                + if back {
                    (360 - f.rotation) % 360
                } else {
                    f.rotation
                })
                % 360;
            bounds(std::slice::from_ref(&geometry))?;
            result.insert(
                f.id.clone(),
                PlacedFeature {
                    geometry,
                    layers: resolved.into_iter().collect(),
                },
            );
        }
        Ok(result)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlacedFeature {
    pub geometry: Feature,
    pub layers: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationInput {
    pub footprint: crate::FootprintDefinition,
    pub units: crate::LengthUnit,
    pub layer_roles: BTreeMap<String, Role>,
}

/// Explicit legacy adapter. Caller provides the old coordinate unit and the
/// semantic meaning of board-layer IDs; the adapter never guesses role names.
pub fn migrate_footprint(
    legacy: &crate::FootprintDefinition,
    unit: crate::LengthUnit,
    roles: &BTreeMap<String, Role>,
) -> Result<PhysicalFootprint, CompileError> {
    if let Some(physical) = &legacy.physical {
        physical.validate()?;
        return Ok(physical.clone());
    }
    if !legacy.resolved {
        return Err(invalid("cannot migrate unresolved footprint geometry"));
    }
    let suffix = match unit {
        crate::LengthUnit::Mm => "mm",
        crate::LengthUnit::Mil => "mil",
        crate::LengthUnit::In => "in",
    };
    let convert = |n: f64| -> Result<i64, CompileError> {
        if !n.is_finite() {
            return Err(invalid("legacy length must be finite"));
        }
        length(&format!("{n}{suffix}"))
    };
    let pair =
        |p: [f64; 2]| -> Result<[i64; 2], CompileError> { Ok([convert(p[0])?, convert(p[1])?]) };
    let features = legacy
        .pads
        .iter()
        .map(|p| {
            if ![0.0, 90.0, 180.0, 270.0].contains(&p.rotation) {
                return Err(invalid("legacy rotation requires unsupported quantization"));
            }
            let size = pair(p.size)?;
            let shape = match p.shape {
                crate::PadShape::Rect => Shape::Rect { size },
                crate::PadShape::Oval => Shape::Oval { size },
                crate::PadShape::Circle => {
                    if size[0] != size[1] {
                        return Err(invalid("legacy circle must have equal dimensions"));
                    }
                    Shape::Circle { diameter: size[0] }
                }
            };
            let layers = p
                .layers
                .iter()
                .map(|layer| match layer {
                    crate::PadLayer::Id(id) => roles.get(id).copied().ok_or_else(|| {
                        invalid(format!("explicit semantic role required for layer {id}"))
                    }),
                    crate::PadLayer::Selector(_) => Ok(Role::AllCopper),
                    crate::PadLayer::Role { role } => Ok(*role),
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Feature {
                id: p.id.clone(),
                purpose: Purpose::Pad,
                at: pair(p.at)?,
                shape,
                rotation: p.rotation as u16,
                layers,
                drill: p
                    .drill
                    .as_ref()
                    .map(|d| {
                        Ok(Drill {
                            diameter: convert(d.diameter)?,
                            plated: d.plated,
                        })
                    })
                    .transpose()?,
                stroke: None,
            })
        })
        .collect::<Result<Vec<_>, CompileError>>()?;
    let result = PhysicalFootprint {
        schema_version: FOOTPRINT_VERSION,
        key: legacy.key.clone(),
        units: "nm".into(),
        bounds: bounds(&features)?,
        features,
    };
    result.validate()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> PhysicalFootprint {
        compile_footprint(serde_json::from_value(json!({"schemaVersion":1,"key":"test:passive","features":[
            {"id":"1","purpose":"pad","at":["-0.5mm","0.2mm"],"shape":{"kind":"rect","size":["0.6mm","0.7mm"]},"layers":["front-copper","front-mask","front-paste"]},
            {"id":"2","purpose":"pad","at":["0.5mm","0.2mm"],"shape":{"kind":"rect","size":["0.6mm","0.7mm"]},"layers":["front-copper","front-mask","front-paste"]}
        ]})).unwrap()).unwrap()
    }
    fn layers(prefix: &str) -> LayerSet {
        serde_json::from_value(
            json!({"kind":"layer-set","stackup":{"kind":"stackup","entries":[
                {"kind":"copper","id":format!("{prefix}-top"),"thickness":0.035,"usage":"signal"},
                {"kind":"dielectric","id":"core","thickness":1.5,"material":"FR4","epsilonR":4.2},
                {"kind":"copper","id":format!("{prefix}-bottom"),"thickness":0.035,"usage":"signal"}
            ]},"technical":[
                {"kind":"solder-mask","id":format!("{prefix}-mask-top"),"side":"front"},
                {"kind":"solder-mask","id":format!("{prefix}-mask-bottom"),"side":"back"},
                {"kind":"paste","id":format!("{prefix}-paste-top"),"side":"front"},
                {"kind":"paste","id":format!("{prefix}-paste-bottom"),"side":"back"}
            ]}),
        )
        .unwrap()
    }
    #[test]
    fn exact_units_and_overflow() {
        assert_eq!(length("1in").unwrap(), length("1000mil").unwrap());
        assert_eq!(length("25.4mm").unwrap(), 25_400_000);
        assert_eq!(length("-0.001um").unwrap(), -1);
        for value in [
            "0.1nm",
            "NaNmm",
            "1px",
            "1e3mm",
            "1.2.3mm",
            "999999999999999999999999999999999999999999mm",
            "9007199254740992nm",
        ] {
            assert!(length(value).is_err(), "{value}");
        }
    }

    #[test]
    fn holes_openings_and_graphics_keep_distinct_semantics() {
        let input: FootprintInput = serde_json::from_value(json!({"schemaVersion":1,"key":"features","features":[
            {"id":"mount","purpose":"plated-hole","at":["0mm","0mm"],"shape":{"kind":"circle","diameter":"0.8mm"},"drill":{"diameter":"0.8mm","plated":true}},
            {"id":"mask","purpose":"mask-opening","at":["0mm","0mm"],"shape":{"kind":"circle","diameter":"1.2mm"},"layers":["all-mask"]},
            {"id":"paste","purpose":"paste-opening","at":["2mm","0mm"],"shape":{"kind":"oval","size":["1mm","0.5mm"]},"layers":["front-paste"]},
            {"id":"outline","purpose":"courtyard","at":["0mm","0mm"],"shape":{"kind":"rect","size":["4mm","2mm"]},"stroke":"0.1mm","layers":["front-courtyard"]}
        ]})).unwrap();
        let compiled = compile_footprint(input).unwrap();
        assert_eq!(
            compiled.features[0].drill.as_ref().unwrap().diameter,
            800_000
        );
        assert_eq!(compiled.features[3].stroke, Some(100_000));
        assert_eq!(compiled.bounds.min2, [-4_100_000, -2_100_000]);
        assert_eq!(compiled.bounds.max2, [5_000_000, 2_100_000]);
        let mut invalid = compiled.clone();
        invalid.features[0].drill = None;
        assert!(invalid.validate().is_err());
        let mut invalid = compiled.clone();
        invalid.features[2].layers = vec![Role::FrontCopper];
        assert!(invalid.validate().is_err());
        let mut invalid = compiled;
        invalid.features[3].shape = Shape::RoundedRect {
            size: [1_000_000, 1_000_000],
            radius: 600_000,
        };
        assert!(invalid.validate().is_err());
    }
    #[test]
    fn independent_definition_and_instance_transform() {
        let definition = fixture();
        let original = serde_json::to_value(&definition).unwrap();
        let front = definition
            .place([10_000_000, 20_000_000], 90, false, &layers("a"))
            .unwrap();
        let back = definition
            .place([10_000_000, 20_000_000], 90, true, &layers("b"))
            .unwrap();
        assert_eq!(front["1"].geometry.at, [9_800_000, 19_500_000]);
        assert_eq!(back["1"].geometry.at, [9_800_000, 20_500_000]);
        assert!(front["1"].layers.contains(&"a-top".into()));
        assert!(back["1"].layers.contains(&"b-bottom".into()));
        assert_eq!(original, serde_json::to_value(&definition).unwrap());
        let decoded: PhysicalFootprint = serde_json::from_value(original).unwrap();
        assert_eq!(decoded, definition);
    }
    #[test]
    fn stable_ids_bounds_and_invalid_contracts() {
        let mut definition = fixture();
        let original = definition.bounds.clone();
        definition.features.reverse();
        assert_eq!(bounds(&definition.features).unwrap(), original);
        assert!(definition.validate().is_ok());
        definition.features[0].id = definition.features[1].id.clone();
        assert!(definition.validate().is_err());
        let mut definition = fixture();
        definition.features[0].shape = Shape::Circle { diameter: 1 };
        definition.bounds = bounds(&definition.features).unwrap();
        assert_eq!(definition.bounds.min2[1], -300_000);
        assert!(
            definition
                .place([LIMIT, 0], 0, false, &layers("a"))
                .is_err()
        );
        let mut definition = fixture();
        definition.features[0].layers = vec![Role::AllCopper, Role::FrontCopper];
        assert!(definition.place([0, 0], 0, false, &layers("a")).is_err());
        let mut missing = layers("a");
        missing.technical.clear();
        assert!(fixture().place([0, 0], 0, false, &missing).is_err());
        let mut ambiguous = layers("a");
        ambiguous.technical.push(ambiguous.technical[0].clone());
        assert!(fixture().place([0, 0], 0, false, &ambiguous).is_err());
    }
    #[test]
    fn explicit_legacy_migration_preserves_units_and_identity() {
        let legacy: crate::FootprintDefinition = serde_json::from_value(json!({"key":"legacy","resolved":true,"pads":[
            {"id":"P","at":[0,0],"shape":"rect","size":[10,20],"layers":["arbitrary"],"rotation":0,"drill":null}
        ]})).unwrap();
        assert!(migrate_footprint(&legacy, crate::LengthUnit::Mil, &BTreeMap::new()).is_err());
        let migrated = migrate_footprint(
            &legacy,
            crate::LengthUnit::Mil,
            &BTreeMap::from([("arbitrary".into(), Role::FrontCopper)]),
        )
        .unwrap();
        assert_eq!(migrated.features[0].id, "P");
        assert_eq!(migrated.features[0].shape.size(), [254_000, 508_000]);
        assert_eq!(legacy.pads[0].size, [10.0, 20.0]);
    }
}
