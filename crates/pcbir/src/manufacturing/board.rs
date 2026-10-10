//! Checks on canonical placed geometry, concrete board layers and stable net IDs.
use super::{Check, Profile, ProfileInput, Status, copper, geometry::Solid, invalid};
use crate::physical::{PlacedFeature, Purpose};
use crate::{
    BoardIr, BoardSide, CompileError, LengthUnit, MechanicalPurpose, NetId, PartInstance,
    StackupLayer, TechnicalLayer,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BoardValidationInput {
    pub board: BoardIr,
    pub profile: ProfileInput,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardReport {
    pub board: String,
    pub profile: Profile,
    pub conforms_to_checked_rules: bool,
    /// Scoped placed-copper/courtyard inspection, not full board DRC.
    pub complete: bool,
    pub checks: Vec<Check>,
}
struct Object<'a> {
    part: &'a PartInstance,
    feature: &'a PlacedFeature,
    solid: Solid,
    net: Option<&'a NetId>,
}
fn pad_net<'a>(part: &'a PartInstance, id: &str) -> Option<&'a NetId> {
    let nets: BTreeSet<_> = part
        .pin_map
        .iter()
        .filter(|(_, pads)| pads.iter().any(|pad| pad == id))
        .filter_map(|(pin, _)| part.connections.get(pin))
        .collect();
    (nets.len() == 1).then(|| *nets.first().unwrap())
}
fn validate_realization(ir: &BoardIr) -> Result<(), CompileError> {
    if ir.schema_version != crate::SCHEMA_VERSION || ir.board.id.trim().is_empty() {
        return Err(invalid(
            "board checks require current canonical board IR and a nonempty board ID",
        ));
    }
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
            return Err(invalid("board layer IDs must be nonempty and unique"));
        }
    }
    if !ir
        .board
        .layers
        .stackup
        .entries
        .iter()
        .any(|layer| matches!(layer, StackupLayer::Copper { .. }))
    {
        return Err(invalid("board checks require concrete copper layers"));
    }
    let mut nets = BTreeSet::new();
    for net in &ir.nets {
        if net.id.0.trim().is_empty() || !nets.insert(&net.id) {
            return Err(invalid("board net IDs must be nonempty and unique"));
        }
    }
    let mut ids = BTreeSet::new();
    for part in &ir.parts {
        if part.id.trim().is_empty() || !ids.insert(&part.id) {
            return Err(invalid("board part IDs must be nonempty and unique"));
        }
        if !ir.component_definitions.contains_key(&part.component)
            || !ir.footprint_definitions.contains_key(&part.footprint)
        {
            return Err(invalid(
                "placed part references a missing component or footprint definition",
            ));
        }
        if part.connections.values().any(|net| !nets.contains(net)) {
            return Err(invalid(
                "placed part connection references a missing net ID",
            ));
        }
    }
    crate::compiler::validate::validate_instances(
        &ir.parts,
        &ir.component_definitions,
        &ir.footprint_definitions,
    )?;
    for part in &ir.parts {
        match (&ir.footprint_definitions[&part.footprint].physical, part.at) {
            (Some(physical), Some(at)) => {
                if ![0.0, 90.0, 180.0, 270.0].contains(&part.rotation) {
                    return Err(invalid(
                        "physical board checks require quarter-turn placement",
                    ));
                }
                let unit = match ir.units {
                    LengthUnit::Mm => "mm",
                    LengthUnit::Mil => "mil",
                    LengthUnit::In => "in",
                };
                let at = [
                    crate::physical::length(&format!("{}{unit}", at[0]))?,
                    crate::physical::length(&format!("{}{unit}", at[1]))?,
                ];
                let expected = physical.place(
                    at,
                    part.rotation as u16,
                    part.side == BoardSide::Back,
                    &ir.board.layers,
                )?;
                if expected != part.physical_features {
                    return Err(invalid(
                        "placed geometry does not match its footprint, transform and concrete layers",
                    ));
                }
            }
            _ if !part.physical_features.is_empty() => {
                return Err(invalid(
                    "world geometry requires a placed part and a canonical physical footprint",
                ));
            }
            _ => {}
        }
    }
    let outline = ir
        .regions
        .get(&ir.board.outline)
        .ok_or_else(|| invalid("board outline region is missing"))?;
    let mut outside =
        crate::compiler::validate::validate_board_outline(&ir.parts, &outline.geometry, ir.units)?;
    if !outside.is_empty() {
        let fatal = outside.remove(0);
        return Err(CompileError::diagnostic(fatal).with_diagnostics(outside));
    }
    Ok(())
}

