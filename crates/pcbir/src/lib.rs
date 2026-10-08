//! Canonical PCB intermediate representation and compiler.

mod compiler;
mod diagnostic;
mod ir;
pub mod physical;
mod protocol;

pub use compiler::{CompileError, CompileOutput, compile};
pub use diagnostic::{Diagnostic, Severity};
pub use ir::{
    Board, BoardIr, BoardSide, ComponentDefinition, CopperUsage, DatasheetSource, ElectricalType,
    LayerSet, LengthUnit, MechanicalPurpose, NetDefinition, NetId, PartInstance, PinDefinition,
    PinRef, PinoutCoverage, Rect, Revision, RouteConstraint, SCHEMA_VERSION, Stackup, StackupLayer,
    TechnicalLayer,
};
pub use ir::{
    CopperLayerSelector, FootprintDefinition, FootprintPad, PadDrill, PadLayer, PadShape,
};
pub use protocol::{DeclarationNode, DeclarationTransaction, DeclarationTree, PROTOCOL_VERSION};

pub use ir::{DifferentialPairConstraint, KeepoutConstraint, RegionDefinition, ZoneConstraint};

pub mod svg;
pub use svg::footprint_svg;
pub mod board_svg;
pub use board_svg::{BoardProjection, board_svg};

pub mod layout;

pub mod manufacturing;
