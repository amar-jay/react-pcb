use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Value, json};

use crate::Diagnostic;
use crate::ir::{
    Board, BoardSide, ComponentDefinition, FootprintDefinition, LayerSet, LengthUnit,
    NetDefinition, NetId, PartInstance, PinRef, Rect, RegionDefinition, StackupLayer,
};
use crate::protocol::DeclarationNode;

use super::CompileError;

pub fn parse_board(props: &Value) -> Result<(Board, RegionDefinition), CompileError> {
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
    let mut ids = BTreeSet::new();
    for id in layers
        .stackup
        .entries
        .iter()
        .map(StackupLayer::id)
        .chain(layers.technical.iter().map(crate::ir::TechnicalLayer::id))
    {
        require_name(id, "layer ID", "PCBIR027")?;
        if !ids.insert(id) {
            return Err(semantic_error(
                "PCBIR027",
                format!("duplicate layer ID {id}"),
                "Give every board layer a unique ID.",
            ));
        }
    }

    let region = RegionDefinition {
        id: "region/board-outline".to_owned(),
        geometry: outline,
    };
    Ok((
        Board {
            id: "board/1".to_owned(),
            outline: region.id.clone(),
            layers,
            metadata,
        },
        region,
    ))
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

pub fn parse_part(
    props: &Value,
) -> Result<
    (
        PartInstance,
        ComponentDefinition,
        FootprintDefinition,
        Vec<NetDefinition>,
    ),
    CompileError,
> {
    let id_value = props
        .get("id")
        .ok_or_else(|| CompileError::invalid("part id is required"))?;
    let id = string(id_value, "id")?;
    let reference = string(id_value, "reference")?;
    require_name(&id, "part ID", "PCBIR019")?;
    require_name(&reference, "part reference", "PCBIR019")?;
    let parsed_connections = props
        .get("connect")
        .and_then(Value::as_object)
        .ok_or_else(|| CompileError::invalid(format!("part {reference} connections are required")))?
        .iter()
        .map(|(pin, net)| {
            require_name(pin, "pin name", "PCBIR019")?;
            Ok((pin.clone(), parse_net(net)?))
        })
        .collect::<Result<BTreeMap<_, _>, CompileError>>()?;
    let connections: BTreeMap<String, NetId> = parsed_connections
        .iter()
        .map(|(pin, net)| (pin.clone(), net.id.clone()))
        .collect();
    let nets = parsed_connections.into_values().collect();
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
    let footprint_value = props
        .get("footprint")
        .ok_or_else(|| CompileError::invalid("footprint is required"))?;
    let footprint = if let Some(key) = footprint_value.as_str() {
        FootprintDefinition {
            key: key.to_owned(),
            resolved: false,
            pads: Vec::new(),
            physical: None,
        }
    } else {
        if footprint_value.get("schemaVersion").is_some() {
            return parse_physical_part(props, footprint_value);
        }
        let mut value = footprint_value.clone();
        value
            .as_object_mut()
            .ok_or_else(|| CompileError::invalid("footprint must be a key or definition object"))?
            .insert("resolved".to_owned(), Value::Bool(true));
        serde_json::from_value(value)
            .map_err(|error| CompileError::invalid(format!("invalid footprint: {error}")))?
    };
    require_name(&footprint.key, "footprint key", "PCBIR019")?;
    let (component, definition, embedded_pin_map) = component_definition(props)?;
    require_name(&component, "component key", "PCBIR019")?;
    let mut pin_map = BTreeMap::new();
    pin_map.extend(embedded_pin_map);
    if let Some(mapping) = props.get("pinMap") {
        let mapping = mapping
            .as_object()
            .ok_or_else(|| CompileError::invalid("pinMap must be an object"))?;
        for (name, pads) in mapping {
            require_name(name, "logical pin ID", "PCBIR019")?;
            pin_map.insert(name.clone(), parse_pad_ids(pads)?);
        }
    }
    if definition.pins.is_empty() && pin_map.is_empty() {
        pin_map.extend(
            connections
                .keys()
                .map(|name| (name.clone(), vec![name.clone()])),
        );
    }
    Ok((
        PartInstance {
            id,
            reference,
            component,
            footprint: footprint.key.clone(),
            pin_map,
            pad_layers: BTreeMap::new(),
            physical_features: BTreeMap::new(),
            at,
            side,
            rotation,
            connections,
        },
        definition,
        footprint,
        nets,
    ))
}

fn parse_physical_part(
    props: &Value,
    value: &Value,
) -> Result<
    (
        PartInstance,
        ComponentDefinition,
        FootprintDefinition,
        Vec<NetDefinition>,
    ),
    CompileError,
> {
    let physical = if value.get("units").is_some() {
        let physical: crate::physical::PhysicalFootprint = serde_json::from_value(value.clone())
            .map_err(|e| CompileError::invalid(format!("invalid physical footprint: {e}")))?;
        physical.validate()?;
        physical
    } else {
        crate::physical::compile_footprint(
            serde_json::from_value(value.clone())
                .map_err(|e| CompileError::invalid(format!("invalid footprint authoring: {e}")))?,
        )?
    };
    let pads = physical.compatibility_pads();
    let footprint = FootprintDefinition {
        key: physical.key.clone(),
        resolved: true,
        pads,
        physical: Some(physical),
    };
    let mut normalized = props.clone();
    normalized["footprint"] =
        serde_json::to_value(&footprint).map_err(|e| CompileError::invalid(e.to_string()))?;
    parse_part(&normalized)
}

type ParsedComponent = (String, ComponentDefinition, BTreeMap<String, Vec<String>>);

fn component_definition(props: &Value) -> Result<ParsedComponent, CompileError> {
    if let Some(definition) = props.get("definition") {
        let mpn = string(definition, "mpn")?;
        require_name(&mpn, "component MPN", "PCBIR019")?;
        let manufacturer = definition.get("manufacturer").and_then(Value::as_str);
        if let Some(manufacturer) = manufacturer {
            require_name(manufacturer, "component manufacturer", "PCBIR019")?;
        }
        let component = definition
            .get("key")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| match manufacturer {
                Some(manufacturer) => format!("part:{}", json!([manufacturer, mpn])),
                None => mpn.clone(),
            });
        let mut value = definition.clone();
        let object = value
            .as_object_mut()
            .ok_or_else(|| CompileError::invalid("component definition must be an object"))?;
        object.remove("key");
        object.remove("footprint");
        let mut pin_map = BTreeMap::new();
        if let Some(pins) = object.get_mut("pins").and_then(Value::as_object_mut) {
            for (name, pin) in pins {
                if let Some(pad) = pin.as_object_mut().and_then(|pin| pin.remove("pad")) {
                    pin_map.insert(name.clone(), parse_pad_ids(&pad)?);
                }
            }
        }
        let definition = serde_json::from_value(value).map_err(|error| {
            CompileError::diagnostic(
                Diagnostic::error("PCBIR022", format!("invalid component definition: {error}"))
                    .with_entity(&component),
            )
        })?;
        return Ok((component, definition, pin_map));
    }

    let mpn = optional_string(props, "mpn");
    let value = optional_string(props, "value");
    let component = mpn
        .clone()
        .or_else(|| value.as_ref().map(|value| format!("value:{value}")))
        .unwrap_or_else(|| "primitive".to_owned());
    Ok((
        component,
        ComponentDefinition {
            manufacturer: None,
            mpn,
            value,
            package: None,
            datasheet: None,
            pinout_coverage: None,
            pins: BTreeMap::new(),
        },
        BTreeMap::new(),
    ))
}

