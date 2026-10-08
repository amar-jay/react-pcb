use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::diagnostic::Diagnostic;
use crate::ir::{FootprintDefinition, PartInstance, PinRef, RouteConstraint};

use super::CompileError;

pub fn validate_instances(
    instances: &[PartInstance],
    definitions: &BTreeMap<String, Value>,
    footprints: &BTreeMap<String, FootprintDefinition>,
) -> Result<(), CompileError> {
    for footprint in footprints.values() {
        validate_footprint(footprint)?;
    }
    for instance in instances {
        let definition = definitions
            .get(&instance.component)
            .expect("every instance definition is inserted while compiling");
        let Some(pins) = definition.get("pins") else {
            validate_binding(instance, definitions, footprints)?;
            continue;
        };
        let pins = pins.as_object().ok_or_else(|| {
            CompileError::invalid(format!(
                "component definition {} pins must be an object",
                instance.component
            ))
        })?;

        for pin in instance.connections.keys() {
            if !pins.contains_key(pin) {
                return Err(CompileError::diagnostic(
                    Diagnostic::error("PCBIR008", format!("part references unknown pin {pin}"))
                        .with_entity(&instance.id)
                        .with_help(format!(
                            "Declare {pin} in component definition {}, or correct the connection name.",
                            instance.component
                        )),
                ));
            }
        }
        validate_pin_definition(&instance.component, definition, pins)?;
        validate_binding(instance, definitions, footprints)?;
        for (name, pin) in pins {
            if pin.get("required").and_then(Value::as_bool) == Some(true)
                && !instance.connections.contains_key(name)
            {
                return Err(CompileError::diagnostic(
                    Diagnostic::error("PCBIR009", format!("required pin {name} is not connected"))
                        .with_entity(&instance.id)
                        .with_help(format!("Add {name} to the part's connect property.")),
                ));
            }
        }
    }
    Ok(())
}

fn validate_pin_definition(
    definition_key: &str,
    definition: &Value,
    pins: &serde_json::Map<String, Value>,
) -> Result<(), CompileError> {
    let coverage = definition.get("pinoutCoverage").and_then(Value::as_str);
    if !matches!(coverage, Some("complete" | "partial")) {
        return Err(CompileError::diagnostic(
            Diagnostic::error(
                "PCBIR022",
                "component definition has invalid pinout coverage",
            )
            .with_entity(definition_key)
            .with_help("Set pinoutCoverage to complete or partial."),
        ));
    }
    if coverage == Some("complete") && pins.is_empty() {
        return Err(CompileError::diagnostic(
            Diagnostic::error("PCBIR010", "complete component definition has no pins")
                .with_entity(definition_key)
                .with_help("Declare every physical pad, or mark pinoutCoverage as partial."),
        ));
    }

    for (name, pin) in pins {
        let pin = pin.as_object().ok_or_else(|| {
            CompileError::diagnostic(
                Diagnostic::error("PCBIR022", format!("pin {name} must be an object"))
                    .with_entity(definition_key),
            )
        })?;
        if pin
            .get("required")
            .is_some_and(|required| !required.is_boolean())
        {
            return Err(CompileError::diagnostic(
                Diagnostic::error("PCBIR022", format!("pin {name} required must be boolean"))
                    .with_entity(definition_key),
            ));
        }
        let electrical_type = pin.get("electricalType").and_then(Value::as_str);
        let valid_types = [
            "power-input",
            "power-output",
            "input",
            "output",
            "bidirectional",
            "passive",
        ];
        if electrical_type.is_none_or(|kind| !valid_types.contains(&kind)) {
            return Err(CompileError::diagnostic(
                Diagnostic::error(
                    "PCBIR022",
                    format!("pin {name} has invalid electrical type"),
                )
                .with_entity(definition_key)
                .with_help("Use a supported electricalType value."),
            ));
        }
    }
    Ok(())
}

