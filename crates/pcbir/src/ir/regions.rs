//! Exact region geometry and structural constraint validation at every board boundary.
//! Ownership comes from constraint references, never from ID spelling or map order.
use super::{BoardIr, LengthUnit, NetId, PinRef, Rect, StackupLayer, TechnicalLayer};
use crate::{CompileError, Diagnostic, Severity};
use std::collections::{BTreeMap, BTreeSet};

fn invalid(code: &'static str, entity: &str, message: impl Into<String>) -> CompileError {
    CompileError::diagnostic(Diagnostic::error(code, message).with_entity(entity))
}

/// Convert the declared decimal value exactly, without rounding float products.
pub(crate) fn board_length(value: f64, units: LengthUnit) -> Result<i64, CompileError> {
    let unit = match units {
        LengthUnit::Mm => "mm",
        LengthUnit::Mil => "mil",
        LengthUnit::In => "in",
    };
    crate::physical::length(&format!("{value}{unit}"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CheckedRect {
    pub min2: [i128; 2],
    pub max2: [i128; 2],
}

impl CheckedRect {
    pub fn from_rect(rect: &Rect, units: LengthUnit, id: &str) -> Result<Self, CompileError> {
        let [x, y, width, height] =
            [rect.x, rect.y, rect.width, rect.height].map(|value| board_length(value, units));
        let [x, y, width, height] = [x, y, width, height]
            .map(|value| value.map_err(|error| invalid("PCBIR037", id, &error.diagnostic.message)));
        let (x, y, width, height) = (x?, y?, width?, height?);
        if width <= 0 || height <= 0 {
            return Err(invalid(
                "PCBIR037",
                id,
                "region must have positive dimensions",
            ));
        }
        // Check derived edges against the same exact JSON nm range as coordinates.
        let edge = |origin: i64, size: i64| {
            let value = i128::from(origin) + i128::from(size);
            crate::physical::length(&format!("{value}nm"))
                .map(|v| i128::from(v) * 2)
                .map_err(|error| invalid("PCBIR037", id, &error.diagnostic.message))
        };
        Ok(Self {
            min2: [i128::from(x) * 2, i128::from(y) * 2],
            max2: [edge(x, width)?, edge(y, height)?],
        })
    }

    /// Boundary contact alone has no positive-area intersection.
    pub fn intersection(self, other: Self) -> Option<Self> {
        let min2 = std::array::from_fn(|axis| self.min2[axis].max(other.min2[axis]));
        let max2 = std::array::from_fn(|axis| self.max2[axis].min(other.max2[axis]));
        (0..2)
            .all(|axis| min2[axis] < max2[axis])
            .then_some(Self { min2, max2 })
    }

    pub fn diagnostic_bounds(self) -> crate::OutlineBounds {
        crate::OutlineBounds {
            min2: self.min2,
            max2: self.max2,
        }
    }

    pub fn xywh2(self) -> [i128; 4] {
        [
            self.min2[0],
            self.min2[1],
            self.max2[0] - self.min2[0],
            self.max2[1] - self.min2[1],
        ]
    }
}

pub(crate) struct CheckedRegions {
    pub declared: BTreeMap<String, CheckedRect>,
    pub on_board: BTreeMap<String, Option<CheckedRect>>,
    pub diagnostics: Vec<Diagnostic>,
}

fn constraint_label(ir: &BoardIr, owner: &str, waypoint: Option<usize>) -> String {
    let net_name = |id: &NetId| {
        ir.nets
            .iter()
            .find(|net| net.id == *id)
            .map_or_else(|| id.0.clone(), |net| net.name.clone())
    };
    let label = if let Some(route) = ir.route_constraints.iter().find(|r| r.id == owner) {
        format!("Route {}", net_name(&route.net))
    } else if let Some(pair) = ir.differential_pairs.iter().find(|p| p.id == owner) {
        format!(
            "Differential pair {} / {}",
            net_name(&pair.positive),
            net_name(&pair.negative)
        )
    } else if let Some(zone) = ir.zones.iter().find(|z| z.id == owner) {
        format!("Zone intent · {}", net_name(&zone.net))
    } else {
        "Keepout".to_owned()
    };
    waypoint.map_or(label.clone(), |index| format!("{label} · waypoint {index}"))
}

impl CheckedRegions {
    pub fn diagnostic_geometry(
        &self,
        ir: &BoardIr,
        owner: &str,
        region: &str,
        waypoint: Option<usize>,
    ) -> crate::DiagnosticGeometry {
        crate::DiagnosticGeometry::ConstraintRegion(Box::new(
            crate::diagnostic::ConstraintRegionGeometry {
                label: constraint_label(ir, owner, waypoint),
                board_bounds: self.declared[&ir.board.outline].diagnostic_bounds(),
                constraint_id: owner.to_owned(),
                region_id: region.to_owned(),
                region_bounds: self.declared[region].diagnostic_bounds(),
                effective_bounds: self.on_board[region].map(CheckedRect::diagnostic_bounds),
                waypoint,
                net: None,
                part: None,
                layer: None,
                feature: None,
                blockers: Vec::new(),
                feature_bounds: None,
            },
        ))
    }
}

/// Validate all stored geometry and all constraint owners/targets, including
/// unrendered zones and unreferenced regions. Shared region references are legal;
/// each reference is checked in its owner's context (including waypoint order).
pub(crate) fn validate_regions(ir: &BoardIr) -> Result<CheckedRegions, CompileError> {
    let mut checked = check_regions(ir)?;
    if let Some(index) = checked
        .diagnostics
        .iter()
        .position(|d| matches!(d.severity, Severity::Error))
    {
        let fatal = checked.diagnostics.remove(index);
        return Err(CompileError::diagnostic(fatal).with_diagnostics(checked.diagnostics));
    }
    Ok(checked)
}

/// Structural/reference failures reject immediately. Validated rectangles retain
/// all off-board findings so physical checks can accumulate coverage and failures
/// before choosing a fatal diagnostic. Decoding/upgrading uses the strict wrapper.
pub(crate) fn check_regions(ir: &BoardIr) -> Result<CheckedRegions, CompileError> {
    if ir.schema_version != super::SCHEMA_VERSION || ir.board.id.trim().is_empty() {
        return Err(invalid(
            "PCBIR036",
            &ir.board.id,
            "region checks require current board IR and a nonempty board ID",
        ));
    }
    super::validate_constraint_scopes(ir)?;
    let reference_error = |id: &str, message: &str| invalid("PCBIR038", id, message);
    let mut layers = BTreeSet::new();
    for id in ir
        .board
        .layers
        .stackup
        .entries
        .iter()
        .map(StackupLayer::id)
        .chain(ir.board.layers.technical.iter().map(TechnicalLayer::id))
    {
        if id.trim().is_empty() || !layers.insert(id) {
            return Err(reference_error(
                id,
                "board layer IDs must be nonempty and unique",
            ));
        }
    }
    let copper: BTreeSet<_> = ir
        .board
        .layers
        .stackup
        .entries
        .iter()
        .filter_map(|layer| match layer {
            StackupLayer::Copper { id, .. } => Some(id.as_str()),
            _ => None,
        })
        .collect();
    if !(1..=32).contains(&copper.len()) {
        return Err(reference_error(
            &ir.board.id,
            "board requires 1 to 32 concrete copper layers",
        ));
    }
    let mut nets = BTreeSet::new();
    for net in &ir.nets {
        if net.id.0.trim().is_empty() || !nets.insert(&net.id) {
            return Err(reference_error(
                &net.id.0,
                "board net IDs must be nonempty and unique",
            ));
        }
    }
    let check_net = |id: &NetId, owner: &str| {
        if !nets.contains(id) {
            Err(invalid(
                "PCBIR038",
                owner,
                format!(
                    "constraint or connection references a missing net ID {}",
                    id.0
                ),
            ))
        } else {
            Ok(())
        }
    };
    let mut parts = BTreeMap::new();
    for part in &ir.parts {
        if part.id.trim().is_empty() || parts.insert(part.id.as_str(), part).is_some() {
            return Err(reference_error(
                &part.id,
                "board part IDs must be nonempty and unique",
            ));
        }
        if !ir.component_definitions.contains_key(&part.component)
            || !ir.footprint_definitions.contains_key(&part.footprint)
        {
            return Err(reference_error(
                &part.id,
                "placed part references a missing component or footprint definition",
            ));
        }
        for net in part.connections.values() {
            check_net(net, &part.id)?;
        }
    }
    for (key, definition) in &ir.footprint_definitions {
        if key.trim().is_empty() || key != &definition.key {
            return Err(reference_error(
                key,
                "footprint map key must agree with definition key",
            ));
        }
    }
    let endpoint = |pin: &PinRef, net: &NetId, owner: &str| -> Result<(), CompileError> {
        let part = parts.get(pin.part.as_str()).ok_or_else(|| {
            reference_error(owner, "constraint endpoint references a missing part")
        })?;
        let definition = &ir.component_definitions[&part.component];
        if pin.name.trim().is_empty()
            || (!definition.pins.is_empty() && !definition.pins.contains_key(&pin.name))
            || !(definition.pins.contains_key(&pin.name)
                || part.pin_map.contains_key(&pin.name)
                || part.connections.contains_key(&pin.name))
        {
            return Err(reference_error(
                owner,
                "constraint endpoint references a missing logical pin",
            ));
        }
        if part.connections.get(&pin.name) != Some(net) {
            return Err(reference_error(
                owner,
                "constraint endpoint is unconnected or belongs to a different net",
            ));
        }
        Ok(())
    };
    let mut declared = BTreeMap::new();
    for (key, region) in &ir.regions {
        if key.trim().is_empty() || key != &region.id {
            return Err(reference_error(
                key,
                "region map key must agree with region ID",
            ));
        }
        declared.insert(
            key.clone(),
            CheckedRect::from_rect(&region.geometry, ir.units, key)?,
        );
    }
    let outline = *declared
        .get(&ir.board.outline)
        .ok_or_else(|| reference_error(&ir.board.id, "board outline region is missing"))?;
    let on_board: BTreeMap<_, _> = declared
        .iter()
        .map(|(id, rect)| (id.clone(), rect.intersection(outline)))
        .collect();
    let mut diagnostics = Vec::new();
    let mut owners = BTreeSet::new();
    let mut owner = |id: &str| {
        if id.trim().is_empty() || !owners.insert(id.to_owned()) {
            Err(reference_error(
                id,
                "constraint owner IDs must be nonempty and unique across constraint types",
            ))
        } else {
            Ok(())
        }
    };
    let mut region_use = |region: &str,
                          owner: &str,
                          waypoint: Option<usize>|
     -> Result<(), CompileError> {
        let effective = on_board.get(region).ok_or_else(|| {
            invalid(
                "PCBIR038",
                owner,
                format!("constraint references a missing region {region}"),
            )
        })?;
        if effective.is_none() {
            let message = format!(
                "{} region {region} of constraint {owner} has no positive-area board intersection",
                if waypoint.is_some() {
                    "waypoint"
                } else {
                    "boundary"
                }
            );
            diagnostics.push(
                if waypoint.is_some() {
                    Diagnostic::error("PCBIR039", message)
                } else {
                    Diagnostic::warning("PCBIR039", message)
                }
                .with_entity(owner)
                .with_geometry(crate::DiagnosticGeometry::ConstraintRegion(Box::new(
                    crate::diagnostic::ConstraintRegionGeometry {
                        label: constraint_label(ir, owner, waypoint),
                        board_bounds: outline.diagnostic_bounds(),
                        constraint_id: owner.to_owned(),
                        region_id: region.to_owned(),
                        region_bounds: declared[region].diagnostic_bounds(),
                        effective_bounds: None,
                        waypoint,
                        net: None,
                        part: None,
                        layer: None,
                        feature: None,
                        blockers: Vec::new(),
                        feature_bounds: None,
                    },
                )))
                .with_help(if waypoint.is_some() {
                    "Move the waypoint so it intersects the board."
                } else {
                    "This declaration has no on-board effect; stored geometry is preserved."
                }),
            );
        }
        Ok(())
    };
    for route in &ir.route_constraints {
        owner(&route.id)?;
        check_net(&route.net, &route.id)?;
        endpoint(&route.from, &route.net, &route.id)?;
        endpoint(&route.to, &route.net, &route.id)?;
        for (index, region) in route.through.iter().enumerate() {
            region_use(region, &route.id, Some(index + 1))?;
        }
    }
    for pair in &ir.differential_pairs {
        owner(&pair.id)?;
        check_net(&pair.positive, &pair.id)?;
        check_net(&pair.negative, &pair.id)?;
        if pair.positive == pair.negative {
            return Err(reference_error(
                &pair.id,
                "differential pair nets must differ",
            ));
        }
        for (pins, net) in [
            ([&pair.from[0], &pair.to[0]], &pair.positive),
            ([&pair.from[1], &pair.to[1]], &pair.negative),
        ] {
            for pin in pins {
                endpoint(pin, net, &pair.id)?;
            }
        }
        for (index, region) in pair.through.iter().enumerate() {
            region_use(region, &pair.id, Some(index + 1))?;
        }
    }
    for zone in &ir.zones {
        owner(&zone.id)?;
        check_net(&zone.net, &zone.id)?;
        if zone.layers.is_empty()
            || zone.layers.iter().collect::<BTreeSet<_>>().len() != zone.layers.len()
            || zone.layers.iter().any(|id| !copper.contains(id.as_str()))
        {
            return Err(reference_error(
                &zone.id,
                "zone layers must be nonempty, unique concrete copper layer IDs",
            ));
        }
        region_use(&zone.boundary, &zone.id, None)?;
    }
    for keepout in &ir.keepouts {
        owner(&keepout.id)?;
        for net in &keepout.except {
            check_net(net, &keepout.id)?;
        }
        region_use(&keepout.region, &keepout.id, None)?;
    }
    Ok(CheckedRegions {
        declared,
        on_board,
        diagnostics,
    })
}
