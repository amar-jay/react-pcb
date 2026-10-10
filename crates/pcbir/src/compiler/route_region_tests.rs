//! Phase 5: exact route waypoint feasibility and explicit physical coverage.
use super::tests::{part, region_test_profile, transaction};
use crate::{BoardIr, CompileError, CompileOutput, DeclarationTransaction, compile};
use serde_json::{Value, json};

fn rect(x: f64, y: f64, width: f64, height: f64) -> Value {
    json!({"kind": "rect", "x": x, "y": y, "width": width, "height": height})
}
fn route(pair: bool, waypoints: Vec<Value>) -> Value {
    let mut node = if pair {
        json!({"type": "pcb-differential-pair", "props": {
            "positive": {"id": "P"}, "negative": {"id": "N"}, "width": 0.2, "gap": 0.15,
            "from": [{"part": {"id": "U1"}, "name": "P"}, {"part": {"id": "U1"}, "name": "N"}],
            "to": [{"part": {"id": "U2"}, "name": "P"}, {"part": {"id": "U2"}, "name": "N"}]
        }})
    } else {
        json!({"type": "pcb-route", "props": {
            "net": {"id": "P"}, "width": 0.2,
            "from": {"part": {"id": "U1"}, "name": "P"}, "to": {"part": {"id": "U2"}, "name": "P"}
        }})
    };
    node["sourceKey"] = json!(if pair { "pair" } else { "route" });
    node["children"] = json!(waypoints.into_iter().enumerate().map(|(i, region)| {
        json!({"type": "pcb-route-through", "sourceKey": format!("visit-{i}"), "props": {"region": region}})
    }).collect::<Vec<_>>());
    node
}
fn keepout(key: &str, area: Value, restrictions: Value) -> Value {
    json!({"type": "pcb-keepout", "sourceKey": key, "props": {"region": area, "disallow": restrictions}})
}
fn design(
    pair: bool,
    waypoints: Vec<Value>,
    rules: Vec<Value>,
    profile: bool,
) -> DeclarationTransaction {
    let mut children = vec![
        part(
            "U1",
            "unresolved",
            json!({"P": {"id": "P"}, "N": {"id": "N"}}),
        ),
        part(
            "U2",
            "unresolved",
            json!({"P": {"id": "P"}, "N": {"id": "N"}}),
        ),
        route(pair, waypoints),
    ];
    children.extend(rules);
    let mut input = transaction(children);
    let props = &mut input.declarations.children[0].props;
    props["layers"]["stackup"]["entries"] = json!([
        {"kind": "copper", "id": "metal:a", "thickness": 0.035, "usage": "signal"},
        {"kind": "dielectric", "id": "insulator", "thickness": 1.53, "material": "FR4", "epsilonR": 4.5},
        {"kind": "copper", "id": "metal:b", "thickness": 0.035, "usage": "plane"}
    ]);
    if profile {
        props["manufacturingProfile"] = json!({"schemaVersion": 1, "key": "route-test", "minCopperFeature": "1nm", "minCopperSpacing": "1nm", "minDrillDiameter": "1nm", "minAnnularRing": "0nm"});
    }
    input
}
fn findings(output: &CompileOutput) -> Vec<Value> {
    output
        .diagnostics
        .iter()
        .filter(|d| matches!(d.code, "PCBIR042" | "PCBIR043"))
        .map(|d| serde_json::to_value(d).unwrap())
        .collect()
}
fn fatal_findings(error: &CompileError) -> Vec<Value> {
    std::iter::once(error.diagnostic.as_ref())
        .chain(&error.diagnostics)
        .filter(|d| matches!(d.code, "PCBIR042" | "PCBIR043"))
        .map(|d| serde_json::to_value(d).unwrap())
        .collect()
}
fn report(ir: &BoardIr) -> crate::manufacturing::BoardReport {
    crate::manufacturing::validate_board(ir, &region_test_profile()).unwrap()
}

