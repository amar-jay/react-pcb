use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::diagnostic::{Diagnostic, Severity};
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
            CompileError(format!(
                "component definition {} pins must be an object",
                instance.definition
            ))
        })?;

        for pin in instance.connections.keys() {
            if !pins.contains_key(pin) {
                return Err(CompileError(format!(
                    "part {} references unknown pin {} in component definition {}",
                    instance.id, pin, instance.definition
                )));
            }
        }
        for (name, pin) in pins {
            if pin.get("required").and_then(Value::as_bool) == Some(true)
                && !instance.connections.contains_key(name)
            {
                return Err(CompileError(format!(
                    "part {} requires a connection for pin {}",
                    instance.id, name
                )));
            }
        }
        validate_complete_pin_coverage(&instance.definition, definition, pins)?;
    }
    Ok(())
}

fn validate_complete_pin_coverage(
    definition_key: &str,
    definition: &Value,
    pins: &serde_json::Map<String, Value>,
) -> Result<(), CompileError> {
    if definition.get("pinoutCoverage").and_then(Value::as_str) != Some("complete") {
        return Ok(());
    }
    if pins.is_empty() {
        return Err(CompileError(format!(
            "complete component definition {definition_key} must declare at least one pin"
        )));
    }

    let mut physical_pads = BTreeSet::new();
    for (name, pin) in pins {
        let pad = pin.get("pad").ok_or_else(|| {
            CompileError(format!(
                "pin {name} in component definition {definition_key} has no pad"
            ))
        })?;
        let pads: Vec<&str> = match pad {
            Value::String(value) if !value.is_empty() => vec![value],
            Value::Array(values) if !values.is_empty() => values
                .iter()
                .map(|value| {
                    value.as_str().filter(|value| !value.is_empty()).ok_or_else(|| {
                        CompileError(format!(
                            "pin {name} in component definition {definition_key} has an invalid pad"
                        ))
                    })
                })
                .collect::<Result<_, _>>()?,
            _ => {
                return Err(CompileError(format!(
                    "pin {name} in component definition {definition_key} has an invalid pad"
                )));
            }
        };
        for pad in pads {
            if !physical_pads.insert(pad) {
                return Err(CompileError(format!(
                    "physical pad {pad} appears more than once in complete component definition {definition_key}"
                )));
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
        diagnostics.push(Diagnostic {
            code: "PCBIR003",
            severity: Severity::Error,
            message: format!(
                "route references unknown pin {} on part {}",
                endpoint.name, endpoint.part
            ),
            entity: Some(endpoint.part.clone()),
        });
        return;
    }

    match instance.connections.get(&endpoint.name) {
        Some(net) if net == &route.net => {}
        Some(net) => diagnostics.push(Diagnostic {
            code: "PCBIR004",
            severity: Severity::Error,
            message: format!(
                "route for net {} references {}.{}, which belongs to net {}",
                route.net.0, endpoint.part, endpoint.name, net.0
            ),
            entity: Some(endpoint.part.clone()),
        }),
        None => diagnostics.push(Diagnostic {
            code: "PCBIR005",
            severity: Severity::Error,
            message: format!(
                "route references unconnected pin {}.{}",
                endpoint.part, endpoint.name
            ),
            entity: Some(endpoint.part.clone()),
        }),
    }
}
