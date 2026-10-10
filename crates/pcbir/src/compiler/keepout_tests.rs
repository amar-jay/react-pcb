//! Direct-protocol and serialized-board regression cases for phase 4.
use super::tests::{part, region_test_profile, transaction};
use crate::{BoardIr, CompileOutput, DeclarationTransaction, Severity, compile};
use serde_json::{Value, json};

fn feature(id: &str, purpose: &str, shape: Value, role: &str) -> Value {
    json!({"id": id, "purpose": purpose, "at": ["0mm", "0mm"], "shape": shape, "layers": [role]})
}
fn rectangle(id: &str, purpose: &str, role: &str) -> Value {
    feature(
        id,
        purpose,
        json!({"kind": "rect", "size": ["2mm", "2mm"]}),
        role,
    )
}
fn device(features: Vec<Value>) -> Value {
    json!({"type": "pcb-part", "props": {
        "id": {"id": "U1", "reference": "U1"}, "at": [5, 5], "footprint": {"schemaVersion": 1, "key": "physical", "features": features},
        "pinMap": {"signal": "land"}, "connect": {"signal": {"id": "N"}}
    }})
}
fn keepout(disallow: Value, x: f64, y: f64, width: f64, height: f64) -> Value {
    json!({"type": "pcb-keepout", "props": {
        "region": {"kind": "rect", "x": x, "y": y, "width": width, "height": height}, "disallow": disallow
    }})
}
fn input(children: Vec<Value>, profile: bool) -> DeclarationTransaction {
    let mut input = transaction(children);
    let props = &mut input.declarations.children[0].props;
    props["layers"]["stackup"]["entries"] = json!([
        {"kind": "copper", "id": "metal:first", "thickness": 0.035, "usage": "signal"},
        {"kind": "dielectric", "id": "insulator", "thickness": 1.53, "material": "FR4", "epsilonR": 4.5},
        {"kind": "copper", "id": "metal:last", "thickness": 0.035, "usage": "signal"}
    ]);
    props["layers"]["technical"] = json!([
        {"kind": "mechanical", "id": "reservation:a", "purpose": "courtyard", "side": "front"},
        {"kind": "mechanical", "id": "reservation:b", "purpose": "courtyard", "side": "back"}
    ]);
    if profile {
        props["manufacturingProfile"] = json!({"schemaVersion": 1, "key": "keepout-test", "minCopperFeature": "1nm", "minCopperSpacing": "1nm", "minDrillDiameter": "1nm", "minAnnularRing": "0nm"});
    }
    input
}
fn copper_device() -> Value {
    device(vec![rectangle("land", "pad", "front-copper")])
}
fn coverage(output: &CompileOutput) -> Vec<Value> {
    output
        .diagnostics
        .iter()
        .filter(|d| d.code == "PCBIR041")
        .map(|d| serde_json::to_value(d).unwrap())
        .collect()
}
fn report(ir: &BoardIr) -> crate::manufacturing::BoardReport {
    crate::manufacturing::validate_board(ir, &region_test_profile()).unwrap()
}

#[test]
fn keepout_overlap_blocks_with_and_without_a_manufacturing_profile() {
    for profile in [false, true] {
        for restriction in ["copper", "components"] {
            let error = compile(input(
                vec![
                    device(vec![
                        rectangle("land", "pad", "front-copper"),
                        rectangle("reserve", "courtyard", "front-courtyard"),
                    ]),
                    keepout(json!([restriction]), 4.5, 4.5, 1.0, 1.0),
                ],
                profile,
            ))
            .unwrap_err();
            assert_eq!(error.diagnostic.code, "PCBIR040");
            assert!(error.diagnostic.message.contains("U1"));
            assert!(error.diagnostic.message.contains("region"));
            assert!(
                error
                    .diagnostic
                    .message
                    .contains(if restriction == "copper" {
                        "metal:first"
                    } else {
                        "front side"
                    })
            );
            assert!(
                error
                    .diagnostic
                    .entity
                    .as_ref()
                    .unwrap()
                    .starts_with("keepout/")
            );
            if restriction == "copper" {
                assert_eq!(
                    error
                        .diagnostics
                        .iter()
                        .filter(|d| d.code == "PCBIR041")
                        .count(),
                    3
                );
            }
        }
    }
}

