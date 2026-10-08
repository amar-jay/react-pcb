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
    assert_eq!(output.ir.schema_version, crate::SCHEMA_VERSION);
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
    assert_eq!(output.ir.nets[0].id.0, "3V3");
    assert_eq!(output.ir.nets[0].name, "3V3");
}

#[test]
fn canonical_ir_round_trips_through_json() {
    let original = compile(transaction(vec![part(
        "U1",
        "QFN-32",
        json!({"VDD": {"id": "power/3v3", "name": "3V3"}}),
    )]))
    .unwrap()
    .ir;
    let encoded = serde_json::to_value(&original).unwrap();
    let decoded: crate::BoardIr = serde_json::from_value(encoded.clone()).unwrap();
    assert_eq!(serde_json::to_value(decoded).unwrap(), encoded);
    assert_eq!(original.nets[0].id.0, "power/3v3");
    assert_eq!(original.nets[0].name, "3V3");
}

#[test]
fn rejects_conflicting_names_for_one_net_id() {
    let error = compile(transaction(vec![
        part("U1", "TEST", json!({"1": {"id": "supply", "name": "3V3"}})),
        part("U2", "TEST", json!({"1": {"id": "supply", "name": "VCC"}})),
    ]))
    .unwrap_err();
    assert_eq!(error.diagnostic.code, "PCBIR030");
}