pub(super) fn parse_net(value: &Value) -> Result<NetDefinition, CompileError> {
    let id = string(value, "id")?;
    require_name(&id, "net ID", "PCBIR019")?;
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(&id)
        .to_owned();
    require_name(&name, "net name", "PCBIR019")?;
    Ok(NetDefinition {
        id: NetId(id),
        name,
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

pub(super) fn validate_zone(props: &Value) -> Result<(), CompileError> {
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

pub(super) fn validate_keepout(props: &Value) -> Result<(), CompileError> {
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

pub(super) fn parse_pin(value: &Value) -> Result<PinRef, CompileError> {
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

pub(super) fn require_name(
    value: &str,
    label: &str,
    code: &'static str,
) -> Result<(), CompileError> {
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

pub(super) fn string(value: &Value, key: &str) -> Result<String, CompileError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| CompileError::invalid(format!("{key} must be a string")))
}

fn optional_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

pub(super) fn number(value: &Value, key: &str) -> Result<f64, CompileError> {
    value
        .get(key)
        .ok_or_else(|| CompileError::invalid(format!("{key} is required")))
        .and_then(value_number)
}

pub(super) fn value_number(value: &Value) -> Result<f64, CompileError> {
    value
        .as_f64()
        .ok_or_else(|| CompileError::invalid("expected a number"))
}

fn parse_pad_ids(value: &Value) -> Result<Vec<String>, CompileError> {
    let ids = match value {
        Value::String(id) => vec![id.clone()],
        Value::Array(ids) => ids
            .iter()
            .map(|id| {
                id.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| CompileError::invalid("pad IDs must be strings"))
            })
            .collect::<Result<Vec<_>, _>>()?,
        _ => {
            return Err(CompileError::invalid(
                "pad mapping must be a string or array",
            ));
        }
    };
    if ids.is_empty() || ids.iter().any(|id| id.trim().is_empty()) {
        return Err(CompileError::diagnostic(Diagnostic::error(
            "PCBIR011",
            "pad mapping must contain non-empty pad IDs",
        )));
    }
    Ok(ids)
}

pub(super) fn parse_rect(value: &Value) -> Result<Rect, CompileError> {
    if value.get("kind").and_then(Value::as_str) != Some("rect") {
        return Err(CompileError::invalid("region must be rectangular"));
    }
    let rect = Rect {
        x: number(value, "x")?,
        y: number(value, "y")?,
        width: number(value, "width")?,
        height: number(value, "height")?,
    };
    validate_rect(&rect, "region")?;
    Ok(rect)
}
