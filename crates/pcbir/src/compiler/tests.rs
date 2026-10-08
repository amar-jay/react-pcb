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
    assert_eq!(error.diagnostic.code, "PCBIR007");
}

#[test]
fn rejects_duplicate_component_instance_ids() {
    let error = compile(transaction(vec![
        part("U1", "TEST", json!({})),
        part("U1", "TEST", json!({})),
    ]))
    .unwrap_err();
    assert_eq!(error.diagnostic.code, "PCBIR006");
    assert_eq!(error.diagnostic.entity.as_deref(), Some("U1"));
}

#[test]
fn rejects_duplicate_modules_even_when_one_is_empty() {
    let module = |children: Vec<Value>| {
        json!({
            "type": "pcb-module",
            "props": {"name": "usb-controller", "scope": "usb-controller"},
            "children": children
        })
    };
    let error = compile(transaction(vec![
        module(vec![]),
        module(vec![part("usb-controller/U1", "TEST", json!({}))]),
    ]))
    .unwrap_err();

    assert_eq!(error.diagnostic.code, "PCBIR013");
    assert_eq!(error.diagnostic.entity.as_deref(), Some("usb-controller"));
}

#[test]
fn warns_about_empty_modules() {
    let empty_module = json!({
        "type": "pcb-module",
        "props": {"name": "unused", "scope": "unused"},
        "children": []
    });
    let output = compile(transaction(vec![empty_module])).unwrap();

    assert!(output.diagnostics.is_empty());
    assert_eq!(output.compiler_diagnostics.len(), 1);
    assert_eq!(output.compiler_diagnostics[0].code, "PCBIR014");
    assert_eq!(
        output.compiler_diagnostics[0].entity.as_deref(),
        Some("unused")
    );
}

#[test]
fn rejects_exact_duplicate_zones_and_keepouts() {
    let zone = || {
        json!({
            "type": "pcb-zone",
            "props": {
                "net": {"kind": "net", "id": "GND", "name": "GND"},
                "layers": [{"kind": "copper", "thickness": 0.035, "usage": "plane"}],
                "boundary": "board",
                "clearance": 0.2
            },
            "children": []
        })
    };
    let keepout = || {
        json!({
            "type": "pcb-keepout",
            "props": {
                "region": {"kind": "rect", "x": 0, "y": 0, "width": 8, "height": 12},
                "disallow": ["vias", "copper"]
            },
            "children": []
        })
    };

    let zone_error = compile(transaction(vec![zone(), zone()])).unwrap_err();
    assert_eq!(zone_error.diagnostic.code, "PCBIR015");

    let keepout_error = compile(transaction(vec![keepout(), keepout()])).unwrap_err();
    assert_eq!(keepout_error.diagnostic.code, "PCBIR016");
}