pub fn validate_board(ir: &BoardIr, profile: &Profile) -> Result<BoardReport, CompileError> {
    profile.validate()?;
    validate_realization(ir)?;
    let copper_ids: BTreeSet<_> = ir
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
            } => Some((id.as_str(), side)),
            _ => None,
        })
        .collect();
    let mut parts: Vec<_> = ir.parts.iter().collect();
    parts.sort_by(|a, b| a.id.cmp(&b.id));
    let mut spacing = Check::new("board-copper-spacing");
    let mut courtyard = Check::new("inter-part-courtyard");
    let courtyard_selected = profile.min_courtyard_clearance.is_some();
    if !courtyard_selected {
        courtyard.skip("profile does not select courtyard checks", &ir.board.id);
    }
    let mut by_layer: BTreeMap<&str, Vec<Object<'_>>> = BTreeMap::new();
    let mut front = Vec::new();
    let mut back = Vec::new();
    for part in parts {
        if part.physical_features.is_empty() {
            let reason = if part.at.is_none() {
                "part is unplaced; placed-board checks are unavailable"
            } else {
                "part has no canonical physical geometry; placed-board checks are unavailable"
            };
            spacing.skip(reason, &part.id);
            if courtyard_selected {
                courtyard.skip(reason, &part.id);
            }
            continue;
        }
        let mut has_front = false;
        let mut has_back = false;
        for placed in part.physical_features.values() {
            if copper(&placed.geometry) {
                let net = if placed.geometry.purpose == Purpose::Pad {
                    pad_net(part, &placed.geometry.id)
                } else {
                    None
                };
                for layer in placed
                    .layers
                    .iter()
                    .filter(|id| copper_ids.contains(id.as_str()))
                {
                    by_layer.entry(layer).or_default().push(Object {
                        part,
                        feature: placed,
                        solid: Solid::feature(&placed.geometry),
                        net,
                    });
                }
            }
            if courtyard_selected && placed.geometry.purpose == Purpose::Courtyard {
                // Side comes from concrete layer metadata, never ID spelling or part side alone.
                for side in [BoardSide::Front, BoardSide::Back] {
                    if placed.layers.iter().any(|id| {
                        courtyard_sides
                            .get(id.as_str())
                            .is_some_and(|layer_side| **layer_side == side)
                    }) {
                        let object = Object {
                            part,
                            feature: placed,
                            solid: Solid::feature(&placed.geometry),
                            net: None,
                        };
                        if side == BoardSide::Front {
                            has_front = true;
                            front.push(object);
                        } else {
                            has_back = true;
                            back.push(object);
                        }
                    }
                }
            }
        }
        if courtyard_selected
            && !(if part.side == BoardSide::Front {
                has_front
            } else {
                has_back
            })
        {
            courtyard.skip("part has no declared courtyard on its placement side; inter-part envelope checks are unavailable for that side", &part.id);
        }
    }
    for (layer, objects) in by_layer {
        for (i, a) in objects.iter().enumerate() {
            for b in &objects[i + 1..] {
                let same_net = a.net.is_some() && a.net == b.net;
                spacing.evaluate(
                    same_net || a.solid.separated(b.solid, profile.min_copper_spacing),
                    format!(
                        "copper feature {} of part {} and feature {} of part {} overlap or have less than {}nm spacing on layer {}",
                        a.feature.geometry.id,
                        a.part.id,
                        b.feature.geometry.id,
                        b.part.id,
                        profile.min_copper_spacing,
                        layer,
                    ),
                    a.part.id.clone(),
                );
            }
        }
    }
    for (side, objects) in [("front", front), ("back", back)] {
        for (i, a) in objects.iter().enumerate() {
            for b in &objects[i + 1..] {
                if a.part.id == b.part.id {
                    continue;
                }
                // Courtyards already encode enclosure margins. Compare reserved areas
                // at their centerlines, without adding the margin a second time.
                courtyard.evaluate(
                    a.solid.separated(b.solid, 0),
                    format!(
                        "courtyard {} of part {} overlaps courtyard {} of part {} on the {} side",
                        a.feature.geometry.id, a.part.id, b.feature.geometry.id, b.part.id, side
                    ),
                    a.part.id.clone(),
                );
            }
        }
    }
    let mut unverified = Check::new("unverified");
    unverified.skip("board-edge manufacturing clearances, routed traces/vias, realized zones, board-level mask/paste, NPTH isolation, and 3D package bodies are not checked", &ir.board.id);
    let checks = vec![spacing.finish(), courtyard.finish(), unverified.finish()];
    Ok(BoardReport {
        board: ir.board.id.clone(),
        profile: profile.clone(),
        conforms_to_checked_rules: !checks.iter().any(|check| check.status == Status::Failed),
        complete: false,
        checks,
    })
}
