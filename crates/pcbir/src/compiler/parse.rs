use std::collections::BTreeMap;

use serde_json::Value;

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
    let connections = props
        .get("connect")
        .and_then(Value::as_object)
        .ok_or_else(|| CompileError::invalid(format!("part {reference} connections are required")))?
        .iter()
        .map(|(pin, net)| Ok((pin.clone(), NetId(string(net, "id")?))))
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
                .ok_or_else(|| CompileError::invalid("route net is required"))?,
            "id",
        )?),
        from: parse_pin(
            props
                .get("from")
                .ok_or_else(|| CompileError::invalid("route start is required"))?,
        )?,
        to: parse_pin(
            props
                .get("to")
                .ok_or_else(|| CompileError::invalid("route end is required"))?,
        )?,
        width: props.get("width").map(value_number).transpose()?,
        through,
    })
}

fn parse_pin(value: &Value) -> Result<PinRef, CompileError> {
    let part = value
        .get("part")
        .ok_or_else(|| CompileError::invalid("pin part is required"))?;
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