#[test]
fn blocked_route_waypoints_reject_with_or_without_profile_and_preserve_connectivity_intent() {
    for pair in [false, true] {
        for profile in [false, true] {
            let error = compile(design(
                pair,
                vec![rect(2.0, 2.0, 2.0, 2.0)],
                vec![keepout(
                    "block",
                    rect(1.0, 1.0, 4.0, 4.0),
                    json!(["tracks"]),
                )],
                profile,
            ))
            .unwrap_err();
            assert_eq!(error.diagnostic.code, "PCBIR042");
            assert!(error.diagnostic.message.contains("waypoint 1 region"));
            assert!(error.diagnostic.message.contains("net P"));
            assert!(error.diagnostic.message.contains("metal:a"));
            assert!(error.diagnostic.message.contains("metal:b"));
            assert!(error.diagnostics.iter().any(|d| d.code == "PCBIR043"));
            assert!(error.diagnostics.iter().any(|d| d.code == "PCBIR041"));
            assert!(
                !error
                    .diagnostics
                    .iter()
                    .any(|d| d.code == "PCBIR034" && d.entity.as_deref() == Some("P"))
            );
            assert_eq!(
                fatal_findings(&error)
                    .iter()
                    .filter(|d| d["code"] == "PCBIR042")
                    .count(),
                if pair { 2 } else { 1 }
            );
        }
    }
}

#[test]
fn partial_overlap_boundary_visits_and_non_track_restrictions_do_not_prove_impossibility() {
    for restrictions in [json!(["copper"]), json!(["tracks"])] {
        for area in [
            rect(3.0, 1.0, 2.0, 4.0),
            rect(2.0, 2.0, 2.0, 2.0),
            rect(1.0, 1.0, 3.0, 4.0),
            rect(4.0, 2.0, 2.0, 2.0),
        ] {
            for pair in [false, true] {
                compile(design(
                    pair,
                    vec![rect(2.0, 2.0, 2.0, 2.0)],
                    vec![keepout("partial", area.clone(), restrictions.clone())],
                    false,
                ))
                .unwrap();
            }
        }
    }
    for restrictions in [
        json!(["components"]),
        json!(["vias"]),
        json!(["components", "vias"]),
    ] {
        compile(design(
            true,
            vec![rect(2.0, 2.0, 2.0, 2.0)],
            vec![keepout(
                "not-tracks",
                rect(1.0, 1.0, 4.0, 4.0),
                restrictions,
            )],
            false,
        ))
        .unwrap();
    }
}

#[test]
fn route_feasibility_accounts_for_every_copper_layer_and_net_exceptions() {
    let mut rule = keepout("selected", rect(1.0, 1.0, 4.0, 4.0), json!(["tracks"]));
    rule["props"]["copperLayers"] = json!([{"id": "metal:a"}]);
    compile(design(
        true,
        vec![rect(2.0, 2.0, 2.0, 2.0)],
        vec![rule.clone()],
        false,
    ))
    .unwrap(); // plane is also eligible
    let mut other = rule.clone();
    other["sourceKey"] = json!("other");
    other["props"]["copperLayers"] = json!([{"id": "metal:b"}]);
    assert_eq!(
        compile(design(
            false,
            vec![rect(2.0, 2.0, 2.0, 2.0)],
            vec![rule.clone(), other.clone()],
            false
        ))
        .unwrap_err()
        .diagnostic
        .code,
        "PCBIR042"
    );
    rule["props"]["except"] = json!([{"id": "P"}]);
    compile(design(
        false,
        vec![rect(2.0, 2.0, 2.0, 2.0)],
        vec![rule.clone(), other.clone()],
        false,
    ))
    .unwrap(); // one allowed layer suffices
    other["props"]["except"] = json!([{"id": "N"}]);
    // Each pair leg has an allowed layer; choosing physical transitions remains unverified.
    compile(design(
        true,
        vec![rect(2.0, 2.0, 2.0, 2.0)],
        vec![rule, other],
        false,
    ))
    .unwrap();
}

#[test]
fn differential_pair_legs_are_checked_independently_even_with_shared_waypoints() {
    for exempt in ["P", "N"] {
        let mut rule = keepout("one-leg", rect(1.0, 1.0, 4.0, 4.0), json!(["copper"]));
        rule["props"]["except"] = json!([{"id": exempt}]);
        let error = compile(design(
            true,
            vec![rect(2.0, 2.0, 2.0, 2.0)],
            vec![rule],
            false,
        ))
        .unwrap_err();
        let blocked = if exempt == "P" { "N" } else { "P" };
        assert_eq!(error.diagnostic.code, "PCBIR042");
        assert!(error.diagnostic.message.contains(&format!("net {blocked}")));
        assert_eq!(
            fatal_findings(&error)
                .iter()
                .filter(|d| d["code"] == "PCBIR042")
                .count(),
            1
        );
    }
}

