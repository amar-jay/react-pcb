//! Authoritative placed geometry and pin-to-pad net bindings, independent of policy.
use crate::{BoardIr, BoardSide, CompileError, Diagnostic, NetId, PartInstance};
use std::collections::BTreeSet;

fn invalid(message: &str) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBFP001", message))
}

pub(crate) fn pad_net<'a>(part: &'a PartInstance, id: &str) -> Option<&'a NetId> {
    let nets: BTreeSet<_> = part
        .pin_map
        .iter()
        .filter(|(_, pads)| pads.iter().any(|pad| pad == id))
        .filter_map(|(pin, _)| part.connections.get(pin))
        .collect();
    (nets.len() == 1).then(|| *nets.first().unwrap())
}
pub(crate) fn validate_realization(ir: &BoardIr) -> Result<(), CompileError> {
    if ir.schema_version != crate::SCHEMA_VERSION || ir.board.id.trim().is_empty() {
        return Err(invalid(
            "board checks require current canonical board IR and a nonempty board ID",
        ));
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
                let at = [
                    crate::ir::regions::board_length(at[0], ir.units)?,
                    crate::ir::regions::board_length(at[1], ir.units)?,
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
    Ok(())
}
