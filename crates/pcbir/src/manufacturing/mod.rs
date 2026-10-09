//! Profile-driven footprint checks. Reports retain explicit coverage and never
//! claim board-level DRC, land-pattern verification, or fabrication approval.
mod board;
mod geometry;
use crate::physical::{Feature, PhysicalFootprint, Purpose, Role};
use crate::{CompileError, Diagnostic};
pub use board::{BoardReport, BoardValidationInput, validate_board};
use geometry::Solid;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileInput {
    pub schema_version: u32,
    pub key: String,
    pub min_copper_feature: String,
    pub min_copper_spacing: String,
    pub min_drill_diameter: String,
    pub min_annular_ring: String,
    pub min_mask_expansion: Option<String>,
    pub min_mask_web: Option<String>,
    pub min_paste_feature: Option<String>,
    pub min_courtyard_clearance: Option<String>,
}
/// Canonical report policy. All dimensions are exact integer nanometres.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub schema_version: u32,
    pub key: String,
    pub units: String,
    pub min_copper_feature: i64,
    pub min_copper_spacing: i64,
    pub min_drill_diameter: i64,
    pub min_annular_ring: i64,
    pub min_mask_expansion: Option<i64>,
    pub min_mask_web: Option<i64>,
    pub min_paste_feature: Option<i64>,
    pub min_courtyard_clearance: Option<i64>,
}
fn invalid(message: impl Into<String>) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBMFG001", message)
        .with_help("Provide an explicit schemaVersion: 1 manufacturing profile with physical-unit limits; see docs/manufacturing-validation.md."))
}
impl ProfileInput {
    pub fn compile(self) -> Result<Profile, CompileError> {
        let length =
            |value: &str| crate::physical::length(value).map_err(|e| invalid(e.diagnostic.message));
        let profile = Profile {
            schema_version: self.schema_version,
            key: self.key,
            units: "nm".into(),
            min_copper_feature: length(&self.min_copper_feature)?,
            min_copper_spacing: length(&self.min_copper_spacing)?,
            min_drill_diameter: length(&self.min_drill_diameter)?,
            min_annular_ring: length(&self.min_annular_ring)?,
            min_mask_expansion: self.min_mask_expansion.as_deref().map(length).transpose()?,
            min_mask_web: self.min_mask_web.as_deref().map(length).transpose()?,
            min_paste_feature: self.min_paste_feature.as_deref().map(length).transpose()?,
            min_courtyard_clearance: self
                .min_courtyard_clearance
                .as_deref()
                .map(length)
                .transpose()?,
        };
        profile.validate()?;
        Ok(profile)
    }
}
impl Profile {
    pub fn validate(&self) -> Result<(), CompileError> {
        if self.schema_version != 1 || self.units != "nm" || self.key.trim().is_empty() {
            return Err(invalid(
                "invalid manufacturing profile version, units, or key",
            ));
        }
        let lengths = [
            self.min_copper_feature,
            self.min_copper_spacing,
            self.min_drill_diameter,
            self.min_annular_ring,
        ];
        if lengths
            .into_iter()
            .chain(
                [
                    self.min_mask_expansion,
                    self.min_mask_web,
                    self.min_paste_feature,
                    self.min_courtyard_clearance,
                ]
                .into_iter()
                .flatten(),
            )
            .any(|n| !(0..=9_007_199_254_740_991).contains(&n))
            || self.min_copper_feature == 0
            || self.min_drill_diameter == 0
            || self.min_paste_feature == Some(0)
        {
            return Err(invalid(
                "feature/drill limits must be positive; spacing, ring, expansion and clearance must be non-negative exact JSON lengths",
            ));
        }
        Ok(())
    }
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationInput {
    pub footprint: PhysicalFootprint,
    pub profile: ProfileInput,
}
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Passed,
    Failed,
    Partial,
    Skipped,
    NotApplicable,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: String,
    pub status: Status,
    pub evaluated: usize,
    pub skipped: usize,
    pub diagnostics: Vec<Diagnostic>,
}
impl Check {
    fn new(id: &str) -> Self {
        Self {
            id: id.into(),
            status: Status::NotApplicable,
            evaluated: 0,
            skipped: 0,
            diagnostics: vec![],
        }
    }
    fn evaluate(&mut self, valid: bool, message: String, entity: String) {
        self.evaluated += 1;
        if !valid {
            self.diagnostics
                .push(Diagnostic::error("PCBMFG002", message).with_entity(entity).with_help(format!("Manufacturing check: {}. Adjust geometry or select an applicable explicit process profile.", self.id)));
        }
    }
    fn skip(&mut self, message: &str, entity: &str) {
        self.skipped += 1;
        self.diagnostics
            .push(Diagnostic::warning("PCBMFG003", message).with_entity(entity));
    }
    fn finish(mut self) -> Self {
        self.status = if self
            .diagnostics
            .iter()
            .any(|d| matches!(d.severity, crate::Severity::Error))
        {
            Status::Failed
        } else if self.skipped > 0 && self.evaluated > 0 {
            Status::Partial
        } else if self.skipped > 0 {
            Status::Skipped
        } else if self.evaluated > 0 {
            Status::Passed
        } else {
            Status::NotApplicable
        };
        self
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub footprint: String,
    pub profile: Profile,
    pub conforms_to_checked_rules: bool,
    /// Always false: this is a scoped footprint inspection, never fabrication approval.
    pub complete: bool,
    pub checks: Vec<Check>,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Layer {
    FrontCopper,
    BackCopper,
    InnerCopper,
    FrontMask,
    BackMask,
    FrontPaste,
    BackPaste,
}
fn targets(feature: &Feature, layer: Layer) -> bool {
    feature.layers.iter().any(|role| {
        matches!(
            (role, layer),
            (Role::FrontCopper, Layer::FrontCopper)
                | (Role::BackCopper, Layer::BackCopper)
                | (
                    Role::AllCopper,
                    Layer::FrontCopper | Layer::BackCopper | Layer::InnerCopper
                )
                | (Role::FrontMask, Layer::FrontMask)
                | (Role::BackMask, Layer::BackMask)
                | (Role::AllMask, Layer::FrontMask | Layer::BackMask)
                | (Role::FrontPaste, Layer::FrontPaste)
                | (Role::BackPaste, Layer::BackPaste)
        )
    })
}
fn copper(feature: &Feature) -> bool {
    matches!(feature.purpose, Purpose::Pad | Purpose::Copper)
}
fn entity(footprint: &PhysicalFootprint, feature: &Feature) -> String {
    format!("{}/{}", footprint.key, feature.id)
}
fn apertures(footprint: &PhysicalFootprint, layer: Layer) -> Vec<&Feature> {
    let mut apertures: Vec<_> = footprint
        .features
        .iter()
        .filter(|f| targets(f, layer))
        .collect();
    apertures.sort_by(|a, b| a.id.cmp(&b.id));
    apertures
}
/// Structural drill containment also applies when no process profile is selected.
pub(crate) fn drill_fits(feature: &Feature, ring: i64) -> bool {
    Solid::feature(feature).contains(Solid::drill(feature), ring)
}

pub fn validate(footprint: &PhysicalFootprint, profile: &Profile) -> Result<Report, CompileError> {
    footprint.validate()?;
    profile.validate()?;
    // Stable reporting order independent of declaration order.
    let mut features: Vec<_> = footprint.features.iter().collect();
    features.sort_by(|a, b| a.id.cmp(&b.id));
    let mut checks = Vec::new();
    let mut feature_size = Check::new("copper-feature");
    let mut drills = Check::new("drill-diameter");
    let mut rings = Check::new("annular-ring");
    for f in &features {
        if copper(f) {
            feature_size.evaluate(
                f.shape
                    .size()
                    .iter()
                    .all(|n| *n >= profile.min_copper_feature),
                format!(
                    "copper feature {} is smaller than {}nm",
                    f.id, profile.min_copper_feature
                ),
                entity(footprint, f),
            );
        }
        if let Some(drill) = &f.drill {
            drills.evaluate(
                drill.diameter >= profile.min_drill_diameter,
                format!(
                    "drill {} tool diameter is smaller than {}nm",
                    f.id, profile.min_drill_diameter
                ),
                entity(footprint, f),
            );
            if drill.plated {
                if f.purpose == Purpose::Pad {
                    rings.evaluate(
                        drill_fits(f, profile.min_annular_ring),
                        format!(
                            "pad {} does not enclose its drill with {}nm annular ring",
                            f.id, profile.min_annular_ring
                        ),
                        entity(footprint, f),
                    );
                } else {
                    rings.skip(
                        "plated hole has no associated copper pad; annular ring cannot be checked",
                        &entity(footprint, f),
                    );
                }
            }
        }
    }
    checks.extend([feature_size.finish(), drills.finish(), rings.finish()]);
    let mut spacing = Check::new("copper-spacing");
    for (i, a) in features.iter().enumerate().filter(|(_, f)| copper(f)) {
        for b in features[i + 1..].iter().filter(|f| copper(f)) {
            if [Layer::FrontCopper, Layer::BackCopper, Layer::InnerCopper]
                .into_iter()
                .any(|layer| targets(a, layer) && targets(b, layer))
            {
                spacing.evaluate(Solid::feature(a).separated(Solid::feature(b),profile.min_copper_spacing),
                    format!("copper features {} and {} overlap or have less than {}nm spacing on a shared role",a.id,b.id,profile.min_copper_spacing), entity(footprint,a));
            }
        }
    }
    checks.push(spacing.finish());
    let mut mask_expansion = Check::new("mask-expansion");
    let mut mask_web = Check::new("mask-web");
    let mut paste_size = Check::new("paste-feature");
    let mut paste_containment = Check::new("paste-containment");
    for (copper_layer, mask_layer, paste_layer) in [
        (Layer::FrontCopper, Layer::FrontMask, Layer::FrontPaste),
        (Layer::BackCopper, Layer::BackMask, Layer::BackPaste),
    ] {
        let pads: Vec<_> = features
            .iter()
            .copied()
            .filter(|f| f.purpose == Purpose::Pad && targets(f, copper_layer))
            .collect();
        let mut masks = apertures(footprint, mask_layer);
        masks.sort_by(|a, b| a.id.cmp(&b.id));
        if let Some(expansion) = profile.min_mask_expansion {
            for pad in &pads {
                mask_expansion.evaluate(
                    masks
                        .iter()
                        .any(|mask| Solid::feature(mask).contains(Solid::feature(pad), expansion)),
                    format!(
                        "pad {} lacks a mask opening enclosing its copper by {}nm on this side",
                        pad.id, expansion
                    ),
                    entity(footprint, pad),
                );
            }
        }
        if let Some(web) = profile.min_mask_web {
            if web > 0 {
                for mask in &masks {
                    let covered = pads
                        .iter()
                        .filter(|pad| Solid::feature(mask).contains(Solid::feature(pad), 0))
                        .count();
                    if covered > 1 {
                        mask_web.evaluate(false, format!("shared mask opening {} covers multiple pads, leaving no required web",mask.id),entity(footprint,mask));
                    }
                }
            }
            // A pad's implicit opening and a larger explicit opening represent
            // the same aperture union. Remove contained duplicates before web checks.
            let exposed: Vec<_> = masks
                .iter()
                .enumerate()
                .filter(|(i, a)| {
                    !masks.iter().enumerate().any(|(j, b)| {
                        i != &j
                            && Solid::feature(b).contains(Solid::feature(a), 0)
                            && (!Solid::feature(a).contains(Solid::feature(b), 0) || j < *i)
                    })
                })
                .map(|(_, f)| *f)
                .collect();
            for (i, a) in exposed.iter().enumerate() {
                for b in &exposed[i + 1..] {
                    mask_web.evaluate(
                        Solid::feature(a).separated(Solid::feature(b), web),
                        format!(
                            "mask openings {} and {} overlap or have less than {}nm web",
                            a.id, b.id, web
                        ),
                        entity(footprint, a),
                    );
                }
            }
        }
        let paste = apertures(footprint, paste_layer);
        for aperture in paste {
            paste_containment.evaluate(
                pads.iter()
                    .any(|pad| Solid::feature(pad).contains(Solid::feature(aperture), 0)),
                format!(
                    "paste opening {} is not contained in one copper pad on this side",
                    aperture.id
                ),
                entity(footprint, aperture),
            );
            if let Some(minimum) = profile.min_paste_feature {
                paste_size.evaluate(
                    aperture.shape.size().iter().all(|n| *n >= minimum),
                    format!(
                        "paste opening {} is smaller than {}nm",
                        aperture.id, minimum
                    ),
                    entity(footprint, aperture),
                );
            }
        }
    }
    for (check, selected) in [
        (&mut mask_expansion, profile.min_mask_expansion.is_some()),
        (&mut mask_web, profile.min_mask_web.is_some()),
        (&mut paste_size, profile.min_paste_feature.is_some()),
    ] {
        if !selected {
            check.skip("profile does not select this check", &footprint.key);
        }
    }
    checks.extend([
        mask_expansion.finish(),
        mask_web.finish(),
        paste_containment.finish(),
        paste_size.finish(),
    ]);
    let mut courtyard = Check::new("courtyard-clearance");
    if let Some(clearance) = profile.min_courtyard_clearance {
        for (role, copper_layer) in [
            (Role::FrontCourtyard, Layer::FrontCopper),
            (Role::BackCourtyard, Layer::BackCopper),
        ] {
            let outlines: Vec<_> = features
                .iter()
                .copied()
                .filter(|f| f.purpose == Purpose::Courtyard && f.layers.contains(&role))
                .collect();
            let objects: Vec<_> = features
                .iter()
                .copied()
                .filter(|f| {
                    (copper(f) && targets(f, copper_layer))
                        || (f.purpose == Purpose::Fabrication
                            && f.layers.contains(&if role == Role::FrontCourtyard {
                                Role::FrontFabrication
                            } else {
                                Role::BackFabrication
                            }))
                        || (f.drill.is_some() && !copper(f))
                })
                .collect();
            if objects.is_empty() {
                continue;
            }
            if outlines.is_empty() {
                courtyard.skip(
                    "missing courtyard for this side; package-envelope clearance cannot be checked",
                    &footprint.key,
                );
                continue;
            }
            for object in objects {
                // Documentation stroke contributes to the package envelope, but
                // the courtyard requirement is measured to its declared centerline.
                let margin2 = i128::from(clearance) * 2 + i128::from(object.stroke.unwrap_or(0));
                courtyard.evaluate(
                    outlines.iter().any(|outline| {
                        Solid::feature(outline).contains2(Solid::feature(object), margin2)
                    }),
                    format!(
                        "feature {} is not enclosed by a courtyard with {}nm clearance",
                        object.id, clearance
                    ),
                    entity(footprint, object),
                );
            }
        }
    } else {
        courtyard.skip("profile does not select this check", &footprint.key);
    }
    checks.push(courtyard.finish());
    let mut unverified = Check::new("unverified");
    for message in [
        "manufacturer land-pattern provenance and tolerances are not verified by geometry checks",
        "standalone footprint checks do not evaluate placement, net bindings, board edges, or inter-part courtyards; inspect the board manufacturing report",
        "mask/paste process suitability, paste area ratios, NPTH copper isolation, plating tolerances, and 3D package bodies are not checked",
        "board mask expansion metadata is not applied; explicit physical openings remain authoritative",
        "footprint-local spacing treats distinct features separately; board checks resolve concrete layers and pad net bindings",
    ] {
        unverified.skip(message, &footprint.key);
    }
    checks.push(unverified.finish());
    Ok(Report {
        footprint: footprint.key.clone(),
        profile: profile.clone(),
        conforms_to_checked_rules: !checks.iter().any(|c| c.status == Status::Failed),
        complete: false,
        checks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn profile() -> Profile {
        serde_json::from_value::<ProfileInput>(json!({"schemaVersion":1,"key":"test-process",
            "minCopperFeature":"1nm","minCopperSpacing":"3nm","minDrillDiameter":"1nm","minAnnularRing":"1nm"
        })).unwrap().compile().unwrap()
    }
    fn fixture() -> PhysicalFootprint {
        crate::physical::compile_footprint(serde_json::from_value(json!({"schemaVersion":2,"key":"test:header","features":[
            {"id":"1","purpose":"pad","at":["0nm","0nm"],"shape":{"kind":"circle","diameter":"10nm"},"layers":["all-copper","all-mask"],"drill":{"diameter":"8nm","plated":true}},
            {"id":"2","purpose":"pad","at":["13nm","0nm"],"shape":{"kind":"circle","diameter":"10nm"},"layers":["all-copper","all-mask"],"drill":{"diameter":"8nm","plated":true}}
        ]})).unwrap()).unwrap()
    }
    fn status(report: &Report, id: &str) -> Status {
        report.checks.iter().find(|c| c.id == id).unwrap().status
    }
    #[test]
    fn reports_exact_boundaries_retained_profiles_and_skipped_checks() {
        let footprint = fixture();
        let before = serde_json::to_value(&footprint).unwrap();
        let report = validate(&footprint, &profile()).unwrap();
        assert!(report.conforms_to_checked_rules);
        assert!(!report.complete);
        assert_eq!(report.profile.units, "nm");
        assert_eq!(status(&report, "annular-ring"), Status::Passed);
        assert_eq!(status(&report, "mask-expansion"), Status::Skipped);
        assert_eq!(status(&report, "unverified"), Status::Skipped);
        assert_eq!(serde_json::to_value(&footprint).unwrap(), before);
        let mut policy = profile();
        policy.min_annular_ring = 2;
        assert_eq!(
            status(&validate(&footprint, &policy).unwrap(), "annular-ring"),
            Status::Failed
        );
        policy = profile();
        policy.min_copper_spacing = 4;
        let failed = validate(&footprint, &policy).unwrap();
        assert!(!failed.conforms_to_checked_rules);
        assert_eq!(status(&failed, "copper-spacing"), Status::Failed);
        assert_eq!(
            failed
                .checks
                .iter()
                .find(|c| c.id == "copper-spacing")
                .unwrap()
                .diagnostics[0]
                .entity
                .as_deref(),
            Some("test:header/1")
        );
    }
    #[test]
    fn profiles_reject_invalid_limits_unknown_fields_and_sub_nm_precision() {
        let mut policy = profile();
        policy.min_copper_feature = 0;
        assert!(policy.validate().is_err());
        policy = profile();
        policy.min_annular_ring = -1;
        assert!(policy.validate().is_err());
        policy = profile();
        policy.min_mask_web = Some(9_007_199_254_740_992);
        assert!(policy.validate().is_err());
        policy = profile();
        policy.schema_version = 2;
        assert!(policy.validate().is_err());
        let input = json!({"schemaVersion":1,"key":"bad","minCopperFeature":"0.1nm","minCopperSpacing":"0nm","minDrillDiameter":"1nm","minAnnularRing":"0nm"});
        assert_eq!(
            serde_json::from_value::<ProfileInput>(input.clone())
                .unwrap()
                .compile()
                .unwrap_err()
                .diagnostic
                .code,
            "PCBMFG001"
        );
        let mut unknown = input;
        unknown["pretendRule"] = json!("1nm");
        assert!(serde_json::from_value::<ProfileInput>(unknown).is_err());
    }
    #[test]
    fn curved_paste_cannot_pass_using_only_its_bounding_box() {
        let mut footprint = fixture();
        footprint.features[0].layers.push(Role::FrontPaste);
        let mut paste = footprint.features[0].clone();
        paste.id = "paste".into();
        paste.purpose = Purpose::PasteOpening;
        paste.shape = crate::physical::Shape::Rect { size: [8, 8] };
        paste.layers = vec![Role::FrontPaste];
        paste.drill = None;
        footprint.features.push(paste);
        footprint.bounds = crate::physical::bounds(&footprint.features).unwrap();
        assert_eq!(
            status(
                &validate(&footprint, &profile()).unwrap(),
                "paste-containment"
            ),
            Status::Failed
        );
    }
    #[test]
    fn reports_missing_courtyards_and_plated_holes_without_copper() {
        let mut footprint = fixture();
        footprint.features[0].purpose = Purpose::PlatedHole;
        footprint.features[0].layers.clear();
        footprint.features[0].shape = crate::physical::Shape::Circle { diameter: 8 };
        footprint.bounds = crate::physical::bounds(&footprint.features).unwrap();
        let mut policy = profile();
        policy.min_courtyard_clearance = Some(1);
        let report = validate(&footprint, &policy).unwrap();
        assert_eq!(status(&report, "annular-ring"), Status::Partial);
        assert_eq!(status(&report, "courtyard-clearance"), Status::Skipped);
    }
}
