//! Structural keepout checks on available realization; no manufacturing profile.
//! Region references establish ownership. Courtyard sides come from layer metadata.
use crate::geometry::Solid;
use crate::ir::regions::CheckedRegions;
use crate::physical::Purpose;
use crate::{BoardIr, Diagnostic, KeepoutRestriction, MechanicalPurpose, TechnicalLayer};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub(crate) struct Findings {
    pub evaluated: usize,
    pub skipped: usize,
    pub diagnostics: Vec<Diagnostic>,
}

impl Findings {
    fn unverified(&mut self, owner: &str, message: impl Into<String>) {
        self.skipped += 1;
        self.diagnostics.push(
            Diagnostic::warning("PCBIR041", message)
                .with_entity(owner)
                .with_help("Keepout coverage is incomplete. Supply canonical physical geometry, placement or explicit courtyard reservations; a future router/fill engine must supply tracks, vias and zone fills."),
        );
    }
}

/// Call after region/reference validation and verification of authoritative world
/// geometry. The compiler constructs that geometry; serialized consumers verify it.
pub(crate) fn validate_keepouts(ir: &BoardIr, regions: &CheckedRegions) -> Findings {
    let mut findings = Findings::default();
    let courtyard_sides: BTreeMap<_, _> = ir
        .board
        .layers
        .technical
        .iter()
        .filter_map(|layer| match layer {
            TechnicalLayer::Mechanical {
                id,
                purpose: MechanicalPurpose::Courtyard,
                side: Some(side),
            } => Some((id.as_str(), side.clone())),
            _ => None,
        })
        .collect();
    let mut keepouts: Vec<_> = ir.keepouts.iter().collect();
    keepouts.sort_by(|a, b| a.id.cmp(&b.id));
    let mut parts: Vec<_> = ir.parts.iter().collect();
    parts.sort_by(|a, b| a.id.cmp(&b.id));
    for keepout in keepouts {
        // Completely off-board intent has no on-board prohibition to evaluate.
        let Some(rect) = regions.on_board[&keepout.region] else {
            continue;
        };
        let area = Solid::rectangle(rect);
        let copper = keepout.disallow.contains(&KeepoutRestriction::Copper);
        let components = keepout.disallow.contains(&KeepoutRestriction::Components);
        let layers = keepout.copper_layers.join(", ");
        for (restricted, kind) in [
            (
                copper || keepout.disallow.contains(&KeepoutRestriction::Tracks),
                "tracks",
            ),
            (
                copper || keepout.disallow.contains(&KeepoutRestriction::Vias),
                "vias",
            ),
            (copper, "zone fills"),
        ] {
            if restricted {
                findings.unverified(&keepout.id, format!("keepout {} region {}: realized {kind} are unavailable on layers [{layers}]; enforcement is unverified", keepout.id, keepout.region));
            }
        }
        if !copper && !components {
            continue;
        }
        for part in &parts {
            let placement_side_selected =
                components && keepout.component_sides.contains(&part.side);
            if !copper && !placement_side_selected && part.physical_features.is_empty() {
                continue;
            }
            let footprint = &ir.footprint_definitions[&part.footprint];
            let missing = if part.at.is_none() {
                Some("placement is missing")
            } else if footprint.physical.is_none() || part.physical_features.is_empty() {
                Some("canonical physical geometry is missing")
            } else {
                None
            };
            if let Some(reason) = missing {
                findings.unverified(&keepout.id, format!("keepout {} region {}: part {} {reason}; applicable copper/reservation checks are unverified", keepout.id, keepout.region, part.id));
                continue;
            }
            let mut reserved_sides = BTreeSet::new();
            for placed in part.physical_features.values() {
                let feature = &placed.geometry;
                let solid = Solid::feature(feature);
                if copper && matches!(feature.purpose, Purpose::Pad | Purpose::Copper) {
                    // Only pads have authoritative electrical ownership in current IR.
                    // A connection on another feature never exempts unknown-net copper.
                    let net = (feature.purpose == Purpose::Pad)
                        .then(|| crate::realization::pad_net(part, &feature.id))
                        .flatten();
                    for layer in placed
                        .layers
                        .iter()
                        .filter(|id| keepout.copper_layers.contains(id))
                    {
                        findings.evaluated += 1;
                        // A drill is an explicit void in pad copper. Exact containment
                        // permits a region wholly inside it, including boundary contact.
                        let inside_drill = feature.drill.as_ref().is_some_and(|_| {
                            let drill = Solid::drill(feature);
                            drill.contains(area, 0) || drill.contains(solid, 0)
                        });
                        if !net.is_some_and(|net| keepout.except.contains(net))
                            && !inside_drill
                            && !area.separated(solid, 0)
                        {
                            findings.diagnostics.push(Diagnostic::error("PCBIR040", format!("keepout {} region {} prohibits copper feature {} of part {} on layer {}: interior overlap", keepout.id, keepout.region, feature.id, part.id, layer))
                                .with_entity(&keepout.id)
                                .with_help("Move the feature or keepout, change the explicit copper layer scope, or exempt its authoritatively bound net. Unknown-net copper remains restricted."));
                        }
                    }
                }
                if components && feature.purpose == Purpose::Courtyard {
                    let sides: BTreeSet<_> = placed
                        .layers
                        .iter()
                        .filter_map(|layer| courtyard_sides.get(layer.as_str()))
                        .cloned()
                        .collect();
                    reserved_sides.extend(sides.iter().cloned());
                    for side in sides
                        .iter()
                        .filter(|side| keepout.component_sides.contains(side))
                    {
                        findings.evaluated += 1;
                        if !area.separated(solid, 0) {
                            let side = if *side == crate::BoardSide::Front {
                                "front"
                            } else {
                                "back"
                            };
                            findings.diagnostics.push(Diagnostic::error("PCBIR040", format!("keepout {} region {} prohibits courtyard reservation {} of part {} on the {} side: interior overlap", keepout.id, keepout.region, feature.id, part.id, side))
                                .with_entity(&keepout.id)
                                .with_help("Move the part or keepout, or change the explicit component side scope. Net exceptions do not exempt component reservations."));
                        }
                    }
                }
            }
            if placement_side_selected && !reserved_sides.contains(&part.side) {
                findings.unverified(&keepout.id, format!("keepout {} region {}: part {} has no explicit courtyard reservation on its placement side; component enforcement is unverified", keepout.id, keepout.region, part.id));
            }
        }
    }
    findings
}