#[test]
fn keepout_exact_contacts_and_nm_edges_use_interior_overlap() {
    for (x, y) in [(6.0, 4.0), (3.0, 4.0), (4.0, 6.0), (4.0, 3.0), (6.0, 6.0)] {
        compile(input(
            vec![copper_device(), keepout(json!(["copper"]), x, y, 1.0, 1.0)],
            false,
        ))
        .unwrap();
    }
    for (size, x, fails) in [
        ("4nm", 0.000004, false),
        ("4nm", 0.000003, true),
        ("3nm", 0.000004, false),
        ("3nm", 0.000003, true),
    ] {
        let mut part = device(vec![feature(
            "land",
            "pad",
            json!({"kind": "rect", "size": [size, size]}),
            "front-copper",
        )]);
        part["props"]["at"] = json!([0.000002, 0.000002]);
        let result = compile(input(
            vec![
                part,
                keepout(json!(["copper"]), x, 0.000002, 0.000002, 0.000002),
            ],
            false,
        ));
        assert_eq!(result.is_err(), fails);
        if fails {
            assert_eq!(result.unwrap_err().diagnostic.code, "PCBIR040");
        }
    }
}

#[test]
fn keepout_curves_do_not_use_bounding_boxes_as_overlap_proof() {
    for shape in [
        json!({"kind": "circle", "diameter": "4mm"}),
        json!({"kind": "oval", "size": ["6mm", "4mm"]}),
        json!({"kind": "rounded-rect", "size": ["4mm", "4mm"], "radius": "1mm"}),
    ] {
        let x = if shape["kind"] == "oval" { 7.8 } else { 6.8 };
        for purpose in ["pad", "courtyard"] {
            let (id, role, restriction) = if purpose == "pad" {
                ("land", "front-copper", "copper")
            } else {
                ("reserve", "front-courtyard", "components")
            };
            let mut part = device(vec![feature(id, purpose, shape.clone(), role)]);
            if purpose == "courtyard" {
                part["props"]["pinMap"] = json!({});
                part["props"]["connect"] = json!({});
            }
            compile(input(
                vec![
                    part.clone(),
                    keepout(json!([restriction]), x, 6.8, 0.1, 0.1),
                ],
                false,
            ))
            .unwrap();
            assert_eq!(
                compile(input(
                    vec![part, keepout(json!([restriction]), 5.0, 5.0, 0.1, 0.1)],
                    false
                ))
                .unwrap_err()
                .diagnostic
                .code,
                "PCBIR040"
            );
        }
    }
}

#[test]
fn keepout_layer_and_side_scopes_follow_reflection_and_rotation() {
    let mut part = device(vec![
        rectangle("land", "pad", "front-copper"),
        rectangle("reserve", "courtyard", "front-courtyard"),
    ]);
    part["props"]["footprint"]["features"][1]["at"] = json!(["2mm", "0mm"]);
    part["props"]["side"] = json!("back");
    part["props"]["rotation"] = json!(90);
    // Reservation center: (5,3) after reflection then rotation; layer metadata says back.
    let mut rule = keepout(json!(["components", "copper"]), 4.5, 2.5, 1.0, 1.0);
    rule["props"]["componentSides"] = json!(["front"]);
    rule["props"]["copperLayers"] = json!([{"id": "metal:first"}]);
    compile(input(vec![part.clone(), rule.clone()], false)).unwrap();
    rule["props"]["componentSides"] = json!(["back"]);
    let error = compile(input(vec![part.clone(), rule.clone()], false)).unwrap_err();
    assert!(error.diagnostic.message.contains("reserve"));
    assert!(error.diagnostic.message.contains("back side"));
    rule["props"]["componentSides"] = json!(["front"]);
    rule["props"]["region"]["y"] = json!(4.5);
    compile(input(vec![part.clone(), rule.clone()], false)).unwrap();
    rule["props"]["copperLayers"] = json!([{"id": "metal:last"}]);
    assert!(
        compile(input(vec![part, rule], false))
            .unwrap_err()
            .diagnostic
            .message
            .contains("metal:last")
    );
    let part = device(vec![rectangle("land", "pad", "all-copper")]);
    let mut rule = keepout(json!(["copper"]), 4.5, 4.5, 1.0, 1.0);
    rule["props"]["copperLayers"] = json!([{"id": "metal:last"}]);
    assert!(
        compile(input(vec![part, rule], false))
            .unwrap_err()
            .diagnostic
            .message
            .contains("metal:last")
    );
}

