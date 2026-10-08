use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::Diagnostic;
use crate::ir::{
    Board, BoardSide, ComponentInstance, LayerSet, LengthUnit, NetId, PinRef, Rect,
    RouteConstraint, StackupLayer,
};
use crate::protocol::DeclarationNode;

use super::CompileError;

pub fn parse_board(props: &Value) -> Result<Board, CompileError> {
    let outline = props
        .get("outline")
        .ok_or_else(|| CompileError::invalid("board outline is required"))?;
    if string(outline, "kind")? != "rect" {
        return Err(CompileError::invalid(
            "only rectangular outlines are supported by the scaffold",
        ));
    }
    let layers: LayerSet = serde_json::from_value(
        props
            .get("layers")
            .cloned()
            .ok_or_else(|| CompileError::invalid("board layers are required"))?,
    )
    .map_err(|error| CompileError::invalid(format!("invalid board layers: {error}")))?;
    if layers.kind != "layer-set" || layers.stackup.kind != "stackup" {
        return Err(CompileError::invalid("invalid layer set kind"));
    }
    let copper_count = layers
        .stackup
        .entries
        .iter()
        .filter(|entry| matches!(entry, StackupLayer::Copper { .. }))
        .count();
    if !(1..=32).contains(&copper_count) {
        return Err(CompileError::invalid(
            "stackup must contain 1 to 32 copper layers",
        ));
    }
    let metadata = props
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect();
    let outline = Rect {
        x: number(outline, "x")?,
        y: number(outline, "y")?,
        width: number(outline, "width")?,
        height: number(outline, "height")?,
    };
    validate_rect(&outline, "board outline")?;
    validate_stackup(&layers)?;
    Ok(Board {
        outline,
        layers,
        metadata,
    })
}

pub fn parse_units(props: &Value) -> Result<LengthUnit, CompileError> {
    props
        .get("units")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| CompileError::invalid(format!("invalid board units: {error}")))
        .map(|units| units.unwrap_or(LengthUnit::Mm))
}

