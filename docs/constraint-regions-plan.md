# Constraint region implementation plan

Status: phases 1–7 complete and verified.

## Progress and resume checkpoint

Work was completed one phase at a time. This checkpoint records the completed
constraint-region boundary and the remaining work reserved for physical backends.

| Phase | Status |
| --- | --- |
| 1. Define and version the contract | Complete and verified. |
| 2. Centralize region and reference validation | Complete and verified. |
| 3. Make declaration identity predictable | Complete and verified. |
| 4. Enforce keepouts against available geometry | Complete and verified. |
| 5. Check route-region feasibility and report coverage | Complete and verified. |
| 6. Make all constraint types inspectable | Complete and verified. |
| 7. Regression fixtures, documentation and completion | Complete and verified; regression matrix, recovery fixtures, example review and final audits recorded below. |

Phase 1 delivers board IR schema 3, declaration protocol 2, typed keepout
restrictions, explicit `componentSides`/`copperLayers`, scope validation at compiler
and serialized-board consumer boundaries, strict constraint properties, and
`upgradeBoardIr()` / `pcbir upgrade-board` / Rust `upgrade_board_ir` for saved
schema-2 boards. The migration preserves canonical identities, geometry, revision
and waypoint order. The [contract](constraint-regions.md) distinguishes current
support from planned enforcement. Physical footprint/layout versions are unchanged.

Phase 2 adds `ir/regions.rs`: exact checked rectangles, doubled-nm edges and
explicit on-board intersections shared by compilation, current-schema decoding,
SVG projection and standalone board validation. It checks every stored region,
including unrendered zones and unreferenced rectangles, map-key/ID agreement,
constraint-owner uniqueness, region/net/pin references and copper layer targets.
Partial regions retain their authored geometry; empty waypoints reject, while
empty keepouts/zones warn. The standalone `constraint-regions` report check and
CLI preserve the shared diagnostic codes. Compiler warnings are retained with
fatal off-board findings and are not duplicated by manufacturing reports.

Phase 3 preserves the existing FNV-1a-128 identity derivation. `PCBIR029`
diagnostics now name the declaration and owner with matching JSX key examples. Exact
unkeyed zone/keepout duplicates retain `PCBIR015`/`PCBIR016` with corrected key
guidance; conflicting supplied keys consistently use `PCBIR029`, whether their
properties match or differ. The contract/HOWTO document per-owner key rules and
repeated keepout/zone examples. Existing basic/ESC waypoint keys are annotated
without changing them or introducing new identities.

Phase 4 adds `constraint_validation.rs`, independent of manufacturing profiles.
The former manufacturing geometry module is now shared `geometry.rs`; it compares
checked effective on-board rectangles with exact placed primitives. Copper checks
use concrete layer IDs and authoritative pad net bindings. Courtyard reservations
use their enclosed shapes (not documentation stroke), reflected/rotated world
coordinates and mechanical-layer side metadata. Round/slotted drill voids do not
count as pad copper. `realization.rs` shares stored-world-geometry verification
and pin-to-pad net lookup between physical consumers.

Compilation and SVG projection reject proven violations with `PCBIR040`, naming
the constraint, region, part, feature and layer/side. Standalone board validation
returns the same findings in `constraint-keepouts`, which contributes to
`conformsToCheckedRules`. `PCBIR041` warns once per keepout/unavailable category
or missing part for placement, canonical physical geometry, courtyard reservations,
and unresolved tracks/vias/fills. Compiler warnings are retained with fatal findings
and are not duplicated by manufacturing reports. Decoding/upgrading still validate
structure without certifying physical constraint satisfaction.

The basic example's original 8 mm-wide copper keepout overlapped connector lands.
Its region now reserves the board-edge strip through x=0.745 mm, exactly touching
the nearest contact. Restrictions and canonical IDs are preserved; a regression
retains the original violation. ESC geometry passes, with explicit unresolved
track/via coverage warnings. Legacy numeric pads remain unverified until explicit
migration supplies canonical physical geometry.

