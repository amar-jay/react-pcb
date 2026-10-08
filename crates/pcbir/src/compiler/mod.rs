use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use crate::diagnostic::Diagnostic;
use crate::ir::{
    BoardIr, ComponentDefinition, FootprintDefinition, LayerSet, NetDefinition, NetId,
    PartInstance, Revision, SCHEMA_VERSION,
};
use crate::protocol::{DeclarationNode, DeclarationTransaction, PROTOCOL_VERSION};
use serde::Serialize;
use serde_json::Value;

mod constraints;
mod layers;
mod parse;
mod validate;

use parse::{constraint_key, parse_board, parse_part, parse_units};
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
    let (board, outline) = parse_board(&board_node.props)?;
    let mut context = CompileContext::default();
    context.physical.regions.insert(outline.id.clone(), outline);
    let mut diagnostics = Vec::new();

    if let Err(error) = context.compile_nodes(&board_node.children, None, &board.layers) {
        return Err(error.with_diagnostics(context.compiler_diagnostics));
    }
    for net in std::mem::take(&mut context.physical.nets).into_values() {
        if let Err(error) = context.add_net(net) {
            return Err(error.with_diagnostics(context.compiler_diagnostics));
        }
    }

    if let Err(error) = validate_instances(
        &context.component_instances,
        &context.component_definitions,
        &context.footprint_definitions,
    ) {
        return Err(error.with_diagnostics(context.compiler_diagnostics));
    }

    if let Err(error) = layers::resolve_pad_layers(
        &mut context.component_instances,
        &context.footprint_definitions,
        &board.layers,
    ) {
        return Err(error.with_diagnostics(context.compiler_diagnostics));
    }

    let known_instances: BTreeMap<_, _> = context
        .component_instances
        .iter()
        .map(|instance| (instance.id.as_str(), instance))
        .collect();
    for route in &context.physical.endpoint_routes() {
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
                &context.component_definitions,
                &mut diagnostics,
            );
        }
    }

    if let Some(index) = diagnostics
        .iter()
        .position(|diagnostic| matches!(diagnostic.severity, crate::Severity::Error))
    {
        let fatal = diagnostics.remove(index);
        let mut previous = context.compiler_diagnostics;
        previous.extend(diagnostics);
        return Err(CompileError::diagnostic(fatal).with_diagnostics(previous));
    }

    Ok(CompileOutput {
        ir: BoardIr {
            schema_version: SCHEMA_VERSION,
            revision: Revision(transaction.base_revision.unwrap_or(0) + 1),
            units,
            board,
            component_definitions: context.component_definitions,
            parts: context.component_instances,
            footprint_definitions: context.footprint_definitions,
            nets: context.nets.into_values().collect(),
            route_constraints: context.physical.routes,
            differential_pairs: context.physical.pairs,
            zones: context.physical.zones,
            keepouts: context.physical.keepouts,
            regions: context.physical.regions,
        },
        diagnostics,
        compiler_diagnostics: context.compiler_diagnostics,
    })
}

#[derive(Default)]
struct CompileContext {
    component_definitions: BTreeMap<String, ComponentDefinition>,
    component_instances: Vec<PartInstance>,
    footprint_definitions: BTreeMap<String, FootprintDefinition>,
    physical: constraints::Constraints,
    nets: BTreeMap<NetId, NetDefinition>,
    modules: BTreeSet<String>,
    constraints: BTreeSet<String>,
    compiler_diagnostics: Vec<Diagnostic>,
}

impl CompileContext {
    fn add_net(&mut self, net: NetDefinition) -> Result<(), CompileError> {
        if let Some(existing) = self.nets.insert(net.id.clone(), net.clone())
            && existing != net
        {
            return Err(CompileError::diagnostic(
                Diagnostic::error("PCBIR030", "conflicting names for one net ID")
                    .with_entity(&net.id.0)
                    .with_help("Use one descriptive name for each stable net ID."),
            ));
        }
        Ok(())
    }