#[test]
fn rejects_invalid_geometry_stackups_identifiers_and_routes() {
    let mut invalid_board = transaction(vec![]);
    invalid_board.declarations.children[0].props["outline"]["width"] = json!(0);
    assert_eq!(
        compile(invalid_board).unwrap_err().diagnostic.code,
        "PCBIR017"
    );

    let mut invalid_stackup = transaction(vec![]);
    invalid_stackup.declarations.children[0].props["layers"]["stackup"]["entries"] = json!([
        {"kind": "copper", "thickness": 0.035, "usage": "signal"},
        {"kind": "copper", "thickness": 0.035, "usage": "signal"}
    ]);
    assert_eq!(
        compile(invalid_stackup).unwrap_err().diagnostic.code,
        "PCBIR018"
    );

    let invalid_part = part("", "TEST", json!({}));
    assert_eq!(
        compile(transaction(vec![invalid_part]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR019"
    );

    let route = json!({"type": "pcb-route", "props": {
        "net": {"id": "GND"},
        "from": {"part": {"id": "U1"}, "name": "1"},
        "to": {"part": {"id": "U1"}, "name": "1"},
        "width": -0.1
    }, "children": []});
    assert_eq!(
        compile(transaction(vec![route]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR020"
    );
}

#[test]
fn validates_constraint_properties_and_normalizes_set_order() {
    let keepout = |disallow: Value| {
        json!({
            "type": "pcb-keepout",
            "props": {
                "region": {"kind": "rect", "x": 0, "y": 0, "width": 8, "height": 12},
                "disallow": disallow
            },
            "children": []
        })
    };
    let reordered = compile(transaction(vec![
        keepout(json!(["vias", "copper"])),
        keepout(json!(["copper", "vias"])),
    ]))
    .unwrap_err();
    assert_eq!(reordered.diagnostic.code, "PCBIR016");

    let empty = compile(transaction(vec![keepout(json!([]))])).unwrap_err();
    assert_eq!(empty.diagnostic.code, "PCBIR021");

    let repeated = compile(transaction(vec![keepout(json!(["vias", "vias"]))])).unwrap_err();
    assert_eq!(repeated.diagnostic.code, "PCBIR021");

    let invalid_zone = json!({
        "type": "pcb-zone",
        "props": {
            "net": {"id": "GND"}, "layers": [], "boundary": "board", "clearance": -1
        },
        "children": []
    });
    assert_eq!(
        compile(transaction(vec![invalid_zone]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR021"
    );
}

#[test]
fn rejects_forged_module_scopes() {
    let nested = json!({
        "type": "pcb-module",
        "props": {"name": "parent", "scope": "parent"},
        "children": [{
            "type": "pcb-module",
            "props": {"name": "child", "scope": "wrong/child"},
            "children": []
        }]
    });
    let error = compile(transaction(vec![nested])).unwrap_err();
    assert_eq!(error.diagnostic.code, "PCBIR019");
}

#[test]
fn rejects_unknown_and_missing_required_part_pins() {
    let pins = json!({"VCC": {"pad": "1", "electricalType": "passive", "required": true}});
    let unknown = defined_part("U1", json!({"BAD": {"id": "3V3"}}), pins.clone(), "partial");
    assert_eq!(
        compile(transaction(vec![unknown]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR008"
    );

    let missing = defined_part("U1", json!({}), pins, "partial");
    assert_eq!(
        compile(transaction(vec![missing]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR009"
    );
}

#[test]
fn validates_complete_definition_physical_pad_coverage() {
    let part = defined_part(
        "U1",
        json!({}),
        json!({
            "A": {"pad": "1", "electricalType": "passive"},
            "B": {"pad": ["1", "2"], "electricalType": "passive"}
        }),
        "complete",
    );
    assert_eq!(
        compile(transaction(vec![part]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR012"
    );
}

#[test]
fn validates_partial_component_pin_schemas() {
    let duplicate_pads = defined_part(
        "U1",
        json!({}),
        json!({
            "A": {"pad": "1", "electricalType": "passive"},
            "B": {"pad": "1", "electricalType": "passive"}
        }),
        "partial",
    );
    assert_eq!(
        compile(transaction(vec![duplicate_pads]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR012"
    );

    let invalid_type = defined_part(
        "U1",
        json!({}),
        json!({"A": {"pad": "1", "electricalType": "mystery"}}),
        "partial",
    );
    assert_eq!(
        compile(transaction(vec![invalid_type]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR022"
    );

    let invalid_coverage = defined_part(
        "U1",
        json!({}),
        json!({"A": {"pad": "1", "electricalType": "passive"}}),
        "unknown",
    );
    assert_eq!(
        compile(transaction(vec![invalid_coverage]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR022"
    );
}

#[test]
fn diagnoses_route_pin_and_net_mismatches() {
    let part = defined_part(
        "U1",
        json!({"A": {"id": "NET-A"}, "B": {"id": "NET-B"}}),
        json!({
            "A": {"pad": "1", "electricalType": "passive"},
            "B": {"pad": "2", "electricalType": "passive"}
        }),
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
