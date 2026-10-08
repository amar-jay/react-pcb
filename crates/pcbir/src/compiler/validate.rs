use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::diagnostic::Diagnostic;
use crate::ir::{ComponentInstance, PinRef, RouteConstraint};

use super::CompileError;

pub fn validate_instances(
    instances: &[ComponentInstance],
    definitions: &BTreeMap<String, Value>,
) -> Result<(), CompileError> {
    for instance in instances {
        let definition = definitions
            .get(&instance.definition)
            .expect("every instance definition is inserted while compiling");
        let Some(pins) = definition.get("pins") else {
            continue;
        };
        let pins = pins.as_object().ok_or_else(|| {
            CompileError::invalid(format!(
                "component definition {} pins must be an object",
                instance.definition
            ))
        })?;

        for pin in instance.connections.keys() {
            if !pins.contains_key(pin) {
                return Err(CompileError::diagnostic(
                    Diagnostic::error("PCBIR008", format!("part references unknown pin {pin}"))
                        .with_entity(&instance.id)
                        .with_help(format!(
                            "Declare {pin} in component definition {}, or correct the connection name.",
                            instance.definition
                        )),
                ));
            }
        }
        validate_pin_definition(&instance.definition, definition, pins)?;
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

    let mut physical_pads = BTreeSet::new();
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
        let pad = pin.get("pad").ok_or_else(|| {
            CompileError::diagnostic(
                Diagnostic::error("PCBIR011", format!("pin {name} has no physical pad"))
                    .with_entity(definition_key)
                    .with_help("Set pad to a pad name or a non-empty list of pad names."),
            )
        })?;
        let pads: Vec<&str> = match pad {
            Value::String(value) if !value.is_empty() => vec![value],
            Value::Array(values) if !values.is_empty() => values
                .iter()
                .map(|value| {
                    value
                        .as_str()
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| {
                            CompileError::diagnostic(
                                Diagnostic::error(
                                    "PCBIR011",
                                    format!("pin {name} has an invalid pad"),
                                )
                                .with_entity(definition_key)
                                .with_help(
                                    "Set pad to a pad name or a non-empty list of pad names.",
                                ),
                            )
                        })
                })
                .collect::<Result<_, _>>()?,
            _ => {
                return Err(CompileError::diagnostic(
                    Diagnostic::error("PCBIR011", format!("pin {name} has an invalid pad"))
                        .with_entity(definition_key)
                        .with_help("Set pad to a pad name or a non-empty list of pad names."),
                ));
            }
        };
        for pad in pads {
            if !physical_pads.insert(pad) {
                return Err(CompileError::diagnostic(
                    Diagnostic::error(
                        "PCBIR012",
                        format!("physical pad {pad} is declared more than once"),
                    )
                    .with_entity(definition_key)
                    .with_help("Assign each physical pad to exactly one logical pin."),
                ));
            }
        }
    }
    Ok(())
}

pub fn validate_route_endpoint(
    route: &RouteConstraint,
    endpoint: &PinRef,
    instance: &ComponentInstance,
    definitions: &BTreeMap<String, Value>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if let Some(pins) = definitions
        .get(&instance.definition)
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
