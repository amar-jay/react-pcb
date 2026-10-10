# Constraint region regression coverage

The six investigation reproductions have explicit outcomes in schema 3 and
declaration protocol 2. Tests were added with each implementation phase; the
completion phase exercises their interaction through fresh preview workers,
the live server's JSON boundary and offline exports. The
[contract](constraint-regions.md) defines the checked semantics, and the
[plan](constraint-regions-plan.md) records phase evidence.

| Investigation | Defined outcome | Direct protocol / serialized IR | JSX bridge / preview |
| --- | --- | --- | --- |
| Ignored keepout overlap | `PCBIR040` rejects proven interior overlap with placed copper or explicit courtyard reservations, independently of a manufacturing profile. Contact passes. | [`keepout_tests.rs`](../crates/pcbir/src/compiler/keepout_tests.rs): profile independence, exact contact, scoped realization and serialized enforcement. | [`keepout-enforcement.test.tsx`](../packages/react-pcb/src/__tests__/keepout-enforcement.test.tsx): overlap/contact, selected sides/layers, exceptions, and the original basic-example width. |
| Off-board waypoint | `PCBIR039` rejects a waypoint with no positive-area board intersection for either route kind. Partial rectangles retain authored geometry; empty keepouts/zones warn. | [`tests.rs`](../crates/pcbir/src/compiler/tests.rs): `partial_regions_keep_geometry_and_empty_waypoints_fail_for_both_route_types`, `off_board_boundaries_warn_consistently_and_warnings_survive_fatal_waypoints`. | [`constraint-regions.test.tsx`](../packages/react-pcb/src/__tests__/constraint-regions.test.tsx): compiler, projection, validation and upgrade consistency; [`constraint-inspection.test.tsx`](../packages/preview/src/__tests__/constraint-inspection.test.tsx): current failed-build bounds. |
| Blocked waypoint | `PCBIR042` rejects only exact joint interior coverage on every eligible copper layer for that net. Boundaries, seams, gaps, exceptions and an available layer prevent false blockage. Both pair legs are checked. | [`route_region_tests.rs`](../crates/pcbir/src/compiler/route_region_tests.rs): union/seam proofs, independent pair legs, clipping, exact nm changes, serialized shared regions and repeated visits. | [`route-regions.test.tsx`](../packages/react-pcb/src/__tests__/route-regions.test.tsx): profile independence, scope, exceptions, both legs and immutable CLI reports. |
| Missing zone outline | Zone boundaries project as unfilled intent, with net/layer/clearance inspection, independent visibility and full-scene bounds. | [`tests.rs`](../crates/pcbir/src/compiler/tests.rs): `constraint_projection_draws_zone_intent_and_extends_bounds_without_changing_ir`, `projection_uses_explicit_owners_for_shared_regions_and_repeated_ordered_visits`. | [`constraint-inspection.test.tsx`](../packages/preview/src/__tests__/constraint-inspection.test.tsx): ownership, inspector, fit, themes/views, SVG visibility and preference migration; [`png.test.tsx`](../packages/preview/src/__tests__/png.test.tsx): matching PNG presentation. |
| Ambiguous anonymous declarations | `PCBIR029` identifies the declaration/owner and a matching stable-key fix; exact unkeyed duplicates retain `PCBIR015`/`PCBIR016`. Coordinates and array positions do not define identity. | [`tests.rs`](../crates/pcbir/src/compiler/tests.rs): ambiguous/conflicting/empty keys, owner namespaces, fixed identity values, insertion/reordering and geometry edits. | [`identity.test.tsx`](../packages/react-pcb/src/__tests__/identity.test.tsx): stable declaration identities and actionable JSX failures. |
| Delayed sub-nm rejection | `PCBIR037` rejects in compilation before a successful IR or preview projection, including unused/unrendered rectangles. Overflow rejects too. | [`tests.rs`](../crates/pcbir/src/compiler/tests.rs): `compilation_rejects_sub_nm_and_overflow_in_every_region_kind`, `every_serialized_region_is_checked_even_when_unrendered_or_unreferenced`. | [`constraint-regions.test.tsx`](../packages/react-pcb/src/__tests__/constraint-regions.test.tsx): all units, precision, overflow and serialized consumers. |

[`constraint-contract.test.tsx`](../packages/react-pcb/src/__tests__/constraint-contract.test.tsx)
also checks scope defaults, strict properties and explicit schema-2 upgrades.
Migration preserves IDs, geometry and ordered references; it does not certify
physical constraint satisfaction.

[`constraint-recovery.test.ts`](../packages/preview/src/__tests__/constraint-recovery.test.ts)
uses the shared [`constraint-fixture.ts`](../packages/preview/src/__tests__/constraint-fixture.ts)
to exercise initial off-board and sub-nm failures and all six reproductions in
live rebuilds. It checks current structured findings, both blocked pair nets,
retained accepted IR/SVG, cleared failures on recovery, stable identities after
keyed insertion/geometry edits, and atomic, self-contained offline exports whose
embedded IR/projection agree with the live scene. This verifies the worker/server
boundary; pointer and keyboard behavior is checked in the browser audit.

## Example coverage

The [basic example](../examples/basic/README.md) passes after the phase-4 correction
of its copper keepout to exact contact at x = 0.745 mm. Its previous width remains
a failing regression. The [ESC example](../examples/esc/README.md) passes its
component reservation and waypoint checks with its authored geometry unchanged.
Existing ESC tests retain the explicit missing-electrical-design diagnostics.
Both builds keep their `PCBIR041`/`PCBIR043` warnings: neither synthesizes tracks,
vias or zone fills. Zones remain intent boundaries, and successful compilation or
an incomplete manufacturing report does not establish physical routing approval.

## Completion verification

Run from the repository root:

```sh
bun run check
bun run board:build examples/basic/board.tsx --out /tmp/react-pcb-phase7-basic/index.html
bun run board:build examples/esc/board.tsx --out /tmp/react-pcb-phase7-esc/index.html
```

Live preview tests bind ephemeral loopback ports, so restricted sandboxes may need
execution outside the sandbox. No external service or realized router is needed.

The visual audit opens a live fixture with all three overlay kinds and inspects
Board/Analysis views in light/dark themes. It checks pointer/keyboard selection,
owner/net highlighting, each rule inspector, saved visibility, scene/board fit,
exports and current `PCBIR039`/`PCBIR040`/`PCBIR042` geometry over retained scenes.
It also checks an initial failure at mobile width and successful live recovery.
Audit evidence and final test counts are recorded in the plan checkpoint.

Remaining work belongs to physical backends: realized routes, width/gap envelopes,
layer transitions, filled-zone subtraction/connectivity and fabrication outputs.
The regression suite deliberately preserves explicit coverage warnings for these
limits instead of inferring geometry.
