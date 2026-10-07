use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use serde::Serialize;
use serde_json::Value;

use crate::diagnostic::{Diagnostic, Severity};
use crate::ir::{
    Board, BoardIr, BoardSide, LayerSet, LengthUnit, NetId, Part, PinRef, Rect, Revision,
    RouteConstraint, StackupLayer,
};
use crate::protocol::{DeclarationNode, DeclarationTransaction, PROTOCOL_VERSION};

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
    let mut components = BTreeMap::new();
    let mut parts = Vec::new();
    let mut routes = Vec::new();
    let mut nets = BTreeSet::new();
    let mut diagnostics = Vec::new();

    compile_nodes(
        &board_node.children,
        &mut components,
        &mut parts,
        &mut routes,
        &mut nets,
        &mut diagnostics,
    )?;

    let known_parts: BTreeSet<_> = parts.iter().map(|part| part.id.as_str()).collect();
    for route in &routes {
        for endpoint in [&route.from, &route.to] {
            if !known_parts.contains(endpoint.part.as_str()) {
                diagnostics.push(Diagnostic {
                    code: "PCBIR002",
                    severity: Severity::Error,
                    message: format!("route references unknown part {}", endpoint.part),
                    entity: Some(endpoint.part.clone()),
                });
            }
        }
    }

    Ok(CompileOutput {
        ir: BoardIr {
            revision: Revision(transaction.base_revision.unwrap_or(0) + 1),
            units,
            board,
            components,
            parts,
            nets: nets.into_iter().collect(),
            route_constraints: routes,
        },
        diagnostics,
    })
}

fn compile_nodes(
    nodes: &[DeclarationNode],
    components: &mut BTreeMap<String, Value>,
    parts: &mut Vec<Part>,
    routes: &mut Vec<RouteConstraint>,
    nets: &mut BTreeSet<NetId>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<(), CompileError> {
    for child in nodes {
        match child.node_type.as_str() {
            "pcb-module" => compile_nodes(
                &child.children,
                components,
                parts,
                routes,
                nets,
                diagnostics,
            )?,
            "pcb-part" => {
                let (part, definition) = parse_part(&child.props)?;
                if let Some(existing) = components.get(&part.component) {
                    if existing != &definition {
                        return Err(CompileError(format!(
                            "component {} has conflicting definitions",
                            part.component
                        )));
                    }
                } else {
                    components.insert(part.component.clone(), definition);
                }
                nets.extend(part.connections.values().cloned());
                parts.push(part);
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

fn parse_board(props: &Value) -> Result<Board, CompileError> {
    let outline = props
        .get("outline")
        .ok_or_else(|| CompileError("board outline is required".into()))?;
    if string(outline, "kind")? != "rect" {
        return Err(CompileError(
            "only rectangular outlines are supported by the scaffold".into(),
        ));
    }
    let layers: LayerSet = serde_json::from_value(
        props
            .get("layers")
            .cloned()
            .ok_or_else(|| CompileError("board layers are required".into()))?,
    )
    .map_err(|error| CompileError(format!("invalid board layers: {error}")))?;
    if layers.kind != "layer-set" || layers.stackup.kind != "stackup" {
        return Err(CompileError("invalid layer set kind".into()));
    }
    let copper_count = layers
        .stackup
        .entries
        .iter()
        .filter(|entry| matches!(entry, StackupLayer::Copper { .. }))
        .count();
    if !(1..=32).contains(&copper_count) {
        return Err(CompileError(
            "stackup must contain 1 to 32 copper layers".into(),
        ));
    }
    let metadata = props
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect();
    Ok(Board {
        outline: Rect {
            x: number(outline, "x")?,
            y: number(outline, "y")?,
            width: number(outline, "width")?,
            height: number(outline, "height")?,
        },
        layers,
        metadata,
    })
}

fn parse_units(props: &Value) -> Result<LengthUnit, CompileError> {
    props
        .get("units")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| CompileError(format!("invalid board units: {error}")))
        .map(|units| units.unwrap_or(LengthUnit::Mm))
}

fn parse_part(props: &Value) -> Result<(Part, Value), CompileError> {
    let id_value = props
        .get("id")
        .ok_or_else(|| CompileError("part id is required".into()))?;
    let id = string(id_value, "id")?;
    let reference = string(id_value, "reference")?;
    let connections = props
        .get("connect")
        .and_then(Value::as_object)
        .ok_or_else(|| CompileError(format!("part {reference} connections are required")))?
        .iter()
        .map(|(pin, net)| Ok((pin.clone(), NetId(string(net, "id")?))))
        .collect::<Result<BTreeMap<_, _>, CompileError>>()?;
    let at = props
        .get("at")
        .and_then(Value::as_array)
        .map(|point| {
            if point.len() != 2 {
                return Err(CompileError(
                    "part position must contain two numbers".into(),
                ));
            }
            Ok([value_number(&point[0])?, value_number(&point[1])?])
        })
        .transpose()?;
    let side: BoardSide = props
        .get("side")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| CompileError(format!("invalid side for part {reference}: {error}")))?
        .unwrap_or(BoardSide::Front);
    let rotation = props
        .get("rotation")
        .map(value_number)
        .transpose()?
        .unwrap_or(0.0)
        .rem_euclid(360.0);
    let footprint = string(props, "footprint")?;
    let (component, definition) = component_definition(props, &footprint)?;
    Ok((
        Part {
            id,
            reference,
            component,
            at,
            side,
            rotation,
            connections,
        },
        definition,
    ))
}

fn component_definition(props: &Value, footprint: &str) -> Result<(String, Value), CompileError> {
    if let Some(definition) = props.get("definition") {
        let component = string(definition, "mpn")?;
        return Ok((component, definition.clone()));
    }

    let mpn = optional_string(props, "mpn");
    let value = optional_string(props, "value");
    let component = mpn
        .clone()
        .or_else(|| value.as_ref().map(|value| format!("{value}@{footprint}")))
        .unwrap_or_else(|| format!("footprint:{footprint}"));
    let mut definition =
        serde_json::Map::from_iter([("footprint".into(), Value::String(footprint.into()))]);
    if let Some(mpn) = mpn {
        definition.insert("mpn".into(), Value::String(mpn));
    }
    if let Some(value) = value {
        definition.insert("value".into(), Value::String(value));
    }
    Ok((component, Value::Object(definition)))
}

fn parse_route(node: &DeclarationNode) -> Result<RouteConstraint, CompileError> {
    let props = &node.props;
    let through = node
        .children
        .iter()
        .filter(|child| child.node_type == "pcb-route-through")
        .map(|child| {
            let region = child
                .props
                .get("region")
                .ok_or_else(|| CompileError("route region is required".into()))?;
            Ok(Rect {
                x: number(region, "x")?,
                y: number(region, "y")?,
                width: number(region, "width")?,
                height: number(region, "height")?,
            })
        })
        .collect::<Result<_, CompileError>>()?;
    Ok(RouteConstraint {
        net: NetId(string(
            props
                .get("net")
                .ok_or_else(|| CompileError("route net is required".into()))?,
            "id",
        )?),
        from: parse_pin(
            props
                .get("from")
                .ok_or_else(|| CompileError("route start is required".into()))?,
        )?,
        to: parse_pin(
            props
                .get("to")
                .ok_or_else(|| CompileError("route end is required".into()))?,
        )?,
        width: props.get("width").map(value_number).transpose()?,
        through,
    })
}

fn parse_pin(value: &Value) -> Result<PinRef, CompileError> {
    let part = value
        .get("part")
        .ok_or_else(|| CompileError("pin part is required".into()))?;
    Ok(PinRef {
        part: string(part, "id")?,
        name: string(value, "name")?,
    })
}

fn string(value: &Value, key: &str) -> Result<String, CompileError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| CompileError(format!("{key} must be a string")))
}
fn optional_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}
fn number(value: &Value, key: &str) -> Result<f64, CompileError> {
    value
        .get(key)
        .ok_or_else(|| CompileError(format!("{key} is required")))
        .and_then(value_number)
}
fn value_number(value: &Value) -> Result<f64, CompileError> {
    value
        .as_f64()
        .ok_or_else(|| CompileError("expected a number".into()))
}