Phase 5 extends `constraint_validation.rs` with route-region feasibility and
`geometry.rs` with an exact open-rectangle union coverage proof. For each ordinary
visit or pair leg, copper/track keepouts are selected by concrete layer ID and net
exception. All board copper layers (including planes) remain eligible because
current routing intent has no layer restriction. A waypoint is blocked only when
the authored keepout interiors jointly exclude every point of its effective
on-board rectangle on every layer. Boundary contact, seams, isolated boundary
points and one-nanometre gaps prevent false errors; width/gap envelopes and paths
are not inferred. Authored keepout edges prevent clipping from creating a false
escape at the board edge. IDs and waypoint reference order are unchanged.

`PCBIR042` identifies a proven blockage with owner, waypoint sequence number,
region, net and per-layer keepout IDs. `PCBIR043` warns once per Route or
DifferentialPair, including owners without waypoints, that physical traversal,
ordering, width/gap clearance, transitions and remaining path feasibility are
unverified. Declaration graph connectivity still records intent independently.
Compilation and SVG projection reject blockage; standalone board validation
returns it in `constraint-routes` alongside coverage counts. Compiler warnings
are not duplicated by manufacturing reports. Both examples build successfully
with explicit unrealized-routing warnings; no source geometry changed in phase 5.

`ir/regions.rs` now exposes `check_regions` to physical checks so empty-waypoint
errors, other blocked visits and all coverage warnings can accumulate together.
The strict `validate_regions` wrapper remains at decoding/upgrade boundaries;
structurally valid saved IR is not certified for keepout satisfaction or routing
feasibility by migration. Standalone validation still rejects empty waypoints,
while proven on-board blockage returns a failed report check.

Phase 6 draws solid teal zone-intent boundaries, rose dashed keepouts and violet
dotted ordinary/pair waypoints as independent overlays. Projection metadata
carries explicit owner/type, region and net IDs, descriptive labels and each
ordered visit number. Shared regions and repeated references produce independent
owner/visit entries. Authored bounds extend the full-scene viewport; board fit
remains outline-only. The inspector shows rules, scope, exceptions, endpoints,
net names and visit order, with stable IDs in details. Pointer/keyboard region
selection highlights its owner's regions, and net highlighting includes route
and zone intent. Board overview lists all region uses and route owners without waypoints for
selection. Selecting a hidden region reveals its overlay through the saved
visibility control; routes without waypoints never acquire invented regions.

Current structured `constraint-region` diagnostic geometry carries checked
board/authored/effective bounds, owner/region IDs, descriptive labels and visit
numbers. Keepout violations include exact current physical features and bounds,
part and layer/side; blocked visits include net ownership and current blocking
keepout rectangles. Diagnostic actions focus this geometry independently of
retained accepted IR and saved visibility, including initial failures. Successful
rebuilds or clearing the highlight dismiss it. Coverage warnings for keepouts
also carry their known region geometry. No routing/fill geometry is synthesized.

SVG/PNG presentation shares the distinct unfilled styles and presets. PNG's API
accepts explicit viewer visibility overrides. Version-1 saved preferences migrate
`overlay:constraints` to the three independent keys, preserving explicit newer
choices. Default overlays are visible; Front/Back, Copper only and Fabrication
presets hide constraint intent while All layers enables it. Exports retain the
original full-scene physical coordinates, independent of canvas zoom/highlights.

Phase 7 consolidates investigation coverage in the
[regression matrix](constraint-regions-regressions.md). A shared preview source
fixture exercises all six reproductions through fresh workers and live rebuilds.
Two new regressions verify initial off-board/sub-nm failures, current findings
over retained IR/SVG, both blocked pair legs, stable IDs after recovery and keyed
insertion/geometry edits, and atomic offline exports whose embedded IR/projection
match the accepted live scene. Existing direct-protocol, serialized-IR and JSX
tests retain the exact geometry, scope, exception, identity and export cases.

