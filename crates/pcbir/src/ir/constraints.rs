use super::{BoardIr, BoardSide, LayerSet, NetId, PinRef, StackupLayer};
use crate::{CompileError, Diagnostic};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DifferentialPairConstraint {
    pub id: String,
    pub positive: NetId,
    pub negative: NetId,
    pub from: [PinRef; 2],
    pub to: [PinRef; 2],
    pub width: Option<f64>,
    pub gap: Option<f64>,
    pub target_impedance: Option<f64>,
    /// Ordered centerline waypoints, shared by both legs; not an exclusive corridor.
    pub through: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ZoneConstraint {
    pub id: String,
    pub net: NetId,
    pub layers: Vec<String>,
    pub boundary: String,
    pub clearance: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeepoutRestriction {
    Components,
    Copper,
    Tracks,
    Vias,
}

impl KeepoutRestriction {
    pub fn is_electrical(self) -> bool {
        self != Self::Components
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KeepoutConstraint {
    pub id: String,
    pub region: String,
    pub disallow: Vec<KeepoutRestriction>,
    /// Both sides by default; empty when component reservations are not restricted.
    pub component_sides: Vec<BoardSide>,
    /// Concrete board copper IDs; empty when electrical objects are not restricted.
    pub copper_layers: Vec<String>,
    pub except: Vec<NetId>,
}

pub(crate) fn validate_keepout_scope(
    keepout: &KeepoutConstraint,
    layers: &LayerSet,
) -> Result<(), CompileError> {
    let invalid = |message: &str| {
        CompileError::diagnostic(
        Diagnostic::error("PCBIR035", message).with_entity(&keepout.id)
            .with_help("Use nonempty, unique componentSides for components and copperLayers for electrical restrictions. Net exceptions apply only to electrical objects."),
    )
    };
    let components = keepout.disallow.contains(&KeepoutRestriction::Components);
    let electrical = keepout.disallow.iter().any(|r| r.is_electrical());
    if keepout.disallow.is_empty()
        || keepout.disallow.iter().collect::<BTreeSet<_>>().len() != keepout.disallow.len()
    {
        return Err(invalid("keepout restrictions must be nonempty and unique"));
    }
    let has_component_scope = !keepout.component_sides.is_empty();
    if components != has_component_scope
        || keepout
            .component_sides
            .iter()
            .collect::<BTreeSet<_>>()
            .len()
            != keepout.component_sides.len()
    {
        return Err(invalid(
            "keepout componentSides must be nonempty and unique exactly when components are restricted",
        ));
    }
    let has_electrical_scope = !keepout.copper_layers.is_empty();
    if electrical != has_electrical_scope
        || keepout.copper_layers.iter().collect::<BTreeSet<_>>().len()
            != keepout.copper_layers.len()
    {
        return Err(invalid(
            "keepout copperLayers must be nonempty and unique exactly when electrical objects are restricted",
        ));
    }
    let copper: BTreeSet<_> = layers
        .stackup
        .entries
        .iter()
        .filter_map(|layer| match layer {
            StackupLayer::Copper { id, .. } => Some(id.as_str()),
            _ => None,
        })
        .collect();
    if keepout
        .copper_layers
        .iter()
        .any(|id| id.trim().is_empty() || !copper.contains(id.as_str()))
    {
        return Err(invalid(
            "keepout copperLayers references an unknown or non-copper board layer",
        ));
    }
    if (!electrical && !keepout.except.is_empty())
        || keepout.except.iter().any(|id| id.0.trim().is_empty())
        || keepout.except.iter().collect::<BTreeSet<_>>().len() != keepout.except.len()
    {
        return Err(invalid(
            "keepout net exceptions require electrical restrictions and nonempty, unique net IDs",
        ));
    }
    Ok(())
}

pub(crate) fn validate_constraint_scopes(ir: &BoardIr) -> Result<(), CompileError> {
    for keepout in &ir.keepouts {
        validate_keepout_scope(keepout, &ir.board.layers)?;
    }
    Ok(())
}
