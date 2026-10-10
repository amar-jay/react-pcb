use serde_json::{Value, json};

use super::compile;
use crate::protocol::DeclarationTransaction;

fn transaction(children: Vec<Value>) -> DeclarationTransaction {
    serde_json::from_value(json!({
        "protocolVersion": crate::PROTOCOL_VERSION,
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

fn connectivity_route(net: &str, from: (&str, &str), to: (&str, &str)) -> Value {
    json!({"type": "pcb-route", "props": {
        "net": {"id": net},
        "from": {"part": {"id": from.0}, "name": from.1},
        "to": {"part": {"id": to.0}, "name": to.1}
    }})
}

fn connectivity_warnings(output: &super::CompileOutput) -> Vec<serde_json::Value> {
    output
        .compiler_diagnostics
        .iter()
        .filter(|d| matches!(d.code, "PCBIR032" | "PCBIR033" | "PCBIR034"))
        .map(|d| serde_json::to_value(d).unwrap())
        .collect()
}

#[test]
fn warns_about_unconnected_declared_and_mapped_pins() {
    let device = defined_part(
        "U1",
        json!({}),
        json!({
            "A": {"pad": ["1", "2"], "electricalType": "passive"},
            "B": {"pad": "3", "electricalType": "passive"}
        }),
        "complete",
    );
    let mut mapped_only = part("J1", "TEST", json!({}));
    mapped_only["props"]["pinMap"] = json!({"signal": ["1", "2"]});
    let output = compile(transaction(vec![device, mapped_only])).unwrap();
    let warnings = connectivity_warnings(&output);
    assert_eq!(warnings.len(), 2);
    assert_eq!(warnings[0]["entity"], "J1");
    assert_eq!(warnings[0]["message"], "unconnected pins: signal");
    assert_eq!(warnings[1]["entity"], "U1");
    assert_eq!(warnings[1]["message"], "unconnected pins: A, B");
    assert!(warnings.iter().all(|d| d["severity"] == "warning"));
}

#[test]
fn warns_about_empty_nets_and_single_logical_endpoints_even_with_many_pads() {
    let output = compile(transaction(vec![
        physical_part("J1"),
        json!({"type": "pcb-zone", "props": {
            "net": {"id": "EMPTY"}, "layers": [{"id": "copper/1"}], "boundary": "board"
        }}),
    ]))
    .unwrap();
    let warnings = connectivity_warnings(&output);
    assert_eq!(warnings.len(), 2);
    assert_eq!(warnings[0]["code"], "PCBIR033");
    assert_eq!(warnings[0]["entity"], "EMPTY");
    assert_eq!(
        warnings[0]["message"],
        "net EMPTY has no connected endpoints"
    );
    assert_eq!(warnings[1]["code"], "PCBIR033");
    assert_eq!(warnings[1]["entity"], "GND");
    assert_eq!(
        warnings[1]["message"],
        "net GND has only one connected endpoint: J1.GND"
    );
}

#[test]
fn warns_about_missing_routes_and_isolated_endpoints_without_assuming_zone_connections() {
    let mut declarations = vec![
        part("U1", "TEST", json!({"1": {"id": "SIG"}})),
        part("U2", "TEST", json!({"1": {"id": "SIG"}})),
        part("U3", "TEST", json!({"1": {"id": "SIG"}})),
        json!({"type": "pcb-zone", "props": {
            "net": {"id": "SIG"}, "layers": [{"id": "copper/1"}], "boundary": "board"
        }}),
    ];
    let warnings = connectivity_warnings(&compile(transaction(declarations.clone())).unwrap());
    assert_eq!(warnings.len(), 1);
    assert_eq!(warnings[0]["code"], "PCBIR034");
    assert_eq!(
        warnings[0]["message"],
        "net SIG has 3 disconnected endpoint groups in routing intent: [U1.1] | [U2.1] | [U3.1]"
    );
    declarations.push(connectivity_route("SIG", ("U1", "1"), ("U2", "1")));
    let warnings = connectivity_warnings(&compile(transaction(declarations.clone())).unwrap());
    assert_eq!(warnings.len(), 1);
    assert_eq!(
        warnings[0]["message"],
        "net SIG has 2 disconnected endpoint groups in routing intent: [U1.1, U2.1] | [U3.1]"
    );
    declarations.push(connectivity_route("SIG", ("U3", "1"), ("U2", "1")));
    assert!(connectivity_warnings(&compile(transaction(declarations)).unwrap()).is_empty());
}

#[test]
fn diagnoses_disjoint_route_groups_and_accepts_chains_branches_and_cycles() {
    let mut declarations: Vec<_> = ["U1", "U2", "U3", "U4"]
        .into_iter()
        .map(|id| part(id, "TEST", json!({"1": {"id": "SIG"}})))
        .collect();
    declarations.extend([
        connectivity_route("SIG", ("U1", "1"), ("U2", "1")),
        connectivity_route("SIG", ("U3", "1"), ("U4", "1")),
    ]);
    let original = connectivity_warnings(&compile(transaction(declarations.clone())).unwrap());
    assert_eq!(original.len(), 1);
    assert_eq!(
        original[0]["message"],
        "net SIG has 2 disconnected endpoint groups in routing intent: [U1.1, U2.1] | [U3.1, U4.1]"
    );
    declarations.reverse();
    assert_eq!(
        connectivity_warnings(&compile(transaction(declarations.clone())).unwrap()),
        original
    );
    declarations.extend([
        connectivity_route("SIG", ("U2", "1"), ("U3", "1")),
        connectivity_route("SIG", ("U1", "1"), ("U3", "1")),
    ]);
    assert!(connectivity_warnings(&compile(transaction(declarations)).unwrap()).is_empty());
}

#[test]
fn connectivity_uses_stable_net_and_part_ids_instead_of_display_names() {
    let endpoint = |id: &str, net_id: &str| {
        let mut declaration = part(id, "TEST", json!({"1": {"id": net_id, "name": "SIG"}}));
        declaration["props"]["id"]["reference"] = json!("U1");
        declaration
    };
    let output = compile(transaction(vec![
        endpoint("left/U1", "left/SIG"),
        endpoint("right/U1", "right/SIG"),
    ]))
    .unwrap();
    let warnings = connectivity_warnings(&output);
    assert_eq!(warnings.len(), 2);
    assert_eq!(warnings[0]["entity"], "left/SIG");
    assert_eq!(warnings[1]["entity"], "right/SIG");
    assert!(warnings.iter().all(|d| d["code"] == "PCBIR033"));
}

#[test]
fn differential_pair_legs_connect_endpoints_without_duplicate_route_declarations() {
    let output = compile(transaction(intent_design())).unwrap();
    assert!(connectivity_warnings(&output).is_empty());
}

fn scoped_keepout(props: Value) -> Value {
    let mut node = json!({"type": "pcb-keepout", "props": {
        "region": {"kind": "rect", "x": 1, "y": 1, "width": 2, "height": 2},
        "disallow": ["components", "copper"]
    }});
    node["props"]
        .as_object_mut()
        .unwrap()
        .extend(props.as_object().unwrap().clone());
    node
}

#[test]
fn keepout_scope_defaults_and_selections_are_explicit_in_current_ir() {
    let compile_scope = |props| {
        compile(transaction(vec![scoped_keepout(props)]))
            .unwrap()
            .ir
    };
    let ir = compile_scope(json!({}));
    assert_eq!(ir.schema_version, 3);
    let encoded = serde_json::to_value(&ir).unwrap();
    assert_eq!(
        encoded["keepouts"][0]["componentSides"],
        json!(["front", "back"])
    );
    assert_eq!(encoded["keepouts"][0]["copperLayers"], json!(["copper/1"]));
    let selected = compile_scope(
        json!({"componentSides": ["back"], "copperLayers": [{"id": "copper/1", "kind": "copper"}]}),
    );
    assert_eq!(
        selected.keepouts[0].component_sides,
        vec![crate::BoardSide::Back]
    );
    assert_eq!(selected.keepouts[0].copper_layers, vec!["copper/1"]);
    assert_eq!(selected.keepouts[0].id, ir.keepouts[0].id);
    assert_eq!(selected.keepouts[0].region, ir.keepouts[0].region);
    let components = compile_scope(json!({"disallow": ["components"]}));
    assert!(components.keepouts[0].copper_layers.is_empty());
    let tracks = compile_scope(json!({"disallow": ["tracks", "vias"]}));
    assert!(tracks.keepouts[0].component_sides.is_empty());
    assert_eq!(tracks.keepouts[0].copper_layers, vec!["copper/1"]);
    assert_eq!(
        serde_json::to_value(crate::decode_board_ir(encoded.clone()).unwrap()).unwrap(),
        encoded
    );
}

#[test]
fn keepout_scope_rejects_invalid_duplicate_and_inapplicable_selections() {
    for props in [
        json!({"componentSides": []}),
        json!({"componentSides": ["front", "front"]}),
        json!({"componentSides": ["middle"]}),
        json!({"componentSides": null}),
        json!({"copperLayers": []}),
        json!({"copperLayers": ["copper/1", {"id": "copper/1"}]}),
        json!({"copperLayers": ["missing"]}),
        json!({"copperLayers": ["solder-mask/front"]}),
        json!({"copperLayers": [{"id": "copper/1", "kind": "dielectric"}]}),
        json!({"copperLayers": null}),
        json!({"disallow": ["components"], "copperLayers": ["copper/1"]}),
        json!({"disallow": ["copper"], "componentSides": ["front"]}),
        json!({"disallow": ["components"], "except": [{"id": "GND"}]}),
        json!({"componentSide": "front"}),
        json!({"layers": ["copper/1"]}),
    ] {
        let error = compile(transaction(vec![scoped_keepout(props.clone())])).unwrap_err();
        assert_eq!(error.diagnostic.code, "PCBIR035", "{props}");
    }
    for props in [json!({"except": {}}), json!({"except": null})] {
        assert_eq!(
            compile(transaction(vec![scoped_keepout(props)]))
                .unwrap_err()
                .diagnostic
                .code,
            "PCBIR021"
        );
    }
}

#[test]
fn constraint_properties_cannot_silently_ignore_unsupported_scope() {
    let mut design = intent_design();
    design[2]["props"]["layers"] = json!(["copper/1"]);
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR020"
    );
    let mut design = intent_design();
    design[3]["props"]["side"] = json!("front");
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR020"
    );
    let mut design = intent_design();
    design[2]["children"][0]["props"]["copperLayers"] = json!(["copper/1"]);
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR020"
    );
    let mut design = intent_design();
    design[4]["props"]["side"] = json!("front");
    assert_eq!(
        compile(transaction(design)).unwrap_err().diagnostic.code,
        "PCBIR021"
    );
}

#[test]
fn schema_two_upgrade_preserves_every_existing_field_and_requires_explicit_opt_in() {
    let ir = compile(transaction(intent_design())).unwrap().ir;
    let expected = serde_json::to_value(&ir).unwrap();
    let mut legacy = expected.clone();
    legacy["schemaVersion"] = json!(2);
    for keepout in legacy["keepouts"].as_array_mut().unwrap() {
        keepout.as_object_mut().unwrap().remove("componentSides");
        keepout.as_object_mut().unwrap().remove("copperLayers");
    }
    assert_eq!(
        crate::decode_board_ir(legacy.clone())
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR036"
    );
    let upgraded = crate::upgrade_board_ir(legacy.clone()).unwrap();
    assert_eq!(serde_json::to_value(&upgraded).unwrap(), expected);
    assert_eq!(
        serde_json::to_value(crate::upgrade_board_ir(expected.clone()).unwrap()).unwrap(),
        expected
    );
    assert!(crate::board_svg(&upgraded).is_ok());
    for version in [0, 1, 4, 99] {
        let mut input = legacy.clone();
        input["schemaVersion"] = json!(version);
        assert_eq!(
            crate::upgrade_board_ir(input).unwrap_err().diagnostic.code,
            "PCBIR036"
        );
    }
    legacy["keepouts"][0]["copperLayers"] = json!(["copper/1"]);
    assert_eq!(
        crate::upgrade_board_ir(legacy).unwrap_err().diagnostic.code,
        "PCBIR036"
    );
}

#[test]
fn schema_two_upgrade_sets_global_defaults_only_for_applicable_restrictions() {
    for restrictions in [
        json!(["components"]),
        json!(["copper", "tracks", "vias"]),
        json!(["components", "tracks"]),
    ] {
        let current = compile(transaction(vec![scoped_keepout(
            json!({"disallow": restrictions}),
        )]))
        .unwrap()
        .ir;
        let expected = serde_json::to_value(&current).unwrap();
        let mut legacy = expected.clone();
        legacy["schemaVersion"] = json!(2);
        legacy["keepouts"][0]
            .as_object_mut()
            .unwrap()
            .remove("componentSides");
        legacy["keepouts"][0]
            .as_object_mut()
            .unwrap()
            .remove("copperLayers");
        assert_eq!(
            serde_json::to_value(crate::upgrade_board_ir(legacy).unwrap()).unwrap(),
            expected
        );
    }
}

#[test]
fn current_serialized_scope_is_validated_by_every_board_consumer() {
    let ir = compile(transaction(vec![scoped_keepout(json!({}))]))
        .unwrap()
        .ir;
    let mut value = serde_json::to_value(&ir).unwrap();
    value["keepouts"][0]["componentSide"] = json!("front");
    assert_eq!(
        crate::decode_board_ir(value).unwrap_err().diagnostic.code,
        "PCBIR036"
    );
    let mut value = serde_json::to_value(&ir).unwrap();
    value["keepouts"][0]
        .as_object_mut()
        .unwrap()
        .remove("componentSides");
    assert_eq!(
        crate::decode_board_ir(value).unwrap_err().diagnostic.code,
        "PCBIR036"
    );
    let mut forged = ir;
    forged.keepouts[0].copper_layers = vec!["solder-mask/front".to_owned()];
    assert_eq!(
        crate::decode_board_ir(serde_json::to_value(&forged).unwrap())
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR035"
    );
    assert_eq!(
        crate::board_svg(&forged).unwrap_err().diagnostic.code,
        "PCBIR035"
    );
    let profile = serde_json::from_value::<crate::manufacturing::ProfileInput>(json!({
        "schemaVersion": 1, "key": "scope-test", "minCopperFeature": "1nm", "minCopperSpacing": "1nm",
        "minDrillDiameter": "1nm", "minAnnularRing": "0nm"
    })).unwrap().compile().unwrap();
    assert_eq!(
        crate::manufacturing::validate_board(&forged, &profile)
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR035"
    );
}

#[test]
fn compiler_rejects_old_protocols_that_cannot_express_current_constraint_scope() {
    for version in [0, 1, 3, 99] {
        let mut input = transaction(vec![]);
        input.protocol_version = version;
        let error = compile(input).unwrap_err();
        assert!(error.diagnostic.message.contains("expected 2"));
    }
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
fn selected_manufacturing_policy_round_trips_without_losing_optional_limits() {
    let mut input = transaction(vec![part("U1", "UNRESOLVED", json!({"1":{"id":"GND"}}))]);
    input.declarations.children[0].props["manufacturingProfile"] = json!({
        "schemaVersion": 1, "key": "process:exact",
        "minCopperFeature": "0.1mm", "minCopperSpacing": "1mil",
        "minDrillDiameter": "0.3mm", "minAnnularRing": "150um",
        "minMaskExpansion": "0nm", "minMaskWeb": "1nm"
    });
    let output = compile(input.clone()).unwrap();
    let profile = output.ir.board.manufacturing_profile.as_ref().unwrap();
    assert_eq!(profile.min_copper_spacing, 25_400);
    assert_eq!(profile.min_annular_ring, 150_000);
    assert_eq!(profile.min_mask_expansion, Some(0));
    assert_eq!(profile.min_mask_web, Some(1));
    assert_eq!(profile.min_paste_feature, None);
    let encoded = serde_json::to_value(output.ir).unwrap();
    let decoded: crate::BoardIr = serde_json::from_value(encoded.clone()).unwrap();
    decoded
        .board
        .manufacturing_profile
        .as_ref()
        .unwrap()
        .validate()
        .unwrap();
    assert_eq!(serde_json::to_value(decoded).unwrap(), encoded);
    assert!(output.manufacturing_reports.is_empty());
    assert!(output.diagnostics.iter().any(|d| d.code == "PCBMFG003"));
    input.declarations.children[0].props["manufacturingProfile"]["unknown"] = json!("1nm");
    assert_eq!(compile(input).unwrap_err().diagnostic.code, "PCBMFG001");
}

#[test]
fn schema_one_documents_retain_identity_and_legacy_geometry() {
    let original = compile(transaction(vec![part(
        "U1",
        "TEST",
        json!({"1":{"id":"GND"}}),
    )]))
    .unwrap()
    .ir;
    let mut value = serde_json::to_value(&original).unwrap();
    value["schemaVersion"] = json!(1);
    for footprint in value["footprintDefinitions"]
        .as_object_mut()
        .unwrap()
        .values_mut()
    {
        footprint.as_object_mut().unwrap().remove("physical");
    }
    for part in value["parts"].as_array_mut().unwrap() {
        part.as_object_mut().unwrap().remove("physicalFeatures");
    }
    let legacy: crate::BoardIr = serde_json::from_value(value).unwrap();
    assert_eq!(legacy.parts[0].id, original.parts[0].id);
    assert_eq!(legacy.schema_version, 1);
    assert!(legacy.parts[0].physical_features.is_empty());
    assert!(legacy.footprint_definitions["TEST"].physical.is_none());
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
    assert_eq!(output.compiler_diagnostics.len(), 1);
    assert_eq!(output.compiler_diagnostics[0].code, "PCBIR034");
    assert_eq!(
        output.compiler_diagnostics[0].entity.as_deref(),
        Some("GND")
    );
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