The basic/ESC examples pass with the phase-4 basic keepout correction retained.
Their documentation now distinguishes enforced physical reservations and waypoint
feasibility from unrealized routing/fills; HOWTO and preview recovery documentation
describe the same boundary. CI now builds both examples. No phase-7 change rewrites
their geometry or identities.

Do not infer ownership from ID spelling, regenerate IDs or rewrite authored
geometry. Region sharing and repeated ordered visits remain valid in serialized IR.

Remaining physical coverage: realized routing/fills are unavailable and have
explicit coverage warnings. Anonymous repeated declarations require stable keys,
with actionable diagnostics. The schema records semantics and scope, not full
physical approval. All six reproduced issues have regression tests and defined
outcomes; no constraint-region implementation phase remains pending.

Evidence: phase 2 adds eight Rust regression tests and four Bun JSX/CLI tests
covering unit equivalence, exact nm edges, sub-nm and overflow rejection,
unrendered/unreferenced geometry, malformed identities/references, partial regions,
boundary contact, both waypoint types, retained warnings and consumer consistency.
`bun run check` passed TypeScript, Rust formatting/checking, Clippy with warnings
denied at phase 2 with 81 Rust tests and 137 Bun tests.

Phase 3 adds five Rust regression tests and four Bun identity tests, covering
fixed phase-2 IDs, all declaration kinds/owners, ambiguous/empty/conflicting keys,
local namespaces, insertion/reordering/geometry edits and keyed enclosing circuits.
The final `bun run check` passed **86 Rust tests** and **141 Bun tests**, including
live preview and basic/ESC examples, plus TypeScript, formatting/checking and Clippy
with warnings denied.

Live preview tests require permission to bind local ports outside the sandbox.
Phase 4 adds ten Rust regressions and six Bun JSX/CLI regressions covering
profile-independent enforcement, exact contact and odd-nm edges, curved primitives,
rotated/reflected scopes, authoritative exceptions and unknown-net copper, distinct
restrictions, missing geometry/reservations, deduplicated coverage, effective
on-board regions, custom IDs, immutable serialized validation, forged realization,
round/slotted drill voids, retained fatal findings and the basic example's original
keepout violation. Existing identity and ESC tests now expect coverage warnings.
The final `bun run check` passed **96 Rust tests** and **147 Bun tests**, including
live preview and basic/ESC examples, plus TypeScript, formatting/checking and Clippy
with warnings denied. Both example builds also passed.

Phase 4 was committed as `496f2eb` (Enforce keepouts against available physical geometry).

Phase 5 adds twelve Rust regressions (eleven direct-protocol/serialized cases and
one exact-geometry case) and six Bun JSX/CLI regressions covering both route kinds,
profile independence, joint open-interior coverage, seams/isolated points and
one-nanometre gaps, large coordinates and unit equivalence, every eligible layer,
net exceptions, independent pair legs, effective board clipping, disjoint/narrow
ordered visits, unrealized routing coverage, custom/shared IDs, repeated visits,
immutable/deterministic reports, connectivity intent and retained warnings/fatal
findings. Identity and ESC expectations now include per-owner routing warnings.
The final `bun run check` passed **108 Rust tests** and **153 Bun tests**, including
live preview, TypeScript, Rust formatting/checking and Clippy with warnings denied.
Both basic and ESC example builds passed with their new coverage warnings.

Phase 5 was subsequently committed as `20b1614`.

Phase 6 adds five Rust regressions and nine Bun regressions covering zone
projection/full-scene bounds, explicit custom/shared owners, repeated ordered
visits, current off-board and physical-violation geometry, both blocked pair legs,
inspector details, owner/net highlighting, saved-toggle migration and SVG/PNG
visibility/presentation in both views and themes. The final `bun run check`
passed **113 Rust tests** and **162 Bun tests**, TypeScript, Rust formatting/checking
and Clippy with warnings denied. Both basic and ESC example builds passed.
A live browser audit verified pointer/keyboard selection, all three rule inspectors,
net/owner highlights, saved visibility and SVG export, both fit actions, current
039/040/042 geometry over retained scenes and initial mobile failure, live recovery,
and the overlay presentation in both views and themes. Visual artifacts are in
`/tmp/react-pcb-ui-browser/phase6-*`; check output is in
`/tmp/react-pcb-phase6-check.log`. Phase 6 was subsequently committed as `1548a62`.