pub fn validate_route_endpoint(
    route: &RouteConstraint,
    endpoint: &PinRef,
    instance: &PartInstance,
    definitions: &BTreeMap<String, Value>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if let Some(pins) = definitions
        .get(&instance.component)
        .and_then(|definition| definition.get("pins"))
        .and_then(Value::as_object)
        && !pins.contains_key(&endpoint.name)
    {
        diagnostics.push(
            Diagnostic::error(
                "PCBIR003",
                format!("route references unknown pin {}", endpoint.name),
            )
            .with_entity(&endpoint.part)
            .with_help("Use a pin declared by the endpoint's component definition."),
        );
        return;
    }

    match instance.connections.get(&endpoint.name) {
        Some(net) if net == &route.net => {}
        Some(net) => diagnostics.push(
            Diagnostic::error(
                "PCBIR004",
                format!(
                    "route for net {} references pin {}, which belongs to net {}",
                    route.net.0, endpoint.name, net.0
                ),
            )
            .with_entity(&endpoint.part)
            .with_help("Route between pins connected to the same net."),
        ),
        None => diagnostics.push(
            Diagnostic::error(
                "PCBIR005",
                format!("route references unconnected pin {}", endpoint.name),
            )
            .with_entity(&endpoint.part)
            .with_help("Connect the endpoint pin before routing it."),
        ),
    }
}

fn binding_error(code: &'static str, message: impl Into<String>, entity: &str) -> CompileError {
    CompileError::diagnostic(Diagnostic::error(code, message).with_entity(entity))
}

fn validate_footprint(footprint: &FootprintDefinition) -> Result<(), CompileError> {
    if !footprint.resolved {
        return Ok(());
    }
    if footprint.pads.is_empty() {
        return Err(binding_error(
            "PCBIR025",
            "resolved footprint has no pads",
            &footprint.key,
        ));
    }
    let mut ids = BTreeSet::new();
    for pad in &footprint.pads {
        if pad.id.trim().is_empty() || !ids.insert(&pad.id) {
            return Err(binding_error(
                "PCBIR025",
                "footprint pad IDs must be non-empty and unique",
                &footprint.key,
            ));
        }
        if pad.at.iter().any(|value| !value.is_finite())
            || !pad.rotation.is_finite()
            || pad
                .size
                .iter()
                .any(|value| !value.is_finite() || *value <= 0.0)
            || pad.layers.is_empty()
            || pad.layers.iter().collect::<BTreeSet<_>>().len() != pad.layers.len()
            || pad
                .drill
                .as_ref()
                .is_some_and(|drill| !drill.diameter.is_finite() || drill.diameter <= 0.0)
        {
            return Err(binding_error(
                "PCBIR025",
                format!("invalid geometry or layers for pad {}", pad.id),
                &footprint.key,
            ));
        }
    }
    Ok(())
}

fn validate_binding(
    instance: &PartInstance,
    definitions: &BTreeMap<String, Value>,
    footprints: &BTreeMap<String, FootprintDefinition>,
) -> Result<(), CompileError> {
    let footprint = &footprints[&instance.footprint];
    let pins = definitions[&instance.component]
        .get("pins")
        .and_then(Value::as_object);
    let mut mapped = BTreeSet::new();
    for (pin, pads) in &instance.pin_map {
        if pins.is_some_and(|pins| !pins.contains_key(pin)) {
            return Err(binding_error(
                "PCBIR026",
                format!("mapping references unknown logical pin {pin}"),
                &instance.id,
            ));
        }
        for pad in pads {
            if !mapped.insert(pad) {
                return Err(binding_error(
                    "PCBIR012",
                    format!("physical pad {pad} is mapped more than once"),
                    &instance.id,
                ));
            }
            if footprint.resolved && !footprint.pads.iter().any(|physical| &physical.id == pad) {
                return Err(binding_error(
                    "PCBIR026",
                    format!("mapping references unknown physical pad {pad}"),
                    &instance.id,
                ));
            }
        }
    }
    for pin in instance.connections.keys() {
        if !instance.pin_map.contains_key(pin) {
            return Err(binding_error(
                "PCBIR026",
                format!("connected pin {pin} has no physical pad mapping"),
                &instance.id,
            ));
        }
    }
    if definitions[&instance.component]
        .get("pinoutCoverage")
        .and_then(Value::as_str)
        == Some("complete")
    {
        if let Some(pins) = pins {
            for pin in pins.keys() {
                if !instance.pin_map.contains_key(pin) {
                    return Err(binding_error(
                        "PCBIR026",
                        format!("complete pinout has no mapping for {pin}"),
                        &instance.id,
                    ));
                }
            }
        }
    }
    Ok(())
}
