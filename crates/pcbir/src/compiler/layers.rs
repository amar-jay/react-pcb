use std::collections::{BTreeMap, BTreeSet};

use super::CompileError;
use crate::Diagnostic;
use crate::ir::{
    BoardSide, FootprintDefinition, LayerSet, PadLayer, PartInstance, StackupLayer, TechnicalLayer,
};

fn error(message: impl Into<String>, entity: &str) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBIR028", message).with_entity(entity)
        .with_help("Reference a copper, solder-mask, or paste layer declared by the board; provide its opposite-side layer for back-side placement."))
}

pub fn resolve_pad_layers(
    parts: &mut [PartInstance],
    footprints: &BTreeMap<String, FootprintDefinition>,
    layers: &LayerSet,
) -> Result<(), CompileError> {
    let copper: Vec<_> = layers
        .stackup
        .entries
        .iter()
        .filter_map(|layer| match layer {
            StackupLayer::Copper { id, .. } => Some(id.as_str()),
            _ => None,
        })
        .collect();
    let mut mirror = BTreeMap::new();
    for (index, id) in copper.iter().enumerate() {
        mirror.insert(*id, copper[copper.len() - 1 - index]);
    }
    // Technical layers are paired by kind and side, never by their ID spelling.
    for layer in &layers.technical {
        let (side, kind) = match layer {
            TechnicalLayer::SolderMask { side, .. } => (side, "mask"),
            TechnicalLayer::Paste { side, .. } => (side, "paste"),
            _ => continue,
        };
        let opposite: Vec<_> = layers
            .technical
            .iter()
            .filter(|other| match other {
                TechnicalLayer::SolderMask {
                    side: other_side, ..
                } => kind == "mask" && side != other_side,
                TechnicalLayer::Paste {
                    side: other_side, ..
                } => kind == "paste" && side != other_side,
                _ => false,
            })
            .collect();
        if opposite.len() == 1 {
            mirror.insert(layer.id(), opposite[0].id());
        }
    }
    let valid: BTreeSet<_> = copper
        .iter()
        .copied()
        .chain(layers.technical.iter().filter_map(|layer| match layer {
            TechnicalLayer::SolderMask { id, .. } | TechnicalLayer::Paste { id, .. } => {
                Some(id.as_str())
            }
            _ => None,
        }))
        .collect();
    for part in parts {
        let footprint = &footprints[&part.footprint];
        for pad in &footprint.pads {
            let mut resolved = BTreeSet::new();
            for target in &pad.layers {
                match target {
                    PadLayer::Role { role } => {
                        for id in role.resolve(layers, part.side == BoardSide::Back)? {
                            if !resolved.insert(id) {
                                return Err(error("overlapping semantic pad layers", &part.id));
                            }
                        }
                    }
                    PadLayer::Id(id) => {
                        if !valid.contains(id.as_str()) {
                            return Err(error(
                                format!(
                                    "pad {} references unknown or unsupported layer {id}",
                                    pad.id
                                ),
                                &part.id,
                            ));
                        }
                        let actual = if part.side == BoardSide::Back {
                            *mirror.get(id.as_str()).ok_or_else(|| {
                                error(
                                    format!("layer {id} has no unique opposite-side layer"),
                                    &part.id,
                                )
                            })?
                        } else {
                            id.as_str()
                        };
                        if !resolved.insert(actual.to_owned()) {
                            return Err(error(
                                format!("pad {} targets layer {actual} more than once", pad.id),
                                &part.id,
                            ));
                        }
                    }
                    PadLayer::Selector(_) => {
                        for id in &copper {
                            if !resolved.insert((*id).to_owned()) {
                                return Err(error(
                                    format!("pad {} has overlapping copper layer targets", pad.id),
                                    &part.id,
                                ));
                            }
                        }
                    }
                }
            }
            part.pad_layers
                .insert(pad.id.clone(), resolved.into_iter().collect());
        }
    }
    Ok(())
}
