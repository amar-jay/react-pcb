use serde_json::{Value, json};

use super::compile;
use crate::protocol::DeclarationTransaction;

fn transaction(children: Vec<Value>) -> DeclarationTransaction {
    serde_json::from_value(json!({
        "protocolVersion": 1,
        "declarations": {"kind": "react-pcb-declarations", "children": [{
            "type": "pcb-board",
            "props": {
                "outline": {"kind": "rect", "x": 0, "y": 0, "width": 10, "height": 10},
                "layers": {"kind": "layer-set", "stackup": {"kind": "stackup", "entries": [
                    {"kind": "copper", "thickness": 0.035, "usage": "signal"}
                ]}, "technical": []}
            },
            "children": children
        }]}
    }))
    .unwrap()
}

fn part(id: &str, footprint: &str, connect: Value) -> Value {
    json!({"type": "pcb-part", "props": {
        "id": {"id": id, "reference": id}, "footprint": footprint, "connect": connect
    }, "children": []})
}

fn defined_part(id: &str, connect: Value, pins: Value, coverage: &str) -> Value {
    json!({"type": "pcb-part", "props": {
        "id": {"id": id, "reference": id}, "footprint": "TEST", "connect": connect,
        "definition": {
            "mpn": "TEST-PART", "footprint": "TEST",
            "pinoutCoverage": coverage, "pins": pins
        }
    }, "children": []})
}

#[test]
fn compiles_declarations_into_canonical_ir() {
    let mut input = transaction(vec![
        part("U1", "QFN-32", json!({"VDD": {"id": "3V3"}})),
        part("U2", "QFN-32", json!({"VDD": {"id": "3V3"}})),
    ]);
    input.base_revision = Some(7);

    let output = compile(input).unwrap();
    assert_eq!(output.ir.revision.0, 8);
    assert!(matches!(output.ir.units, crate::ir::LengthUnit::Mm));
    assert_eq!(output.ir.component_instances[0].id, "U1");
    assert!(matches!(
        output.ir.component_instances[0].side,
        crate::ir::BoardSide::Front
    ));
    assert_eq!(output.ir.component_instances[0].rotation, 0.0);
    assert_eq!(output.ir.component_definitions.len(), 1);
    assert_eq!(
        output.ir.component_instances[0].definition,
        output.ir.component_instances[1].definition
    );
    assert_eq!(output.ir.nets[0].0, "3V3");
}

#[test]
fn rejects_conflicting_definitions_for_one_component_key() {
    let with_definition = |id: &str, footprint: &str| {
        json!({"type": "pcb-part", "props": {
            "id": {"id": id, "reference": id}, "footprint": footprint, "connect": {},
            "definition": {"mpn": "SAME", "footprint": footprint}
        }, "children": []})
    };
    let error = compile(transaction(vec![
        with_definition("U1", "A"),
        with_definition("U2", "B"),
    ]))
    .unwrap_err();
    assert_eq!(
        error.0,
        "component definition SAME conflicts with an existing definition"
    );
}

#[test]
fn rejects_duplicate_component_instance_ids() {
    let error = compile(transaction(vec![
        part("U1", "TEST", json!({})),
        part("U1", "TEST", json!({})),
    ]))
    .unwrap_err();
    assert_eq!(error.0, "duplicate component instance id U1");
}

#[test]
fn rejects_unknown_and_missing_required_part_pins() {
    let pins = json!({"VCC": {"pad": "1", "required": true}});
    let unknown = defined_part("U1", json!({"BAD": {"id": "3V3"}}), pins.clone(), "partial");
    assert_eq!(
        compile(transaction(vec![unknown])).unwrap_err().0,
        "part U1 references unknown pin BAD in component definition TEST-PART"
    );

    let missing = defined_part("U1", json!({}), pins, "partial");
    assert_eq!(
        compile(transaction(vec![missing])).unwrap_err().0,
        "part U1 requires a connection for pin VCC"
    );
}

#[test]
fn validates_complete_definition_physical_pad_coverage() {
    let part = defined_part(
        "U1",
        json!({}),
        json!({"A": {"pad": "1"}, "B": {"pad": ["1", "2"]}}),
        "complete",
    );
    assert_eq!(
        compile(transaction(vec![part])).unwrap_err().0,
        "physical pad 1 appears more than once in complete component definition TEST-PART"
    );
}

#[test]
fn diagnoses_route_pin_and_net_mismatches() {
    let part = defined_part(
        "U1",
        json!({"A": {"id": "NET-A"}, "B": {"id": "NET-B"}}),
        json!({"A": {"pad": "1"}, "B": {"pad": "2"}}),
        "complete",
    );
    let route = |pin: &str| {
        json!({"type": "pcb-route", "props": {
            "net": {"id": "NET-A"},
            "from": {"part": {"id": "U1"}, "name": pin},
            "to": {"part": {"id": "U1"}, "name": "A"}
        }, "children": []})
    };

    let wrong_net = compile(transaction(vec![part.clone(), route("B")])).unwrap();
    assert_eq!(wrong_net.diagnostics[0].code, "PCBIR004");
    let unknown_pin = compile(transaction(vec![part, route("NOPE")])).unwrap();
    assert_eq!(unknown_pin.diagnostics[0].code, "PCBIR003");
}
