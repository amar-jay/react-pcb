use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use serde::Serialize;
use serde_json::Value;

use crate::diagnostic::Diagnostic;
use crate::ir::{BoardIr, ComponentInstance, NetId, Revision, RouteConstraint};
use crate::protocol::{DeclarationNode, DeclarationTransaction, PROTOCOL_VERSION};

mod parse;
mod validate;

use parse::{constraint_key, parse_board, parse_part, parse_route, parse_units};
use validate::{validate_instances, validate_route_endpoint};

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileOutput {
    pub ir: BoardIr,
    pub diagnostics: Vec<Diagnostic>,
    pub compiler_diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Serialize)]
pub struct CompileError {
    pub diagnostic: Diagnostic,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<Diagnostic>,
}

impl CompileError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self {
            diagnostic: Diagnostic::error("PCBIR100", message),
            diagnostics: Vec::new(),
        }
    }

    pub fn diagnostic(diagnostic: Diagnostic) -> Self {
        Self {
            diagnostic,
            diagnostics: Vec::new(),
        }
    }

    pub fn with_diagnostics(mut self, diagnostics: Vec<Diagnostic>) -> Self {
        self.diagnostics = diagnostics;
        self
    }
}

impl fmt::Display for CompileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.diagnostic.message)
    }
}

impl std::error::Error for CompileError {}

