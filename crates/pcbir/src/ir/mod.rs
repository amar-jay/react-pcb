use serde::{Deserialize, Serialize};
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
pub use component::{
    ComponentDefinition, DatasheetSource, ElectricalType, PartInstance, PinDefinition,
    PinoutCoverage,
};
pub use constraints::{DifferentialPairConstraint, KeepoutConstraint, ZoneConstraint};
pub use footprint::{
    CopperLayerSelector, FootprintDefinition, FootprintPad, PadDrill, PadLayer, PadShape,
};
pub use geometry::{Rect, RegionDefinition};
pub use routing::{NetDefinition, NetId, PinRef, RouteConstraint};

pub const SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Revision(pub u64);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardIr {
    pub schema_version: u32,
    pub revision: Revision,
    pub units: LengthUnit,
    pub board: Board,
    pub component_definitions: BTreeMap<String, ComponentDefinition>,
    pub footprint_definitions: BTreeMap<String, FootprintDefinition>,
    pub parts: Vec<PartInstance>,
    pub nets: Vec<NetDefinition>,
    pub route_constraints: Vec<RouteConstraint>,
    pub differential_pairs: Vec<DifferentialPairConstraint>,
    pub zones: Vec<ZoneConstraint>,
    pub keepouts: Vec<KeepoutConstraint>,
    pub regions: BTreeMap<String, RegionDefinition>,
}