#[test]
fn overlapping_keepout_unions_block_but_shared_seams_and_interior_holes_allow_visits() {
    for horizontal in [false, true] {
        for overlap in [false, true] {
            let a = if horizontal {
                rect(1.0, 1.0, 4.0, 2.0)
            } else {
                rect(1.0, 1.0, 2.0, 4.0)
            };
            let b = if horizontal {
                rect(1.0, if overlap { 2.5 } else { 3.0 }, 4.0, 2.5)
            } else {
                rect(if overlap { 2.5 } else { 3.0 }, 1.0, 2.5, 4.0)
            };
            let result = compile(design(
                false,
                vec![rect(2.0, 2.0, 2.0, 2.0)],
                vec![
                    keepout("a", a, json!(["tracks"])),
                    keepout("b", b, json!(["copper"])),
                ],
                false,
            ));
            assert_eq!(result.is_err(), overlap);
            if overlap {
                let error = result.unwrap_err();
                assert_eq!(error.diagnostic.code, "PCBIR042");
                assert_eq!(error.diagnostic.message.matches("keepout/").count(), 4); // two blockers on both layers
            }
        }
    }
    // Four strips cover the perimeter but a 1nm square remains inside.
    let rules = vec![
        keepout("left", rect(1.0, 1.0, 1.999999, 4.0), json!(["tracks"])),
        keepout("right", rect(3.0, 1.0, 2.0, 4.0), json!(["tracks"])),
        keepout("top", rect(1.0, 1.0, 4.0, 1.999999), json!(["tracks"])),
        keepout("bottom", rect(1.0, 3.0, 4.0, 2.0), json!(["tracks"])),
    ];
    compile(design(
        false,
        vec![rect(2.0, 2.0, 2.0, 2.0)],
        rules.clone(),
        false,
    ))
    .unwrap();
    let mut closed = rules;
    closed.push(keepout(
        "bridge",
        rect(2.9, 2.9, 0.2, 0.2),
        json!(["tracks"]),
    ));
    assert_eq!(
        compile(design(false, vec![rect(2.0, 2.0, 2.0, 2.0)], closed, false))
            .unwrap_err()
            .diagnostic
            .code,
        "PCBIR042"
    );
}

#[test]
fn effective_waypoint_area_and_declared_keepout_interiors_handle_board_clipping() {
    // Entire on-board waypoint lies within the authored keepout interior,
    // including x=0. Clipping the keepout must not manufacture an escape there.
    let error = compile(design(
        false,
        vec![rect(-2.0, 2.0, 3.0, 2.0)],
        vec![keepout(
            "beyond",
            rect(-3.0, 1.0, 5.0, 4.0),
            json!(["tracks"]),
        )],
        false,
    ))
    .unwrap_err();
    assert_eq!(error.diagnostic.code, "PCBIR042");
    let output = compile(design(
        false,
        vec![rect(-2.0, 2.0, 3.0, 2.0)],
        vec![keepout("edge", rect(0.0, 1.0, 2.0, 4.0), json!(["tracks"]))],
        false,
    ))
    .unwrap();
    let id = &output.ir.route_constraints[0].through[0];
    assert_eq!(output.ir.regions[id].geometry.x, -2.0);
    let output = compile(design(
        false,
        vec![rect(2.0, 2.0, 2.0, 2.0)],
        vec![keepout(
            "off-board",
            rect(-4.0, 1.0, 2.0, 4.0),
            json!(["tracks"]),
        )],
        false,
    ))
    .unwrap();
    assert!(output.diagnostics.iter().any(|d| d.code == "PCBIR039"));
}

