//! Canonical PCB intermediate representation and compiler.

mod compiler;
mod diagnostic;
mod ir;
mod protocol;

pub use compiler::{CompileError, CompileOutput, compile};
pub use diagnostic::{Diagnostic, Severity};
pub use ir::{
    Board, BoardIr, BoardSide, ComponentInstance, CopperUsage, LayerSet, LengthUnit,
    MechanicalPurpose, NetId, PinRef, Rect, Revision, RouteConstraint, Stackup, StackupLayer,
    TechnicalLayer,
};
pub use protocol::{DeclarationNode, DeclarationTransaction, DeclarationTree, PROTOCOL_VERSION};