#[test]
fn keepout_exceptions_require_pad_net_bindings_and_never_exempt_components() {
    let mut rule = keepout(json!(["copper"]), 4.5, 4.5, 1.0, 1.0);
    rule["props"]["except"] = json!([{"id": "N"}]);
    compile(input(vec![copper_device(), rule.clone()], false)).unwrap();
    // Pad ID differs from logical pin ID: ownership comes only from pinMap.
    let mut unknown = copper_device();
    unknown["props"]["footprint"]["features"]
        .as_array_mut()
        .unwrap()
        .push(rectangle("unbound", "pad", "front-copper"));
    assert!(
        compile(input(vec![unknown, rule.clone()], false))
            .unwrap_err()
            .diagnostic
            .message
            .contains("unbound")
    );
    let mut copper = copper_device();
    copper["props"]["footprint"]["features"]
        .as_array_mut()
        .unwrap()
        .push(rectangle("graphic", "copper", "front-copper"));
    assert!(
        compile(input(vec![copper, rule.clone()], false))
            .unwrap_err()
            .diagnostic
            .message
            .contains("graphic")
    );
    let part = device(vec![
        rectangle("land", "pad", "front-copper"),
        rectangle("reserve", "courtyard", "front-courtyard"),
    ]);
    rule["props"]["disallow"] = json!(["components", "copper"]);
    assert!(
        compile(input(vec![part, rule], false))
            .unwrap_err()
            .diagnostic
            .message
            .contains("reserve")
    );
}

#[test]
fn keepout_coverage_is_deduplicated_and_restrictions_remain_distinct() {
    for restrictions in [
        json!(["tracks"]),
        json!(["vias"]),
        json!(["tracks", "vias"]),
    ] {
        let output = compile(input(
            vec![
                copper_device(),
                keepout(restrictions.clone(), 4.5, 4.5, 1.0, 1.0),
            ],
            false,
        ))
        .unwrap();
        assert_eq!(
            coverage(&output).len(),
            restrictions.as_array().unwrap().len()
        );
        assert_eq!(
            report(&output.ir)
                .checks
                .iter()
                .find(|c| c.id == "constraint-keepouts")
                .unwrap()
                .evaluated,
            0
        );
    }
    let mut unplaced = copper_device();
    unplaced["props"].as_object_mut().unwrap().remove("at");
    let mut missing = part("U2", "unresolved", json!({}));
    missing["props"]["at"] = json!([5, 5]);
    let mut rule = keepout(
        json!(["copper", "tracks", "vias", "components"]),
        0.0,
        0.0,
        1.0,
        1.0,
    );
    rule["props"]["copperLayers"] = json!([{"id": "metal:first"}, {"id": "metal:last"}]);
    let output = compile(input(vec![unplaced, missing, rule], true)).unwrap();
    let warnings = coverage(&output);
    assert_eq!(warnings.len(), 5); // tracks, vias, fills, two missing parts; no per-layer duplicates
    let check = output
        .board_manufacturing_report
        .as_ref()
        .unwrap()
        .checks
        .iter()
        .find(|c| c.id == "constraint-keepouts")
        .unwrap();
    assert_eq!(check.skipped, 5);
    assert_eq!(
        serde_json::to_value(&check.diagnostics).unwrap(),
        json!(warnings)
    );
    assert_eq!(
        serde_json::to_value(
            crate::board_svg(&output.ir)
                .unwrap()
                .diagnostics
                .iter()
                .filter(|d| d.code == "PCBIR041")
                .collect::<Vec<_>>()
        )
        .unwrap(),
        json!(warnings)
    );
    let output = compile(input(
        vec![
            copper_device(),
            keepout(json!(["components"]), 4.5, 4.5, 1.0, 1.0),
        ],
        false,
    ))
    .unwrap();
    assert_eq!(coverage(&output).len(), 1);
    assert!(
        coverage(&output)[0]["message"]
            .as_str()
            .unwrap()
            .contains("no explicit courtyard")
    );
}