#[test]
fn disjoint_visits_and_narrow_waypoints_preserve_order_without_inventing_routes_or_envelopes() {
    for pair in [false, true] {
        let mut input = design(
            pair,
            vec![rect(1.0, 1.0, 0.000001, 0.000001), rect(8.0, 8.0, 1.0, 1.0)],
            vec![keepout(
                "between",
                rect(4.0, 0.0, 1.0, 10.0),
                json!(["tracks"]),
            )],
            false,
        );
        input.declarations.children[0].children[2].props["width"] = json!(100);
        if pair {
            input.declarations.children[0].children[2].props["gap"] = json!(100);
        }
        let output = compile(input).unwrap();
        let through = if pair {
            &output.ir.differential_pairs[0].through
        } else {
            &output.ir.route_constraints[0].through
        };
        assert_eq!(through.len(), 2);
        assert_eq!(output.ir.regions[&through[0]].geometry.width, 0.000001);
        assert_eq!(output.ir.regions[&through[1]].geometry.x, 8.0);
        let warnings = findings(&output);
        assert_eq!(warnings.len(), 1);
        for category in [
            "traversal",
            "ordering",
            "width/gap",
            "transitions",
            "remaining path feasibility",
        ] {
            assert!(warnings[0]["message"].as_str().unwrap().contains(category));
        }
        assert!(
            !output
                .compiler_diagnostics
                .iter()
                .any(|d| d.code == "PCBIR034" && d.entity.as_deref() == Some("P"))
        );
    }
}

#[test]
fn routing_coverage_is_reported_for_each_owner_even_without_waypoints_and_is_not_duplicated() {
    let mut input = design(false, vec![], vec![], true);
    input.declarations.children[0]
        .children
        .push(serde_json::from_value(route(true, vec![])).unwrap());
    let output = compile(input).unwrap();
    let warnings = findings(&output);
    assert_eq!(warnings.len(), 2);
    let report = output.board_manufacturing_report.as_ref().unwrap();
    let check = report
        .checks
        .iter()
        .find(|check| check.id == "constraint-routes")
        .unwrap();
    assert_eq!(check.status, crate::manufacturing::Status::Skipped);
    assert_eq!(check.evaluated, 0);
    assert_eq!(check.skipped, 2);
    assert_eq!(
        serde_json::to_value(&check.diagnostics).unwrap(),
        json!(warnings)
    );
    let projection = crate::board_svg(&output.ir).unwrap();
    assert_eq!(
        projection
            .diagnostics
            .iter()
            .filter(|d| d.code == "PCBIR043")
            .map(|d| serde_json::to_value(d).unwrap())
            .collect::<Vec<_>>(),
        warnings
    );
    let no_route = compile(transaction(vec![])).unwrap();
    assert!(findings(&no_route).is_empty());
}

#[test]
fn serialized_feasibility_preserves_shared_regions_repeated_visits_ids_and_report_determinism() {
    let mut ir = compile(design(
        true,
        vec![rect(2.0, 2.0, 2.0, 2.0)],
        vec![keepout("a", rect(5.0, 1.0, 2.0, 4.0), json!(["tracks"]))],
        false,
    ))
    .unwrap()
    .ir;
    let old = ir.differential_pairs[0].through[0].clone();
    let mut region = ir.regions.remove(&old).unwrap();
    region.id = "custom-visit".into();
    ir.regions.insert(region.id.clone(), region);
    ir.differential_pairs[0].through = vec!["custom-visit".into(), "custom-visit".into()];
    let keepout_region = ir.keepouts[0].region.clone();
    ir.regions.get_mut(&keepout_region).unwrap().geometry = crate::Rect {
        x: 1.0,
        y: 1.0,
        width: 4.0,
        height: 4.0,
    };
    let before = serde_json::to_value(&ir).unwrap();
    let decoded = crate::decode_board_ir(before.clone()).unwrap(); // Structural decoding does not certify feasibility.
    let report = report(&decoded);
    let check = report
        .checks
        .iter()
        .find(|c| c.id == "constraint-routes")
        .unwrap();
    assert_eq!(check.status, crate::manufacturing::Status::Failed);
    assert_eq!(check.evaluated, 4);
    assert_eq!(check.skipped, 1);
    assert_eq!(
        check
            .diagnostics
            .iter()
            .filter(|d| d.code == "PCBIR042")
            .count(),
        4
    );
    assert!(!report.conforms_to_checked_rules);
    let error = crate::board_svg(&decoded).unwrap_err();
    assert_eq!(error.diagnostic.code, "PCBIR042");
    assert!(error.diagnostic.message.contains("custom-visit"));
    let mut reordered = decoded.clone();
    reordered.parts.reverse();
    reordered.nets.reverse();
    reordered.keepouts.reverse();
    reordered.board.layers.stackup.entries.reverse();
    assert_eq!(
        serde_json::to_value(
            crate::manufacturing::validate_board(&reordered, &region_test_profile()).unwrap()
        )
        .unwrap(),
        serde_json::to_value(report).unwrap()
    );
    assert_eq!(serde_json::to_value(&ir).unwrap(), before);
}