pub fn parse_part(props: &Value) -> Result<(ComponentInstance, Value), CompileError> {
    let id_value = props
        .get("id")
        .ok_or_else(|| CompileError::invalid("part id is required"))?;
    let id = string(id_value, "id")?;
    let reference = string(id_value, "reference")?;
    require_name(&id, "part ID", "PCBIR019")?;
    require_name(&reference, "part reference", "PCBIR019")?;
    let connections = props
        .get("connect")
        .and_then(Value::as_object)
        .ok_or_else(|| CompileError::invalid(format!("part {reference} connections are required")))?
        .iter()
        .map(|(pin, net)| {
            require_name(pin, "pin name", "PCBIR019")?;
            let net = string(net, "id")?;
            require_name(&net, "net ID", "PCBIR019")?;
            Ok((pin.clone(), NetId(net)))
        })
        .collect::<Result<BTreeMap<_, _>, CompileError>>()?;
    let at = props
        .get("at")
        .and_then(Value::as_array)
        .map(|point| {
            if point.len() != 2 {
                return Err(CompileError::invalid(
                    "part position must contain two numbers",
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
        .map_err(|error| {
            CompileError::invalid(format!("invalid side for part {reference}: {error}"))
        })?
        .unwrap_or(BoardSide::Front);
    let rotation = props
        .get("rotation")
        .map(value_number)
        .transpose()?
        .unwrap_or(0.0)
        .rem_euclid(360.0);
    let footprint = string(props, "footprint")?;
    require_name(&footprint, "footprint", "PCBIR019")?;
    let (component, definition) = component_definition(props, &footprint)?;
    Ok((
        ComponentInstance {
            id,
            reference,
            definition: component,
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

pub fn parse_route(node: &DeclarationNode) -> Result<RouteConstraint, CompileError> {
    let props = &node.props;
    let through = node
        .children
        .iter()
        .filter(|child| child.node_type == "pcb-route-through")
        .map(|child| {
            let region = child
                .props
                .get("region")
                .ok_or_else(|| CompileError::invalid("route region is required"))?;
            let region = Rect {
                x: number(region, "x")?,
                y: number(region, "y")?,
                width: number(region, "width")?,
                height: number(region, "height")?,
            };
            validate_rect(&region, "route-through region")?;
            Ok(region)
        })
        .collect::<Result<_, CompileError>>()?;
    let net = string(
        props
            .get("net")
            .ok_or_else(|| CompileError::invalid("route net is required"))?,
        "id",
    )?;
    require_name(&net, "route net ID", "PCBIR020")?;
    let from = parse_pin(
        props
            .get("from")
            .ok_or_else(|| CompileError::invalid("route start is required"))?,
    )?;
    let to = parse_pin(
        props
            .get("to")
            .ok_or_else(|| CompileError::invalid("route end is required"))?,
    )?;
    if from.part == to.part && from.name == to.name {
        return Err(semantic_error(
            "PCBIR020",
            "route endpoints must be different",
            "Choose two distinct connected pins.",
        ));
    }
    let width = props.get("width").map(value_number).transpose()?;
    if width.is_some_and(|width| width <= 0.0) {
        return Err(semantic_error(
            "PCBIR020",
            "route width must be positive",
            "Use a width greater than zero.",
        ));
    }
    Ok(RouteConstraint {
        net: NetId(net),
        from,
        to,
        width,
        through,
    })
}

pub fn constraint_key(node: &DeclarationNode) -> Result<String, CompileError> {
    let mut props = node.props.clone();
    match node.node_type.as_str() {
        "pcb-zone" => validate_zone(&props)?,
        "pcb-keepout" => {
            validate_keepout(&props)?;
            if let Some(disallow) = props.get_mut("disallow").and_then(Value::as_array_mut) {
                disallow.sort_by(|left, right| left.as_str().cmp(&right.as_str()));
            }
            if let Some(exceptions) = props.get_mut("except").and_then(Value::as_array_mut) {
                exceptions.sort_by(|left, right| {
                    left.get("id")
                        .and_then(Value::as_str)
                        .cmp(&right.get("id").and_then(Value::as_str))
                });
            }
        }
        _ => unreachable!("constraint_key only accepts physical constraints"),
    }
    Ok(format!(
        "{}:{}",
        node.node_type,
        serde_json::to_string(&props).expect("declaration properties are serializable")
    ))
}

fn validate_zone(props: &Value) -> Result<(), CompileError> {
    let net = props
        .get("net")
        .and_then(|net| net.get("id"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    require_name(net, "zone net ID", "PCBIR021")?;
    let layers = props.get("layers").and_then(Value::as_array);
    if layers.is_none_or(Vec::is_empty) {
        return Err(semantic_error(
            "PCBIR021",
            "zone must target at least one copper layer",
            "Add a copper layer to the zone's layers property.",
        ));
    }
    if has_duplicate_values(layers.into_iter().flatten()) {
        return Err(semantic_error(
            "PCBIR021",
            "zone contains a duplicate copper layer",
            "List each target layer once.",
        ));
    }
    if props
        .get("clearance")
        .map(value_number)
        .transpose()?
        .is_some_and(|clearance| clearance < 0.0)
    {
        return Err(semantic_error(
            "PCBIR021",
            "zone clearance must not be negative",
            "Use zero or a positive clearance.",
        ));
    }
    validate_boundary(props.get("boundary"), "zone boundary")
}

fn validate_keepout(props: &Value) -> Result<(), CompileError> {
    let disallow = props.get("disallow").and_then(Value::as_array);
    if disallow.is_none_or(Vec::is_empty) {
        return Err(semantic_error(
            "PCBIR021",
            "keepout must disallow at least one object type",
            "Add components, copper, tracks, or vias to disallow.",
        ));
    }
    let valid = ["components", "copper", "tracks", "vias"];
    if disallow
        .into_iter()
        .flatten()
        .any(|entry| entry.as_str().is_none_or(|entry| !valid.contains(&entry)))
    {
        return Err(semantic_error(
            "PCBIR021",
            "keepout contains an unknown restriction",
            "Use only components, copper, tracks, or vias.",
        ));
    }
    if has_duplicate_values(disallow.into_iter().flatten()) {
        return Err(semantic_error(
            "PCBIR021",
            "keepout contains a duplicate restriction",
            "List each restriction once.",
        ));
    }
    if let Some(exceptions) = props.get("except").and_then(Value::as_array) {
        let mut ids = BTreeSet::new();
        for exception in exceptions {
            let id = exception
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            require_name(id, "keepout exception net ID", "PCBIR021")?;
            if !ids.insert(id) {
                return Err(semantic_error(
                    "PCBIR021",
                    "keepout contains a duplicate exception net",
                    "List each exception net once.",
                ));
            }
        }
    }
    validate_boundary(props.get("region"), "keepout region")
}

fn has_duplicate_values<'a>(mut values: impl Iterator<Item = &'a Value>) -> bool {
    let mut seen = BTreeSet::new();
    values.any(|value| !seen.insert(value.to_string()))
}

fn validate_boundary(value: Option<&Value>, label: &str) -> Result<(), CompileError> {
    let value = value.ok_or_else(|| {
        semantic_error(
            "PCBIR021",
            format!("{label} is required"),
            "Provide a rectangular region or the board boundary.",
        )
    })?;
    if value.as_str() == Some("board") {
        return Ok(());
    }
    if value.get("kind").and_then(Value::as_str) != Some("rect") {
        return Err(semantic_error(
            "PCBIR021",
            format!("{label} must be rectangular"),
            "Use rect(...) to define the region.",
        ));
    }
    let rect = Rect {
        x: number(value, "x")?,
        y: number(value, "y")?,
        width: number(value, "width")?,
        height: number(value, "height")?,
    };
    validate_rect(&rect, label)
}

fn parse_pin(value: &Value) -> Result<PinRef, CompileError> {
    let part = value
        .get("part")
        .ok_or_else(|| CompileError::invalid("pin part is required"))?;
    let part = string(part, "id")?;
    let name = string(value, "name")?;
    require_name(&part, "route endpoint part ID", "PCBIR020")?;
    require_name(&name, "route endpoint pin", "PCBIR020")?;
    Ok(PinRef { part, name })
}

fn validate_rect(rect: &Rect, label: &str) -> Result<(), CompileError> {
    if rect.width <= 0.0 || rect.height <= 0.0 {
        return Err(semantic_error(
            "PCBIR017",
            format!("{label} must have positive width and height"),
            "Use dimensions greater than zero.",
        ));
    }
    Ok(())
}

fn validate_stackup(layers: &LayerSet) -> Result<(), CompileError> {
    let entries = &layers.stackup.entries;
    if !matches!(entries.first(), Some(StackupLayer::Copper { .. }))
        || !matches!(entries.last(), Some(StackupLayer::Copper { .. }))
    {
        return Err(semantic_error(
            "PCBIR018",
            "stackup must start and end with copper",
            "Place dielectric layers only between copper layers.",
        ));
    }
    for (index, entry) in entries.iter().enumerate() {
        if index > 0 && std::mem::discriminant(entry) == std::mem::discriminant(&entries[index - 1])
        {
            return Err(semantic_error(
                "PCBIR018",
                "stackup entries must alternate between copper and dielectric",
                "Insert a dielectric between adjacent copper layers.",
            ));
        }
        let valid = match entry {
            StackupLayer::Copper { thickness, .. } => *thickness > 0.0,
            StackupLayer::Dielectric {
                thickness,
                epsilon_r,
                loss_tangent,
                ..
            } => {
                *thickness > 0.0
                    && *epsilon_r > 0.0
                    && loss_tangent.is_none_or(|value| value >= 0.0)
            }
        };
        if !valid {
            return Err(semantic_error(
                "PCBIR018",
                "stackup contains invalid physical properties",
                "Use positive thickness and dielectric constant values, with a non-negative loss tangent.",
            ));
        }
    }
    Ok(())
}

fn require_name(value: &str, label: &str, code: &'static str) -> Result<(), CompileError> {
    if value.trim().is_empty() {
        return Err(semantic_error(
            code,
            format!("{label} must not be empty"),
            "Provide a non-empty identifier.",
        ));
    }
    Ok(())
}

fn semantic_error(
    code: &'static str,
    message: impl Into<String>,
    help: impl Into<String>,
) -> CompileError {
    CompileError::diagnostic(Diagnostic::error(code, message).with_help(help))
}

fn string(value: &Value, key: &str) -> Result<String, CompileError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| CompileError::invalid(format!("{key} must be a string")))
}

fn optional_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn number(value: &Value, key: &str) -> Result<f64, CompileError> {
    value
        .get(key)
        .ok_or_else(|| CompileError::invalid(format!("{key} is required")))
        .and_then(value_number)
}

fn value_number(value: &Value) -> Result<f64, CompileError> {
    value
        .as_f64()
        .ok_or_else(|| CompileError::invalid("expected a number"))
}
