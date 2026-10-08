use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use serde::Serialize;
use serde_json::Value;

use crate::diagnostic::{Diagnostic, Severity};
use crate::ir::{BoardIr, ComponentInstance, NetId, Revision, RouteConstraint};
use crate::protocol::{DeclarationNode, DeclarationTransaction, PROTOCOL_VERSION};

mod parse;
mod validate;

use parse::{parse_board, parse_part, parse_route, parse_units};
use validate::{validate_instances, validate_route_endpoint};

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileOutput {
    pub ir: BoardIr,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug)]
pub struct CompileError(pub String);

impl fmt::Display for CompileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for CompileError {}

pub fn compile(transaction: DeclarationTransaction) -> Result<CompileOutput, CompileError> {
    if transaction.protocol_version != PROTOCOL_VERSION {
        return Err(CompileError(format!(
            "unsupported protocol version {}; expected {PROTOCOL_VERSION}",
            transaction.protocol_version
        )));
    }
    if transaction.declarations.kind != "react-pcb-declarations" {
        return Err(CompileError("invalid declaration tree kind".into()));
    }
    if transaction.declarations.children.len() != 1 {
        return Err(CompileError(
            "a design must contain exactly one board".into(),
        ));
    }

    let board_node = &transaction.declarations.children[0];
    if board_node.node_type != "pcb-board" {
        return Err(CompileError(
            "the declaration root must be pcb-board".into(),
        ));
    }

    let units = parse_units(&board_node.props)?;
    let board = parse_board(&board_node.props)?;
    let mut component_definitions = BTreeMap::new();
    let mut component_instances = Vec::new();
    let mut routes = Vec::new();
    let mut nets = BTreeSet::new();
    let mut diagnostics = Vec::new();

    compile_nodes(
        &board_node.children,
        &mut component_definitions,
        &mut component_instances,
        &mut routes,
        &mut nets,
        &mut diagnostics,
    )?;

    validate_instances(&component_instances, &component_definitions)?;

    let known_instances: BTreeMap<_, _> = component_instances
        .iter()
        .map(|instance| (instance.id.as_str(), instance))
        .collect();
    for route in &routes {
        for endpoint in [&route.from, &route.to] {
            let Some(instance) = known_instances.get(endpoint.part.as_str()) else {
                diagnostics.push(Diagnostic {
                    code: "PCBIR002",
                    severity: Severity::Error,
                    message: format!("route references unknown part {}", endpoint.part),
                    entity: Some(endpoint.part.clone()),
                });
                continue;
            };
            validate_route_endpoint(
                route,
                endpoint,
                instance,
                &component_definitions,
                &mut diagnostics,
            );
        }
    }

    Ok(CompileOutput {
        ir: BoardIr {
            revision: Revision(transaction.base_revision.unwrap_or(0) + 1),
            units,
            board,
            component_definitions,
            component_instances,
            nets: nets.into_iter().collect(),
            route_constraints: routes,
        },
        diagnostics,
    })
}

fn compile_nodes(
    nodes: &[DeclarationNode],
    component_definitions: &mut BTreeMap<String, Value>,
    component_instances: &mut Vec<ComponentInstance>,
    routes: &mut Vec<RouteConstraint>,
    nets: &mut BTreeSet<NetId>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<(), CompileError> {
    for child in nodes {
        match child.node_type.as_str() {
            "pcb-module" => compile_nodes(
                &child.children,
                component_definitions,
                component_instances,
                routes,
                nets,
                diagnostics,
            )?,
            "pcb-part" => {
                let (instance, definition) = parse_part(&child.props)?;
                if component_instances
                    .iter()
                    .any(|existing| existing.id == instance.id)
                {
                    return Err(CompileError(format!(
                        "duplicate component instance id {}",
                        instance.id
                    )));
                }
                if let Some(existing) = component_definitions.get(&instance.definition) {
                    if existing != &definition {
                        return Err(CompileError(format!(
                            "component definition {} conflicts with an existing definition",
                            instance.definition
                        )));
                    }
                } else {
                    component_definitions.insert(instance.definition.clone(), definition);
                }
                nets.extend(instance.connections.values().cloned());
                component_instances.push(instance);
            }
            "pcb-route" => {
                let route = parse_route(child)?;
                nets.insert(route.net.clone());
                routes.push(route);
            }
            other => diagnostics.push(Diagnostic {
                code: "PCBIR001",
                severity: Severity::Warning,
                message: format!("declaration {other} is not compiled yet"),
                entity: None,
            }),
        }
    }
    Ok(())
}