#[test]
fn empty_waypoint_fatal_retains_other_blocked_visits_and_both_coverage_kinds() {
    for pair in [false, true] {
        let mut input = design(
            pair,
            vec![rect(10.0, 2.0, 2.0, 2.0), rect(2.0, 2.0, 2.0, 2.0)],
            vec![keepout(
                "block",
                rect(1.0, 1.0, 4.0, 4.0),
                json!(["tracks"]),
            )],
            true,
        );
        // Also retain an independently authored off-board boundary warning.
        input.declarations.children[0].children.push(
            serde_json::from_value(keepout(
                "outside",
                rect(20.0, 0.0, 2.0, 2.0),
                json!(["vias"]),
            ))
            .unwrap(),
        );
        let error = compile(input).unwrap_err();
        assert_eq!(error.diagnostic.code, "PCBIR039");
        assert!(error.diagnostics.iter().any(|d| d.code == "PCBIR043"));
        assert!(error.diagnostics.iter().any(|d| d.code == "PCBIR041"));
        assert!(error.diagnostics.iter().any(|d| d.code == "PCBIR042"));
        assert!(
            error
                .diagnostics
                .iter()
                .any(|d| d.code == "PCBIR039" && matches!(d.severity, crate::Severity::Warning))
        );
    }
}

#[test]
fn exact_nm_route_coverage_is_equivalent_across_board_units_and_one_nm_changes_proof() {
    for (units, step) in [("mm", 0.0254), ("mil", 1.0), ("in", 0.001)] {
        let mut input = design(
            false,
            vec![rect(step * 2.0, step * 2.0, step * 2.0, step * 2.0)],
            vec![keepout(
                "cover",
                rect(step, step, step * 4.0, step * 4.0),
                json!(["tracks"]),
            )],
            false,
        );
        input.declarations.children[0].props["units"] = json!(units);
        assert_eq!(compile(input).unwrap_err().diagnostic.code, "PCBIR042");
    }
    for (x, fails) in [(0.000001, true), (0.000002, false)] {
        let result = compile(design(
            false,
            vec![rect(0.000002, 0.000002, 0.000002, 0.000002)],
            vec![keepout(
                "nm",
                rect(x, 0.000001, 0.000004, 0.000004),
                json!(["tracks"]),
            )],
            false,
        ));
        assert_eq!(result.is_err(), fails);
    }
}

#[test]
fn blocked_waypoint_geometry_identifies_each_leg_visit_and_current_blockers() {
    let error = compile(design(
        true,
        vec![rect(2.0, 2.0, 2.0, 2.0), rect(2.0, 2.0, 2.0, 2.0)],
        vec![keepout(
            "blocker",
            rect(1.0, 1.0, 4.0, 4.0),
            json!(["tracks"]),
        )],
        false,
    ))
    .unwrap_err();
    let failures: Vec<_> = std::iter::once(error.diagnostic.as_ref())
        .chain(error.diagnostics.iter())
        .filter(|d| d.code == "PCBIR042")
        .map(|d| serde_json::to_value(d).unwrap())
        .collect();
    assert_eq!(failures.len(), 4);
    for (net, sequence) in [("P", 1), ("N", 1), ("P", 2), ("N", 2)] {
        let finding = failures
            .iter()
            .find(|d| d["geometry"]["net"] == net && d["geometry"]["waypoint"] == sequence)
            .unwrap();
        let geometry = &finding["geometry"];
        assert_eq!(
            geometry["regionBounds"],
            json!({"min2": [4000000, 4000000], "max2": [8000000, 8000000]})
        );
        assert_eq!(
            geometry["blockers"][0]["bounds"],
            json!({"min2": [2000000, 2000000], "max2": [10000000, 10000000]})
        );
        assert!(
            geometry["blockers"][0]["constraintId"]
                .as_str()
                .unwrap()
                .starts_with("keepout/")
        );
    }
}
