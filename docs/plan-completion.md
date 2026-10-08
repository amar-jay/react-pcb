# Declarative footprint plan completion audit

Audit date: 2026-10-08. All implementation tasks and acceptance criteria in
[PLAN.md](../PLAN.md) are complete within its initial scope. The task in
[todo.md](../todo.md) is complete under that contract. This audit distinguishes
implemented footprint authoring and scoped validation from the plan's explicitly
deferred routing, export, arbitrary paths/angles, font geometry and comprehensive
manufacturing analysis.

## Settled design decisions

| Decision in the plan | Implemented contract and evidence |
| --- | --- |
| Coordinates, origin, axes, rotation, placement order | Author-selected footprint origin; x right, y down; clockwise quarter turns; instance x reflection, rotation, then translation. [Physical contract](physical-footprints.md); Rust `physical::tests::independent_definition_and_instance_transform`; `layout.test.tsx` nested-transform assertions. |
| Integer lengths, overflow, quantization | Exact checked decimal conversion for nm/um/mm/mil/in; signed integer nm centers; doubled-nm edges/internal box origins; JavaScript exact integer limits; non-integer final centers reject, without rounding. Rust physical, layout, SVG and manufacturing geometry tests exercise precision and wide arithmetic. |
| Angles | Exactly 0/90/180/270; arbitrary angles reject until a precision policy exists. Physical/layout tests cover rotations and unsupported inputs. |
| Semantic roles and allowed primitives | Front/back copper, mask, paste, silkscreen, courtyard, fabrication, all-copper and all-mask; purpose/role compatibility checked in `physical.rs`. Drills have independent geometry/plating. Physical/compiler failure tests cover invalid and overlapping roles. |
| Role resolution versus board references | Standalone definitions use semantic roles; placed instances bind to explicit board layer IDs by kind/side/purpose. Independent-definition test places the same footprint on differently named board layers; compiler tests cover missing/ambiguous roles and back placement. |
| Versions and migration | Board/physical schema 2; physical schema 1 round-drill geometry remains readable; layout protocol 1; independent profile schema 1. Explicit legacy migration requires units and layer mapping and preserves identity. Rust and TypeScript migration/round-trip tests exercise compatibility. |
| SVG contract | Physical mm dimensions, half-nm viewBox units, fixed semantic group/ID ordering, exact decimal formatting and XML escaping; holes/openings retain explicit elements. `svg.rs`, Rust SVG tests and `svg.test.ts` verify byte stability and bounds. |
| Copper, mask/paste offsets and board overrides | Pad roles produce nominal apertures; separate explicit physical openings encode expansion/reduction and preserve their stable IDs. Profiles validate geometry without changing it. Board mask metadata is retained and explicitly reported as unapplied. [Manufacturing aperture policy](manufacturing-validation.md#aperture-policy-and-board-overrides) documents this initial decision; automatic offsets remain deferred. |

## Phase deliverables and acceptance

Test paths below are relative to `packages/react-pcb/src/__tests__`; Rust tests
are in the named module under `crates/pcbir/src`. Test assertions check geometry
against explicit coordinates or independent analytic values, alongside byte
stability and failure diagnostics.

| Phase | Every planned deliverable | Acceptance evidence |
| --- | --- | --- |
| 1. Physical/layer contract | Checked lengths/bounds/transforms/shapes; semantic layers and per-instance resolution; geometry-independent pad/graphic IDs; distinct copper/drills/openings/documentation; versioned legacy migration; explicit-coordinate API. Implemented in `physical.rs` and TypeScript `footprints/physical.ts`. | Rust `exact_units_and_overflow`, `independent_definition_and_instance_transform`, `stable_ids_bounds_and_invalid_contracts`, `explicit_legacy_migration_preserves_units_and_identity`; `physical.test.tsx`; compiler reference, definition-conflict, binding and layer-resolution tests. Shared standalone geometry survives placement on two boards and both sides without mutation. |
| 2. SVG/inspection | Physical dimensions/viewBox; role groups/stable IDs; deterministic ordering/escaping/formatting; standalone inspection command; independent holes/mask/paste elements. Implemented in `svg.rs`, `footprints/svg.ts`, and `examples/footprints/inspect.ts`. | Rust `primitive_projection_and_stroke_bounds`, `exact_decimal_formatting`, slot projection tests; `svg.test.ts` verifies repeated IR/SVG bytes, bounds and invalid XML handling. Ten inspection SVGs rendered and visually checked. Projection preserves canonical geometry. |
| 3. Absolute JSX | Footprint/group/pad/hole/graphic declarations and serializable styles; Rust physical parsing; fixed boxes/offsets/typed transforms; unsupported/underdetermined input rejection; feature/source diagnostics. Implemented in `footprints/jsx.tsx`, renderer declarations and `layout.rs`. | `layout.test.tsx` verifies positioned 0402 equals explicit physical IR/SVG, nested transforms, wrapper removal, units, JS mapping, identity and source-scoped errors. Rust direct-protocol tests prevent bypassing validation. Canonical geometry contains no authoring styles or frontend hints. |
| 4. Restricted Flexbox | Fixed row/column flow and physical gaps; fixed sizing/free-space alignment; exact centering without distributed spacing; wrappers/absolute graphics leave pitch unchanged. Implemented in shared `layout.rs`/`FootprintStyle`. | `flex.test.tsx` verifies two-pad passive equivalence, analytically calculated SOIC 1.27 mm pitch, every alignment, mixed units, nested transforms, stable IDs and overlays. Rust tests cover empty flow, overflow, half-nm origins and rejection of invalid final centers. No browser/font layout participates. |
| 5. Restricted Grid | Explicit fixed physical tracks; explicit 1-based row/column assignment/spans; start/center/end cell alignment; invalid/missing references reject; track arrays only; opposing pad rows and 2x3 header fixtures. Implemented in shared `layout.rs`/`FootprintStyle`. | `grid.test.tsx` checks every center/size/pitch/bounds against explicit geometry, SVG equivalence, drill retention, front/back placement, spans including gaps, nested Grid/Flexbox, wrappers/overlays/reordering, serialization and scoped errors. Rust tests cover direct protocol, wide arithmetic and forbidden implicit tracks. |
| 6. Manufacturing/integration | Structural feature validation; explicit feature/spacing/drill/ring profiles; explicit incomplete coverage; mask expansion/web, paste containment/feature and courtyard checks; authored passive in basic board; complete contract documentation; regression fixtures and required CI. Implemented in `manufacturing/`, `footprints/manufacturing.ts`, board/compiler integration and `examples/footprints/manufacturing.tsx`. | `manufacturing.test.tsx` and Rust manufacturing tests verify exact threshold failures and stable feature diagnostics, curved Euclidean geometry, round/slot drills, layer separation, expanded/shared masks, wrong-side/orphan paste, missing courtyards, odd-width strokes, malformed policies/geometry, immutable definitions and deterministic reports. Board policy round-trips with exact optional limits. Actual basic example compiles in a required test and has three physical definitions, placed geometry and conforming scoped reports. |

## Completion criteria

| Criterion | Evidence |
| --- | --- |
| Independent footprint compilation | `compileFootprint` and `pcbir footprint` require no board/component. Explicit and JSX fixtures compile independently in all layout tests and inspection generation. |
| Inline layouts resolve exact geometry with documented precision | Absolute/Flexbox/Grid share one Rust box/transform engine. Independent geometry assertions cover each mode; the physical contract documents whole-nm centers, half-nm edges and rejection instead of rounding. |
| IR retains electrical/manufacturing semantics alongside SVG | Component/footprint/placed-part definitions remain separate. Pin bindings, drill/plating, primitive purposes, layer roles and selected board profile persist in serializable IR. SVG derives from typed physical geometry rather than replacing it. |
| Instances preserve reusable definitions | Physical, Grid, USB and LQFP tests check front/back geometry/layers; the independent-definition test also changes board layer IDs and checks the original definition remains identical. |
| Unsupported/ambiguous intent fails | TypeScript snapshots reject nonserializable values; Rust rejects unknown declarations/props/styles, invalid physical units, missing/overdetermined layout, implicit tracks, unsuitable layers and invalid bindings. Both CLI/direct-protocol and JSX bridge tests exercise these boundaries. |
| Fixtures/basic example and required checks | Checked-in positioned/Flexbox/Grid/header/manufacturing fixtures, manufacturer-sourced USB/LQFP fixtures and basic board run successfully. All required local checks pass; CI requires the same checks and inspection generation. |

## Final verification

- `bun run check`: passed Rust formatting, TypeScript checking, Cargo checking,
  Clippy with warnings denied, **60 Rust tests**, and **53 Bun tests / 612 assertions**.
- Basic board compilation is exercised by the Bun suite as a subprocess. It
  emits three unique physical footprints and manufacturing reports, with no
  checked-rule failures. All placed parts have concrete physical geometry.
- `bun run footprints:inspect /tmp/react-pcb-phase6`: generated ten standalone
  JSON/SVG fixtures, five scoped manufacturing reports and the layer-toggle HTML
  page. SVGs were rendered using Inkscape and visually checked, including pad rows,
  header pitch/drills, USB slots, expanded masks, reduced paste and courtyard.
- CI runs frozen dependency installation, `bun run check`, then inspection
  generation. This audit records local verification; a remote CI run is not
  claimed.

`conformsToCheckedRules` only describes evaluated profile rules. Reports always
retain `complete: false` and explicit unverified/skipped checks. USB and LQFP
dimensions have documented manufacturer sources; passive/layout examples and
process limits are illustrative. The implementation completes the plan without
claiming that the illustrative board is ready for fabrication. The plan's deferred
work remains deferred.