#[test]
fn keepout_checks_use_effective_on_board_area_without_rewriting_intent() {
    let mut part = device(vec![rectangle("reserve", "courtyard", "front-courtyard")]);
    part["props"]["at"] = json!([-1, 5]);
    part["props"]["pinMap"] = json!({});
    part["props"]["connect"] = json!({});
    let output = compile(input(
        vec![
            part.clone(),
            keepout(json!(["components"]), -2.0, 4.0, 3.0, 2.0),
        ],
        false,
    ))
    .unwrap();
    assert_eq!(
        output.ir.regions[&output.ir.keepouts[0].region].geometry.x,
        -2.0
    );
    part["props"]["at"] = json!([-0.5, 5]);
    assert_eq!(
        compile(input(
            vec![part, keepout(json!(["components"]), -2.0, 4.0, 3.0, 2.0)],
            false
        ))
        .unwrap_err()
        .diagnostic
        .code,
        "PCBIR040"
    );
    let output = compile(input(
        vec![
            copper_device(),
            keepout(json!(["copper", "components"]), -2.0, 4.0, 1.0, 2.0),
        ],
        false,
    ))
    .unwrap();
    assert!(coverage(&output).is_empty());
    assert_eq!(
        output
            .diagnostics
            .iter()
            .filter(|d| d.code == "PCBIR039")
            .count(),
        1
    );
}

#[test]
fn serialized_keepouts_are_enforced_with_stable_ids_and_authoritative_realization() {
    let mut ir = compile(input(
        vec![
            copper_device(),
            keepout(json!(["copper"]), 6.0, 4.0, 1.0, 1.0),
        ],
        false,
    ))
    .unwrap()
    .ir;
    let old_region = ir.keepouts[0].region.clone();
    let mut region = ir.regions.remove(&old_region).unwrap();
    region.id = "shared-custom-region".into();
    region.geometry.x = 5.0;
    ir.keepouts[0].region = region.id.clone();
    ir.regions.insert(region.id.clone(), region);
    let before = serde_json::to_value(&ir).unwrap();
    let decoded = crate::decode_board_ir(before.clone()).unwrap(); // decode validates structure, not satisfaction
    let report = report(&decoded);
    let check = report
        .checks
        .iter()
        .find(|c| c.id == "constraint-keepouts")
        .unwrap();
    assert_eq!(check.status, crate::manufacturing::Status::Failed);
    assert!(!report.conforms_to_checked_rules);
    let error = crate::board_svg(&decoded).unwrap_err();
    assert_eq!(error.diagnostic.code, "PCBIR040");
    assert!(error.diagnostic.message.contains("shared-custom-region"));
    assert_eq!(serde_json::to_value(&ir).unwrap(), before);
    let mut forged = ir.clone();
    forged.parts[0]
        .physical_features
        .get_mut("land")
        .unwrap()
        .geometry
        .at[0] += 1;
    assert!(
        crate::manufacturing::validate_board(&forged, &region_test_profile())
            .unwrap_err()
            .diagnostic
            .message
            .contains("does not match")
    );
    assert!(
        crate::board_svg(&forged)
            .unwrap_err()
            .diagnostic
            .message
            .contains("does not match")
    );
    let mut forged = ir;
    forged.parts[0]
        .pin_map
        .insert("other".into(), vec!["land".into()]);
    assert_eq!(
        crate::board_svg(&forged).unwrap_err().diagnostic.code,
        "PCBIR012"
    );
}

