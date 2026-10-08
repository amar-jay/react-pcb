use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

mod board;
mod component;
mod constraints;
mod footprint;
mod geometry;
mod routing;

pub use board::{
    Board, BoardSide, CopperUsage, LayerSet, LengthUnit, MechanicalPurpose, Stackup, StackupLayer,
    TechnicalLayer,
};
pub use component::PartInstance;
pub use constraints::{DifferentialPairConstraint, KeepoutConstraint, ZoneConstraint};
pub use footprint::{
    CopperLayerSelector, FootprintDefinition, FootprintPad, PadDrill, PadLayer, PadShape,
};
pub use geometry::{Rect, RegionDefinition};
pub use routing::{NetId, PinRef, RouteConstraint};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Revision(pub u64);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardIr {
    pub revision: Revision,
    pub units: LengthUnit,
    pub board: Board,
    pub component_definitions: BTreeMap<String, Value>,
    pub footprint_definitions: BTreeMap<String, FootprintDefinition>,
    pub parts: Vec<PartInstance>,
    pub nets: Vec<NetId>,
    pub route_constraints: Vec<RouteConstraint>,
    pub differential_pairs: Vec<DifferentialPairConstraint>,
    pub zones: Vec<ZoneConstraint>,
    pub keepouts: Vec<KeepoutConstraint>,
    pub regions: BTreeMap<String, RegionDefinition>,
}