Phase 7 completion verification on 2026-10-11: `bun run check` passed **113 Rust
tests** and **164 Bun tests**, TypeScript, Rust formatting/checking and Clippy with
warnings denied. Both basic and ESC offline HTML builds and the preview frontend
build passed. Final check output is in `/tmp/react-pcb-phase7-check.log`; example
outputs are `/tmp/react-pcb-phase7-basic/index.html` and
`/tmp/react-pcb-phase7-esc/index.html`.

A fresh live browser audit using the shared phase-7 fixture passed pointer/keyboard
selection, all three rule inspectors, owner/net highlighting, saved visibility,
SVG export and both fit actions. Board/Analysis overlay presentation was inspected
in both themes. Current `PCBIR039`/`PCBIR040`/`PCBIR042` geometry was inspected in
light/dark themes over retained scenes; initial mobile failure and live recovery
also passed, with no browser errors. Screenshots, the exported SVG and the audit
script are in `/tmp/react-pcb-ui-browser/phase7-*`; the result is in
`/tmp/react-pcb-phase7-browser.log`. Phase 7 changes are local; no commit was created.

## Objective

Make constraint regions meaningful, validated, and inspectable while retaining
stable identity and keeping design intent separate from physical realization.
Address keepout enforcement, route-region feasibility, missing zone overlays,
anonymous identity collisions, precision differences, and incomplete preview
metadata and bounds.

## Semantic contract

| Construct | Meaning | Initial validation |
| --- | --- | --- |
| Region | A referenceable rectangle in board coordinates and board units. Geometry and ID remain separate. | Finite values, positive dimensions, exact conversion to integer nm, checked bounds, ID/reference integrity. |
| `RouteThrough` | An ordered waypoint area: a future route centerline must visit each region from `from` to `to`. It does not confine the entire route to the union of those regions or reserve the region exclusively. | Check that the waypoint intersects the board and detect only provable keepout conflicts. Physical traversal remains unverified. |
| `Keepout` | A hard prohibition for the selected object types and scope. | Enforce against available placed copper and explicit component placement reservations; report unavailable tracks/vias or reservations as unverified. |
| `Zone` | An intended copper fill boundary on its declared layers, associated with a stable net ID. | Validate and display the boundary. Preserve clearance intent; actual fill, keepout subtraction, and connectivity remain unverified. |

Further rules:

- Board coordinates are global, including declarations inside modules. Modules
  namespace identities; they do not translate or rotate geometry.
- The order of `through` references is meaningful. Reordering changes routing
  intent without changing the individual region IDs.
- Keepout scope fields: `componentSides` and `copperLayers`. They apply
  independently to component restrictions and copper/track/via restrictions.
  Omission means both component sides and all board copper layers respectively.
  Reject empty, repeated, invalid, or inapplicable scope selections.
- `copper` covers every copper-bearing object, including pads, tracks, vias and
  zone fills when realized. `tracks` and `vias` restrict those object types alone.
- `components` uses explicit footprint courtyards as placement reservations.
  Missing courtyard geometry is unverified; do not invent a body from a part
  center, its pads, or fabrication graphics. This contract is deliberately about
  placement reservations rather than inferred 3D package bodies.
- Net exceptions apply only to electrical objects with an established net ID.
  They never exempt an entire component. Copper of unknown net remains restricted.
- Exact boundary contact is allowed; interior overlap violates a keepout.
  Manufacturing clearances remain a separate policy.
- Preserve partially off-board declarations and use their intersection with the
  board as the effective on-board region. Do not silently rewrite stored geometry.
  A completely off-board waypoint is an error. A completely off-board keepout or
  zone produces a warning because it has no on-board effect.
- Region overlap alone does not prove a route impossible. Reject only a provable
  conflict after accounting for net exceptions and every available copper layer.
  Disjoint consecutive waypoints are valid; a route may travel between them.