    fn compile_nodes(
        &mut self,
        nodes: &[DeclarationNode],
        parent_scope: Option<&str>,
        board_layers: &LayerSet,
    ) -> Result<(), CompileError> {
        for child in nodes {
            if matches!(
                child.node_type.as_str(),
                "pcb-part" | "pcb-zone" | "pcb-keepout"
            ) && !child.children.is_empty()
            {
                return Err(CompileError::invalid(
                    "leaf declarations must not contain children",
                ));
            }
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
                            Diagnostic::error(
                                "PCBIR019",
                                "module name and scope must not be empty",
                            )
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
                            Diagnostic::error(
                                "PCBIR019",
                                "module scope does not match its hierarchy",
                            )
                            .with_entity(scope)
                            .with_help(format!("Use the derived scope {expected_scope}.")),
                        ));
                    }
                    if !self.modules.insert(scope.to_owned()) {
                        return Err(CompileError::diagnostic(
                        Diagnostic::error("PCBIR013", "duplicate module scope")
                            .with_entity(scope)
                            .with_help(
                                "Give sibling modules unique names so every module has a unique scope.",
                            ),
                    ));
                    }
                    if child.children.is_empty() {
                        self.compiler_diagnostics.push(
                            Diagnostic::warning("PCBIR014", "module contains no declarations")
                                .with_entity(scope)
                                .with_help("Add declarations to the module or remove it."),
                        );
                    }
                    self.compile_nodes(&child.children, Some(scope), board_layers)?;
                }
                "pcb-part" => {
                    let (instance, definition, footprint, nets) = parse_part(&child.props)?;
                    for net in nets {
                        self.add_net(net)?;
                    }
                    if let Some(existing) = self.footprint_definitions.get(&footprint.key) {
                        if existing != &footprint {
                            return Err(CompileError::diagnostic(
                                Diagnostic::error("PCBIR023", "conflicting footprint definitions")
                                    .with_entity(&footprint.key),
                            ));
                        }
                    } else {
                        if !footprint.resolved {
                            self.compiler_diagnostics.push(Diagnostic::warning("PCBIR024", "footprint geometry is unresolved").with_entity(&footprint.key).with_help("Provide a footprint definition with pad geometry before routing."));
                        }
                        self.footprint_definitions
                            .insert(footprint.key.clone(), footprint);
                    }
                    if self
                        .component_instances
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
                    if let Some(existing) = self.component_definitions.get(&instance.component) {
                        if existing != &definition {
                            return Err(CompileError::diagnostic(
                            Diagnostic::error(
                                "PCBIR007",
                                "component definition conflicts with an existing definition",
                            )
                            .with_entity(&instance.component)
                            .with_help(
                                "Use one definition for this MPN, or assign distinct component keys.",
                            ),
                        ));
                        }
                    } else {
                        self.component_definitions
                            .insert(instance.component.clone(), definition);
                    }
                    self.component_instances.push(instance);
                }
                "pcb-route" => {
                    self.physical.route(child, parent_scope)?;
                }
                "pcb-zone" | "pcb-keepout" => {
                    let key = serde_json::to_string(&(
                        parent_scope,
                        &child.source_key,
                        constraint_key(child)?,
                    ))
                    .expect("constraint identity inputs are serializable");
                    if !self.constraints.insert(key) {
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
                    if child.node_type == "pcb-zone" {
                        self.physical.zone(child, parent_scope, board_layers)?;
                    } else {
                        self.physical.keepout(child, parent_scope)?;
                    }
                }
                "pcb-differential-pair" => self.physical.pair(child, parent_scope)?,
                other => {
                    return Err(CompileError::diagnostic(
                        Diagnostic::error("PCBIR001", format!("unsupported declaration {other}"))
                            .with_entity(other),
                    ));
                }
            }
        }
        Ok(())
    }
}
