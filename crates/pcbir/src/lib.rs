//! Canonical PCB intermediate representation and compiler.

mod compiler;
mod diagnostic;
mod ir;
mod protocol;

pub use compiler::{CompileError, CompileOutput, compile};
pub use diagnostic::{Diagnostic, Severity};
pub use ir::{
    ArtworkLayer, Board, BoardIr, BoardSide, CopperRole, LayerSet, MechanicalPurpose, NetId, Part,
    PinRef, Rect, Revision, RouteConstraint, Stackup, StackupLayer,
};
pub use protocol::{DeclarationNode, DeclarationTransaction, DeclarationTree, PROTOCOL_VERSION};