#[test]
fn fatal_keepout_retains_other_violations_and_coverage_warnings() {
    let mut rule = keepout(json!(["copper", "components"]), 4.5, 4.5, 1.0, 1.0);
    rule["sourceKey"] = json!("first");
    let mut second = rule.clone();
    second["sourceKey"] = json!("second");
    let error = compile(input(vec![copper_device(), rule, second], true)).unwrap_err();
    assert_eq!(error.diagnostic.code, "PCBIR040");
    assert_eq!(
        error
            .diagnostics
            .iter()
            .filter(|d| d.code == "PCBIR040" && matches!(d.severity, Severity::Error))
            .count(),
        1
    );
    assert_eq!(
        error
            .diagnostics
            .iter()
            .filter(|d| d.code == "PCBIR041")
            .count(),
        8
    );
}

#[test]
fn keepout_copper_checks_respect_explicit_round_and_slotted_drill_voids() {
    for slot in [None, Some(["6mm", "4mm"])] {
        let shape = if slot.is_some() {
            json!({"kind": "oval", "size": ["8mm", "6mm"]})
        } else {
            json!({"kind": "circle", "diameter": "6mm"})
        };
        let mut pad = feature("land", "pad", shape, "all-copper");
        pad["drill"] = json!({"diameter": "4mm", "plated": true});
        if let Some(slot) = slot {
            pad["drill"]["slot"] = json!(slot);
        }
        let mut part = device(vec![pad]);
        part["props"]["footprint"]["schemaVersion"] = json!(2);
        part["props"]["rotation"] = json!(90);
        // Rectangle corners are (±1.2,±1.6) relative to the pad: exactly radius 2.
        compile(input(
            vec![part.clone(), keepout(json!(["copper"]), 3.8, 3.4, 2.4, 3.2)],
            false,
        ))
        .unwrap();
        // A nanometre beyond the circle/slot's side enters pad copper.
        let error = compile(input(
            vec![part, keepout(json!(["copper"]), 7.0, 4.9, 0.000001, 0.2)],
            false,
        ))
        .unwrap_err();
        assert_eq!(error.diagnostic.code, "PCBIR040");
    }
}

#[test]
fn keepout_diagnostics_carry_current_physical_feature_and_effective_region() {
    for restriction in ["copper", "components"] {
        let error = compile(input(
            vec![
                device(vec![
                    rectangle("land", "pad", "front-copper"),
                    rectangle("reserve", "courtyard", "front-courtyard"),
                ]),
                keepout(json!([restriction]), -1.0, 4.5, 7.0, 1.0),
            ],
            false,
        ))
        .unwrap_err();
        let diagnostic = serde_json::to_value(&error.diagnostic).unwrap();
        let geometry = &diagnostic["geometry"];
        assert_eq!(geometry["kind"], "constraint-region");
        assert_eq!(geometry["part"], "U1");
        assert_eq!(geometry["feature"]["at"], json!([5000000, 5000000]));
        assert_eq!(
            geometry["feature"]["id"],
            if restriction == "copper" {
                "land"
            } else {
                "reserve"
            }
        );
        assert_eq!(
            geometry["layer"],
            if restriction == "copper" {
                "metal:first"
            } else {
                "front"
            }
        );
        assert_eq!(geometry["regionBounds"]["min2"][0], -2000000);
        assert_eq!(geometry["effectiveBounds"]["min2"][0], 0);
        assert!(
            error
                .diagnostics
                .iter()
                .filter(|d| d.code == "PCBIR041")
                .all(|d| d.geometry.is_some())
        );
    }
}
