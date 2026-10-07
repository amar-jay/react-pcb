//! Canonical PCB intermediate representation and compiler.

mod compiler;
mod diagnostic;
mod ir;
mod protocol;

pub use compiler::{CompileError, CompileOutput, compile};
pub use diagnostic::{Diagnostic, Severity};
pub use ir::{
    Board, BoardIr, BoardSide, CopperUsage, LayerSet, LengthUnit, MechanicalPurpose, NetId, Part,
    PinRef, Rect, Revision, RouteConstraint, Stackup, StackupLayer, TechnicalLayer,
};
pub use protocol::{DeclarationNode, DeclarationTransaction, DeclarationTree, PROTOCOL_VERSION};