#[cfg(test)]
mod tests {
    use super::compile;
    use crate::protocol::DeclarationTransaction;

    #[test]
    fn compiles_declarations_into_canonical_ir() {
        let transaction: DeclarationTransaction = serde_json::from_value(serde_json::json!({
            "protocolVersion": 1, "baseRevision": 7,
            "declarations": {"kind": "react-pcb-declarations", "children": [{
                "type": "pcb-board",
                "props": {"outline": {"kind": "rect", "x": 0, "y": 0, "width": 40, "height": 30}, "layers": {
                    "kind": "layer-set",
                    "stackup": {"kind": "stackup", "entries": [
                        {"kind": "copper", "thickness": 0.035, "usage": "signal"},
                        {"kind": "dielectric", "material": "FR-4", "thickness": 1.5, "epsilonR": 4.2},
                        {"kind": "copper", "thickness": 0.035, "usage": "signal"}
                    ]},
                    "technical": []
                }, "metadata": {"title": "Test board"}},
                "children": [
                    {"type": "pcb-part", "props": {
                        "id": {"id": "U1", "reference": "U1"}, "footprint": "QFN-32",
                        "connect": {"VDD": {"id": "3V3"}}
                    }, "children": []},
                    {"type": "pcb-part", "props": {
                        "id": {"id": "U2", "reference": "U2"}, "footprint": "QFN-32",
                        "connect": {"VDD": {"id": "3V3"}}
                    }, "children": []}
                ]
            }]}
        })).unwrap();
        let output = compile(transaction).unwrap();
        assert_eq!(output.ir.revision.0, 8);
        assert!(matches!(output.ir.units, crate::ir::LengthUnit::Mm));
        assert_eq!(output.ir.parts[0].id, "U1");
        assert!(matches!(
            output.ir.parts[0].side,
            crate::ir::BoardSide::Front
        ));
        assert_eq!(output.ir.parts[0].rotation, 0.0);
        assert_eq!(output.ir.components.len(), 1);
        assert_eq!(output.ir.parts[0].component, output.ir.parts[1].component);
        assert_eq!(output.ir.nets[0].0, "3V3");
    }
}