pub fn compile(transaction: DeclarationTransaction) -> Result<CompileOutput, CompileError> {
    if transaction.protocol_version != PROTOCOL_VERSION {
        return Err(CompileError::invalid(format!(
            "unsupported protocol version {}; expected {PROTOCOL_VERSION}",
            transaction.protocol_version
        )));
    }
    if transaction.declarations.kind != "react-pcb-declarations" {
        return Err(CompileError::invalid("invalid declaration tree kind"));
    }
    if transaction.declarations.children.len() != 1 {
        return Err(CompileError::invalid(
            "a design must contain exactly one board",
        ));
    }

    let board_node = &transaction.declarations.children[0];
    if board_node.node_type != "pcb-board" {
        return Err(CompileError::invalid(
            "the declaration root must be pcb-board",
        ));
    }

    let units = parse_units(&board_node.props)?;
    let board = parse_board(&board_node.props)?;
    let mut component_definitions = BTreeMap::new();
    let mut component_instances = Vec::new();
    let mut routes = Vec::new();
    let mut nets = BTreeSet::new();
    let mut modules = BTreeSet::new();
    let mut constraints = BTreeSet::new();
    let mut diagnostics = Vec::new();
    let mut compiler_diagnostics = Vec::new();

    if let Err(error) = compile_nodes(
        &board_node.children,
        None,
        &mut component_definitions,
        &mut component_instances,
        &mut routes,
        &mut nets,
        &mut modules,
        &mut constraints,
        &mut diagnostics,
        &mut compiler_diagnostics,
    ) {
        return Err(error.with_diagnostics(compiler_diagnostics));
    }

    if let Err(error) = validate_instances(&component_instances, &component_definitions) {
        return Err(error.with_diagnostics(compiler_diagnostics));
    }

    let known_instances: BTreeMap<_, _> = component_instances
        .iter()
        .map(|instance| (instance.id.as_str(), instance))
        .collect();
    for route in &routes {
        for endpoint in [&route.from, &route.to] {
            let Some(instance) = known_instances.get(endpoint.part.as_str()) else {
                diagnostics.push(
                    Diagnostic::error("PCBIR002", "route references an unknown part")
                        .with_entity(&endpoint.part)
                        .with_help("Declare the part before using it as a route endpoint."),
                );
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
        compiler_diagnostics,
    })
}

fn compile_nodes(
    nodes: &[DeclarationNode],
    parent_scope: Option<&str>,
    component_definitions: &mut BTreeMap<String, Value>,
    component_instances: &mut Vec<ComponentInstance>,
    routes: &mut Vec<RouteConstraint>,
    nets: &mut BTreeSet<NetId>,
    modules: &mut BTreeSet<String>,
    constraints: &mut BTreeSet<String>,
    diagnostics: &mut Vec<Diagnostic>,
    compiler_diagnostics: &mut Vec<Diagnostic>,
) -> Result<(), CompileError> {
    for child in nodes {
        match child.node_type.as_str() {
            "pcb-module" => {
                let scope = child
                    .props
                    .get("scope")
                    .and_then(Value::as_str)
                    .ok_or_else(|| CompileError::invalid("module scope must be a string"))?;
                let name = child
                    .props
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| CompileError::invalid("module name must be a string"))?;
                if scope.trim().is_empty() || name.trim().is_empty() {
                    return Err(CompileError::diagnostic(
                        Diagnostic::error("PCBIR019", "module name and scope must not be empty")
                            .with_help("Give the module a non-empty name."),
                    ));
                }
                if name.contains('/') {
                    return Err(CompileError::diagnostic(
                        Diagnostic::error("PCBIR019", "module name must not contain '/'")
                            .with_entity(name)
                            .with_help("Use nested Module components to create hierarchy."),
                    ));
                }
                let expected_scope = parent_scope
                    .map(|parent| format!("{parent}/{name}"))
                    .unwrap_or_else(|| name.to_owned());
                if scope != expected_scope {
                    return Err(CompileError::diagnostic(
                        Diagnostic::error("PCBIR019", "module scope does not match its hierarchy")
                            .with_entity(scope)
                            .with_help(format!("Use the derived scope {expected_scope}.")),
                    ));
                }
                if !modules.insert(scope.to_owned()) {
                    return Err(CompileError::diagnostic(
                        Diagnostic::error("PCBIR013", "duplicate module scope")
                            .with_entity(scope)
                            .with_help(
                                "Give sibling modules unique names so every module has a unique scope.",
                            ),
                    ));
                }
                if child.children.is_empty() {
                    compiler_diagnostics.push(
                        Diagnostic::warning("PCBIR014", "module contains no declarations")
                            .with_entity(scope)
                            .with_help("Add declarations to the module or remove it."),
                    );
                }
                compile_nodes(
                    &child.children,
                    Some(scope),
                    component_definitions,
                    component_instances,
                    routes,
                    nets,
                    modules,
                    constraints,
                    diagnostics,
                    compiler_diagnostics,
                )?;
            }
            "pcb-part" => {
                let (instance, definition) = parse_part(&child.props)?;
                if component_instances
                    .iter()
                    .any(|existing| existing.id == instance.id)
                {
                    return Err(CompileError::diagnostic(
                        Diagnostic::error("PCBIR006", "duplicate component instance ID")
                            .with_entity(&instance.id)
                            .with_help(
                                "Give each placed part a unique ID, or place repeated circuits in modules with unique names.",
                            ),
                    ));
                }
                if let Some(existing) = component_definitions.get(&instance.definition) {
                    if existing != &definition {
                        return Err(CompileError::diagnostic(
                            Diagnostic::error(
                                "PCBIR007",
                                "component definition conflicts with an existing definition",
                            )
                            .with_entity(&instance.definition)
                            .with_help(
                                "Use one definition for this MPN, or assign distinct component keys.",
                            ),
                        ));
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
            "pcb-zone" | "pcb-keepout" => {
                let key = constraint_key(child)?;
                if !constraints.insert(key) {
                    let (code, message, help) = if child.node_type == "pcb-zone" {
                        (
                            "PCBIR015",
                            "duplicate copper zone declaration",
                            "Remove the repeated zone, or change its net, layers, boundary, or clearance.",
                        )
                    } else {
                        (
                            "PCBIR016",
                            "duplicate keepout declaration",
                            "Remove the repeated keepout, or change its region, restrictions, or exceptions.",
                        )
                    };
                    return Err(CompileError::diagnostic(
                        Diagnostic::error(code, message)
                            .with_entity(&child.node_type)
                            .with_help(help),
                    ));
                }
                diagnostics.push(
                    Diagnostic::warning(
                        "PCBIR001",
                        format!("declaration {} is not compiled yet", child.node_type),
                    )
                    .with_entity(&child.node_type),
                );
            }
            other => diagnostics.push(
                Diagnostic::warning(
                    "PCBIR001",
                    format!("declaration {other} is not compiled yet"),
                )
                .with_entity(other),
            ),
        }
    }
    Ok(())
}
