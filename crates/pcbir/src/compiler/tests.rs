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
                    {"kind": "copper", "id": "copper/1", "thickness": 0.035, "usage": "signal"}
                ]}, "technical": [
                    {"kind": "solder-mask", "id": "solder-mask/front", "side": "front"},
                    {"kind": "solder-mask", "id": "solder-mask/back", "side": "back"}
                ]}
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
    assert_eq!(output.ir.parts[0].id, "U1");
    assert!(matches!(
        output.ir.parts[0].side,
        crate::ir::BoardSide::Front
    ));
    assert_eq!(output.ir.parts[0].rotation, 0.0);
    assert_eq!(output.ir.component_definitions.len(), 1);
    assert_eq!(output.ir.parts[0].component, output.ir.parts[1].component);
    assert_eq!(output.ir.nets[0].0, "3V3");
}

#[test]
fn rejects_conflicting_definitions_for_one_component_key() {
    let with_definition = |id: &str, footprint: &str| {
        json!({"type": "pcb-part", "props": {
            "id": {"id": id, "reference": id}, "footprint": footprint, "connect": {},
            "definition": {"mpn": "SAME", "manufacturer": footprint}
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
                "layers": [{"kind": "copper", "id": "copper/1", "thickness": 0.035, "usage": "plane"}],
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
        {"kind": "copper", "id": "copper/1", "thickness": 0.035, "usage": "signal"},
        {"kind": "copper", "id": "copper/1", "thickness": 0.035, "usage": "signal"}
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

fn physical_part(id: &str) -> Value {
    json!({"type": "pcb-part", "props": {
        "id": {"id": id, "reference": id},
        "definition": {"mpn": "DUAL", "pinoutCoverage": "complete", "pins": {
            "GND": {"electricalType": "passive"}
        }},
        "footprint": {"key": "DUAL-PADS", "pads": [
            {"id": "1", "at": [-1, 0], "shape": "rect", "size": [0.6, 1], "layers": ["copper/1", "solder-mask/front"]},
            {"id": "2", "at": [1, 0], "shape": "circle", "size": [1, 1], "layers": [{"kind": "all-copper"}], "drill": {"diameter": 0.4, "plated": true}}
        ]},
        "pinMap": {"GND": ["1", "2"]}, "connect": {"GND": {"id": "GND"}},
        "at": [10, 20], "rotation": 90, "side": "back"
    }})
}

#[test]
fn separates_electrical_definitions_footprints_and_parts() {
    let output = compile(transaction(vec![physical_part("J1"), physical_part("J2")])).unwrap();
    assert_eq!(output.ir.component_definitions.len(), 1);
    assert_eq!(output.ir.footprint_definitions.len(), 1);
    assert_eq!(output.ir.parts.len(), 2);
    assert_eq!(output.ir.parts[0].pin_map["GND"], vec!["1", "2"]);
    assert_eq!(
        output.ir.footprint_definitions["DUAL-PADS"].pads[0].at,
        [-1.0, 0.0]
    );
    assert!(output.compiler_diagnostics.is_empty());
    let json = serde_json::to_value(output.ir).unwrap();
    assert!(json.get("componentInstances").is_none());
    assert_eq!(json["parts"][0]["component"], "DUAL");
    assert_eq!(json["parts"][0]["footprint"], "DUAL-PADS");
    assert!(
        json["componentDefinitions"]["DUAL"]
            .get("footprint")
            .is_none()
    );
}

#[test]
fn permits_one_component_with_different_footprints() {
    let a = physical_part("J1");
    let mut b = physical_part("J2");
    b["props"]["footprint"]["key"] = json!("ALTERNATE");
    b["props"]["footprint"]["pads"][0]["at"] = json!([-2, 0]);
    let output = compile(transaction(vec![a, b])).unwrap();
    assert_eq!(output.ir.component_definitions.len(), 1);
    assert_eq!(output.ir.footprint_definitions.len(), 2);
}

#[test]
fn rejects_conflicting_footprints_and_invalid_bindings() {
    let a = physical_part("J1");
    let mut b = physical_part("J2");
    b["props"]["footprint"]["pads"][0]["size"] = json!([2, 1]);
    assert_eq!(
        compile(transaction(vec![a, b]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR023"
    );
    let mut missing = physical_part("J1");
    missing["props"]["pinMap"]["GND"] = json!("missing");
    assert_eq!(
        compile(transaction(vec![missing]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR026"
    );
    let mut unmapped = physical_part("J1");
    unmapped["props"]["pinMap"] = json!({});
    assert_eq!(
        compile(transaction(vec![unmapped]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR026"
    );
    let mut unknown = physical_part("J1");
    unknown["props"]["pinMap"]["BAD"] = json!("1");
    assert_eq!(
        compile(transaction(vec![unknown]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR026"
    );
}

#[test]
fn rejects_invalid_physical_pad_geometry() {
    for (field, value) in [
        ("size", json!([0, 1])),
        ("layers", json!([])),
        ("id", json!("2")),
        ("drill", json!({"diameter": -1, "plated": true})),
    ] {
        let mut part = physical_part("J1");
        part["props"]["footprint"]["pads"][0][field] = value;
        assert_eq!(
            compile(transaction(vec![part]))
                .unwrap_err()
                .diagnostic
                .code,
            "PCBIR025"
        );
    }
}

#[test]
fn marks_library_references_as_unresolved() {
    let output = compile(transaction(vec![part(
        "U1",
        "LIBRARY",
        json!({"1": {"id": "GND"}}),
    )]))
    .unwrap();
    assert!(!output.ir.footprint_definitions["LIBRARY"].resolved);
    assert_eq!(output.compiler_diagnostics[0].code, "PCBIR024");
}

#[test]
fn primitive_component_identity_is_independent_of_footprint() {
    let mut a = part("C1", "SMALL", json!({"1": {"id": "GND"}}));
    let mut b = part("C2", "LARGE", json!({"1": {"id": "GND"}}));
    a["props"]["value"] = json!("100nF");
    b["props"]["value"] = json!("100nF");
    let output = compile(transaction(vec![a, b])).unwrap();
    assert_eq!(output.ir.component_definitions.len(), 1);
    assert_eq!(output.ir.footprint_definitions.len(), 2);
    assert_eq!(output.ir.parts[0].component, "value:100nF");
}

#[test]
fn rejects_malformed_footprint_values_without_panicking() {
    for value in [json!(null), json!(42), json!([])] {
        let mut input = physical_part("J1");
        input["props"]["footprint"] = value;
        assert_eq!(
            compile(transaction(vec![input]))
                .unwrap_err()
                .diagnostic
                .code,
            "PCBIR100"
        );
    }
}

fn four_layer_transaction(children: Vec<Value>) -> DeclarationTransaction {
    let mut input = transaction(children);
    input.declarations.children[0].props["layers"] = json!({
        "kind": "layer-set", "stackup": {"kind": "stackup", "entries": [
            {"id": "copper/1", "kind": "copper", "thickness": 0.035, "usage": "signal"},
            {"id": "dielectric/1", "kind": "dielectric", "material": "FR-4", "thickness": 0.2, "epsilonR": 4.2},
            {"id": "copper/2", "kind": "copper", "thickness": 0.035, "usage": "plane"},
            {"id": "dielectric/2", "kind": "dielectric", "material": "FR-4", "thickness": 1.0, "epsilonR": 4.2},
            {"id": "copper/3", "kind": "copper", "thickness": 0.035, "usage": "plane"},
            {"id": "dielectric/3", "kind": "dielectric", "material": "FR-4", "thickness": 0.2, "epsilonR": 4.2},
            {"id": "copper/4", "kind": "copper", "thickness": 0.035, "usage": "signal"}
        ]}, "technical": [
            {"id": "solder-mask/front", "kind": "solder-mask", "side": "front"},
            {"id": "solder-mask/back", "kind": "solder-mask", "side": "back"},
            {"id": "paste/front", "kind": "paste", "side": "front"},
            {"id": "paste/back", "kind": "paste", "side": "back"}
        ]
    });
    input
}

#[test]
fn resolves_custom_layer_ids_and_mirrors_each_placed_part() {
    let mut front = physical_part("J1");
    front["props"]["side"] = json!("front");
    front["props"]["footprint"]["pads"][0]["layers"] =
        json!(["copper/1", "solder-mask/front", "paste/front"]);
    let mut back = front.clone();
    back["props"]["id"] = json!({"id": "J2", "reference": "J2"});
    back["props"]["side"] = json!("back");
    let output = compile(four_layer_transaction(vec![front, back])).unwrap();
    assert_eq!(output.ir.footprint_definitions.len(), 1);
    assert_eq!(
        output.ir.parts[0].pad_layers["1"],
        vec!["copper/1", "paste/front", "solder-mask/front"]
    );
    assert_eq!(
        output.ir.parts[1].pad_layers["1"],
        vec!["copper/4", "paste/back", "solder-mask/back"]
    );
    assert_eq!(
        output.ir.parts[0].pad_layers["2"],
        vec!["copper/1", "copper/2", "copper/3", "copper/4"]
    );
    assert_eq!(
        output.ir.parts[1].pad_layers["2"],
        vec!["copper/1", "copper/2", "copper/3", "copper/4"]
    );
}

#[test]
fn rejects_missing_or_unsuitable_pad_layer_references() {
    for target in ["nonexistent", "dielectric/1"] {
        let mut part = physical_part("J1");
        part["props"]["footprint"]["pads"][0]["layers"] = json!([target]);
        assert_eq!(
            compile(four_layer_transaction(vec![part]))
                .unwrap_err()
                .diagnostic
                .code,
            "PCBIR028"
        );
    }
    let mut part = physical_part("J1");
    part["props"]["footprint"]["pads"][0]["layers"] = json!(["copper/1", {"kind": "all-copper"}]);
    assert_eq!(
        compile(four_layer_transaction(vec![part]))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR028"
    );
}

#[test]
fn rejects_duplicate_layer_ids_across_stackup_and_technical_layers() {
    let mut input = four_layer_transaction(vec![]);
    input.declarations.children[0].props["layers"]["technical"][0]["id"] = json!("copper/1");
    assert_eq!(compile(input).unwrap_err().diagnostic.code, "PCBIR027");
    let mut input = four_layer_transaction(vec![]);
    input.declarations.children[0].props["layers"]["stackup"]["entries"][0]["id"] = json!(" ");
    assert_eq!(compile(input).unwrap_err().diagnostic.code, "PCBIR027");
}

#[test]
fn rejects_missing_opposite_technical_layer_for_back_side_parts() {
    let mut input = transaction(vec![physical_part("J1")]);
    input.declarations.children[0].props["layers"]["technical"]
        .as_array_mut()
        .unwrap()
        .pop();
    assert_eq!(compile(input).unwrap_err().diagnostic.code, "PCBIR028");
}