## 1. Define and version the contract

Files: `components/constraints.tsx`, `components/routing.tsx`, TypeScript IR types,
Rust `ir/constraints.rs`, and compiler parsers.

- Document the semantics above and add typed keepout scope selections.
- Resolve frontend layer handles to canonical layer IDs; keep React keys and
  source hints outside canonical IR.
- Use board IR schema 3 for the new constraint contract so older consumers cannot
  silently ignore scope and claim equivalent validation. Keep the physical
  footprint schema unchanged unless its own representation changes.
- Provide an explicit schema-2 upgrade path that preserves all entity IDs,
  geometries and route order, and supplies documented legacy scope defaults.
  Upgrading a document does not certify that its constraints are satisfied.
- Update supported-version checks and TypeScript/Rust contracts together. Bump
  the declaration protocol if its validation would otherwise ignore new fields.

Acceptance: new scopes round-trip; old document upgrades retain IDs; unsupported
versions fail clearly; invalid or ignored scope fields are rejected.

## 2. Centralize region and reference validation

Files: Rust `compiler/parse.rs`, a shared region-validation module, `board_svg.rs`,
and the standalone board-validation entry point.

- Share checked conversion from declared board units to integer nm across
  compilation, projection and standalone validation. Use doubled-nm arithmetic
  for edges and intersections where needed; reject sub-nm values and overflow.
- Validate every stored region, including zone boundaries that are not currently
  rendered. Validate map-key/ID agreement, uniqueness, constraint ownership,
  referenced regions, nets and target layer types.
- Compute explicit board intersections and issue the off-board findings described
  above. No preview-only geometry rejection or silent clipping.
- Apply the same structural checks to externally supplied serialized IR.

Acceptance: mm/mil/in equivalents behave identically; sub-nm and overflow cases
fail during compilation; malformed region references fail in every entry point;
partial and complete off-board cases follow the documented policy.

## 3. Make declaration identity predictable

Files: Rust `compiler/constraints.rs` and duplicate diagnostics; frontend identity
documentation and identity tests.

- Retain deterministic IDs derived from owner/scope and stable frontend identity
  hints. Preserve existing geometry-independent identity behavior.
- Keep explicit rejection when repeated anonymous declarations cannot be
  distinguished reliably. Do not use array positions, mutable coordinates,
  random values, or display names as identity.
- Improve `PCBIR029` to identify the declaration kind and owner and show the
  appropriate key example. Correct duplicate help that currently suggests a
  geometry edit alone can resolve an identity collision.
- Document keys for multiple waypoints, multiple keepouts in one scope, and
  multiple zones sharing a net/layer selection. Update relevant examples.

Acceptance: distinct keyed declarations compile; reordering, insertion and
geometry edits preserve existing IDs; equal keys in different owners stay local;
ambiguous unkeyed declarations and conflicting keys yield actionable errors.

## 4. Enforce keepouts against available geometry

Files: a Rust constraint validator and shared exact geometry utilities.

- Reuse the existing exact primitive intersection machinery without making
  structural constraint enforcement depend on a manufacturing profile.
- Check placed pads and other copper features on selected concrete layers.
  Apply exceptions only through authoritative pin-to-pad net bindings.
- Check explicit courtyard placement reservations on selected component sides,
  using world geometry after rotation and back-side reflection.
- Retain distinct restrictions for components, copper, tracks and vias.
- Emit blocking diagnostics for proven violations, including the constraint,
  region, offending part/feature and affected layer or side.
- Emit deduplicated coverage warnings for missing placement/physical geometry,
  missing reservations, and unresolved tracks/vias. A successful build must not
  imply that these checks were fully evaluated.

Acceptance: overlaps fail with and without a manufacturing profile; exact contact
passes; selected layers/sides and net exceptions work; unknown-net copper is not
exempt; curved primitives do not fail merely because their bounding boxes overlap;
missing data produces coverage findings rather than inferred geometry.