#[test]
fn rejects_conflicting_definitions_for_one_component_key() {
    let with_definition = |id: &str, footprint: &str| {
        json!({"type": "pcb-part", "props": {
            "id": {"id": id, "reference": id}, "footprint": footprint, "connect": {},
            "definition": {"key": "catalog/same", "mpn": "SAME", "manufacturer": footprint}
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
fn manufacturer_and_mpn_form_the_default_component_identity() {
    let component = |id: &str, manufacturer: &str| {
        json!({"type": "pcb-part", "props": {
        "id": {"id": id, "reference": id}, "footprint": "TEST", "connect": {},
        "definition": {"mpn": "SAME", "manufacturer": manufacturer}
    }, "children": []})
    };
    let output = compile(transaction(vec![
        component("U1", "A"),
        component("U2", "B"),
    ]))
    .unwrap();
    assert_eq!(output.ir.component_definitions.len(), 2);
    assert_ne!(output.ir.parts[0].component, output.ir.parts[1].component);
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

    let wrong_net = compile(transaction(vec![part.clone(), route("B")])).unwrap_err();
    assert_eq!(wrong_net.diagnostic.code, "PCBIR004");
    let unknown_pin = compile(transaction(vec![part, route("NOPE")])).unwrap_err();
    assert_eq!(unknown_pin.diagnostic.code, "PCBIR003");
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

fn intent_design() -> Vec<Value> {
    vec![
        part("U1", "TEST", json!({"P": {"id": "P"}, "N": {"id": "N"}})),
        part("U2", "TEST", json!({"P": {"id": "P"}, "N": {"id": "N"}})),
        json!({"type": "pcb-route", "props": {
            "net": {"id": "P"}, "from": {"part": {"id": "U1"}, "name": "P"},
            "to": {"part": {"id": "U2"}, "name": "P"}, "width": 0.2
        }, "children": [{"type": "pcb-route-through", "props": {
            "region": {"kind": "rect", "x": 1, "y": 1, "width": 2, "height": 2}
        }}]}),
        json!({"type": "pcb-differential-pair", "props": {
            "positive": {"id": "P"}, "negative": {"id": "N"}, "width": 0.2, "gap": 0.15, "targetImpedance": 90,
            "from": [{"part": {"id": "U1"}, "name": "P"}, {"part": {"id": "U1"}, "name": "N"}],
            "to": [{"part": {"id": "U2"}, "name": "P"}, {"part": {"id": "U2"}, "name": "N"}]
        }, "children": [{"type": "pcb-route-through", "props": {
            "region": {"kind": "rect", "x": 3, "y": 3, "width": 2, "height": 2}
        }}]}),
        json!({"type": "pcb-zone", "props": {
            "net": {"id": "N"}, "layers": [{"id": "copper/1"}], "boundary": "board", "clearance": 0.2
        }}),
        json!({"type": "pcb-keepout", "props": {
            "region": {"kind": "rect", "x": 1, "y": 1, "width": 2, "height": 2}, "disallow": ["vias"], "except": [{"id": "N"}]
        }}),
    ]
}

#[test]
fn assigns_ids_in_ir_and_retains_all_supported_intent() {
    let output = compile(transaction(intent_design())).unwrap();
    let ir = &output.ir;
    assert_eq!(ir.board.id, "board/1");
    assert_eq!(ir.route_constraints.len(), 1);
    assert_eq!(ir.differential_pairs.len(), 1);
    assert_eq!(ir.zones.len(), 1);
    assert_eq!(ir.keepouts.len(), 1);
    assert_eq!(ir.regions.len(), 4);
    assert_eq!(ir.zones[0].layers, vec!["copper/1"]);
    assert_eq!(ir.zones[0].boundary, ir.board.outline);
    for reference in [
        &ir.board.outline,
        &ir.route_constraints[0].through[0],
        &ir.differential_pairs[0].through[0],
        &ir.keepouts[0].region,
    ] {
        assert_eq!(&ir.regions[reference].id, reference);
    }
    let ids = [
        &ir.route_constraints[0].id,
        &ir.differential_pairs[0].id,
        &ir.zones[0].id,
        &ir.keepouts[0].id,
    ];
    assert!(ids.iter().all(|id| !id.is_empty()));
    assert_eq!(
        ids.iter().collect::<std::collections::BTreeSet<_>>().len(),
        4
    );
    let serialized = serde_json::to_string(ir).unwrap();
    assert!(!serialized.contains("pcb-"));
    assert!(!serialized.contains("sourceKey"));
    assert!(output.diagnostics.is_empty());
}

#[test]
fn identities_survive_reordering_insertion_and_geometry_or_rule_edits() {
    let baseline = compile(transaction(intent_design())).unwrap().ir;
    let mut edited = intent_design();
    edited[2]["props"]["width"] = json!(0.4);
    edited[2]["children"][0]["props"]["region"]["x"] = json!(5);
    edited[3]["props"]["gap"] = json!(0.3);
    edited[4]["props"]["clearance"] = json!(0.5);
    edited[5]["props"]["region"]["width"] = json!(5);
    edited[5]["props"]["disallow"] = json!(["copper", "vias"]);
    edited.reverse();
    edited.insert(0, part("U3", "TEST", json!({"P": {"id": "P"}})));
    let mut other = intent_design()[2].clone();
    other["props"]["to"]["part"]["id"] = json!("U3");
    edited.insert(0, other);
    let next = compile(transaction(edited)).unwrap().ir;
    let existing_route = next
        .route_constraints
        .iter()
        .find(|route| route.to.part == "U2")
        .unwrap();
    assert_eq!(baseline.route_constraints[0].id, existing_route.id);
    assert_eq!(
        baseline.route_constraints[0].through,
        existing_route.through
    );
    assert_eq!(
        baseline.differential_pairs[0].id,
        next.differential_pairs[0].id
    );
    assert_eq!(baseline.zones[0].id, next.zones[0].id);
    assert_eq!(baseline.keepouts[0].id, next.keepouts[0].id);
    assert_eq!(baseline.keepouts[0].region, next.keepouts[0].region);
    assert_eq!(baseline.board.outline, next.board.outline);
    assert_eq!(next.regions[&next.keepouts[0].region].geometry.width, 5.0);
}

#[test]
fn identity_hints_distinguish_repeated_anonymous_regions_and_survive_reordering() {
    let mut design = intent_design();
    let mut extra = design[2]["children"][0].clone();
    design[2]["children"][0]["sourceKey"] = json!("entry");
    extra["sourceKey"] = json!("exit");
    extra["props"]["region"]["x"] = json!(8);
    design[2]["children"].as_array_mut().unwrap().push(extra);
    let first = compile(transaction(design.clone())).unwrap().ir;
    design[2]["children"].as_array_mut().unwrap().reverse();
    design[2]["children"][0]["props"]["region"]["width"] = json!(9);
    let second = compile(transaction(design)).unwrap().ir;
    assert_eq!(
        first.route_constraints[0].through[0],
        second.route_constraints[0].through[1]
    );
    assert_eq!(
        first.route_constraints[0].through[1],
        second.route_constraints[0].through[0]
    );
}

#[test]
fn rejects_ambiguous_identity_and_invalid_references() {
    let mut design = intent_design();
    let extra = design[2]["children"][0].clone();
    design[2]["children"].as_array_mut().unwrap().push(extra);
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR029"
    );
    let mut design = intent_design();
    design[2]["props"]["to"]["part"]["id"] = json!("MISSING");
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR002"
    );
    let mut design = intent_design();
    design[4]["props"]["layers"] = json!([{"id": "nonexistent"}]);
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR028"
    );
    let mut design = intent_design();
    design[3]["props"]["to"][1]["name"] = json!("P");
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR004"
    );
}

#[test]
fn identity_namespaces_allow_the_same_frontend_key_in_different_modules() {
    let keepout = intent_design()[5].clone();
    let module = |name: &str| json!({"type": "pcb-module", "props": {"name": name, "scope": name}, "children": [keepout]});
    let ir = compile(transaction(vec![module("left"), module("right")]))
        .unwrap()
        .ir;
    assert_eq!(ir.keepouts.len(), 2);
    assert_ne!(ir.keepouts[0].id, ir.keepouts[1].id);
}

#[test]
fn keyed_constraints_keep_identity_when_semantic_references_change() {
    let mut design = intent_design();
    design[2]["sourceKey"] = json!("supply-route");
    let before = compile(transaction(design.clone())).unwrap().ir;
    design[2]["props"]["net"] = json!({"id": "N"});
    design[2]["props"]["from"]["name"] = json!("N");
    design[2]["props"]["to"]["name"] = json!("N");
    let after = compile(transaction(design)).unwrap().ir;
    assert_eq!(
        before.route_constraints[0].id,
        after.route_constraints[0].id
    );
}