## 5. Check route-region feasibility and report coverage

Files: the shared constraint validator, compiler orchestration, diagnostics and
`compiler/connectivity.rs` integration.

- Validate both ordinary routes and differential-pair waypoint sequences.
- Reject waypoints whose effective on-board area is empty.
- Detect a fully blocked waypoint only when the geometry calculation proves that
  all eligible copper layers exclude every possible visit area for that net.
  Support multiple keepouts jointly covering an area, or explicitly leave that
  case unverified until exact union coverage is implemented.
- Do not use straight endpoint-to-endpoint segments as invented route geometry.
  Do not assume overlapping waypoints are required, or infer infeasibility solely
  from region width without a defined centerline/trace-envelope rule.
- Report traversal, ordering in realized geometry, width/gap clearance, transitions,
  and remaining path feasibility as unverified until a router supplies geometry.
- Preserve graph connectivity as declared intent. Run proven constraint failures
  before returning a successful build; a connected intent graph is not physical
  routing approval. Retain accumulated warnings if another constraint is fatal.

Acceptance: off-board and provably blocked waypoints fail; partial overlap,
exceptions and an available unblocked layer prevent false errors; disjoint ordered
waypoints remain valid; both differential-pair nets are checked independently.

## 6. Make all constraint types inspectable

Files: Rust `board_svg.rs`; preview scene, canvas, inspector, layer controls,
diagnostic focusing and PNG/SVG export presentation.

- Draw zone boundaries as intent outlines, alongside keepouts and route waypoints.
  Use distinct visual treatment and controls for the three kinds.
- Carry stable constraint and region IDs plus ownership/type metadata in the
  projection. Resolve descriptive names from canonical IR; keep generated hashes
  as inspectable details rather than the primary label.
- Show route/net ownership and waypoint sequence numbers; show zone layers/net/
  clearance and keepout restrictions/scope/exceptions when selected.
- Support selecting a region and highlighting all regions owned by its constraint.
  Net highlighting should include associated route and zone intent.
- Include displayed constraint bounds in the full-scene viewport, with a board-fit
  action that still fits the board alone.
- Attach current region/violation geometry to diagnostics. Failed-build focusing
  must use that geometry even while the preview retains its last valid board.
- Keep overlay visibility, layer presets, saved preferences, SVG and PNG output
  consistent. Define migration of the existing single constraints toggle.

Acceptance: custom zone boundaries render without looking like filled copper;
waypoint order and keepout rules are identifiable; off-board overlays remain
inspectable; diagnostics select the correct current region; exported views match
the viewer and preserve physical coordinates.

## 7. Regression fixtures, documentation and completion

- Turn each investigation reproduction into a regression: ignored keepout overlap,
  off-board waypoint, blocked waypoint, missing zone outline, ambiguous anonymous
  declarations, and delayed sub-nm rejection.
- Add direct-protocol and serialized-IR cases as well as JSX bridge tests. Cover
  identity stability, layer/side scope, precision boundaries, exceptions, partial
  coverage, both differential-pair legs, preview recovery and exports.
- Review the basic and ESC examples under the new contract. Fix verified violations
  at their source; retain diagnostics for deliberately incomplete routing.
- Update `HOWTO.md`, region/preview documentation and example coverage statements.
- Run `bun run check`, the example builds, and focused visual inspection of the
  three overlay kinds, selection and failed-build geometry in both themes.

Completion means all reproduced issues have tests and defined outcomes, proven
violations are enforced, incomplete checks remain explicit, identities survive
unrelated edits, and CLI/preview/export agree on constraint meaning.

## Delivery order and boundaries

Implement 1 → 2 → 3 → 4 → 5 → 6 → 7. Stage regression tests with the phase they
verify. Schema and scope changes precede enforcement; validated geometry and
diagnostic metadata precede interactive preview work.

Autorouting, realized tracks/vias, copper pours, arbitrary region polygons,
3D collision checks and fabrication output remain separate future work. Existing
IR intent must be retained for those backends, and current coverage reports must
make those limits visible.
