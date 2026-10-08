# Declarative footprint authoring plan

## Objective

Develop a declarative PCB footprint authoring system that uses familiar inline CSS layout abstractions to produce precise physical geometry. Engineers and AI should be able to describe pads and footprint graphics using a restricted subset of positioning, Flexbox, Grid, and physical units.

Compilation must produce a tool-independent footprint IR with exact geometry and deterministic SVG output. Layout convenience must preserve geometric precision, stable identity, and the information needed for manufacturing validation.

Keep `examples/basic.tsx` as the board-level illustrative example. Use small footprint fixtures to prove individual features; defer a new ESC example until the footprint model is stable.

## Architecture

```text
Footprint JSX + inline styles
            ↓
Serializable footprint declarations
            ↓
Rust unit parser and deterministic layout engine
            ↓
Canonical footprint IR: physical primitives and semantic layer roles
            ↓
Deterministic SVG projection
            ↓
Placed part + board layer set: instance geometry and concrete layer bindings
```

React, CSS layout properties, browser behavior, and SVG rendering behavior remain outside the canonical physical model. SVG represents the resolved geometry; typed primitives retain pad, hole, layer, and manufacturing semantics so consumers do not have to recover them from drawing markup.

A footprint can compile independently of a board and component. A component selects a footprint, while a placed part owns its pin-to-pad binding, placement transform, connectivity, and resolved board-layer bindings. Multiple placed parts can reuse the same definition without mutating it.

## Design decisions to settle first

- Define the physical coordinate convention, footprint origin, positive axes, rotation direction, and placement transform order.
- Specify signed integer nanometres as the proposed length representation. Parse decimal physical-unit strings exactly, check overflow, and document quantization for operations that cannot produce integer coordinates.
- Define the supported angle representation and deterministic behavior for rotations. Begin with quarter turns; arbitrary rotation requires an explicit precision and rounding policy.
- Define semantic footprint layer roles: front/back copper, mask, paste, silkscreen, courtyard, fabrication, all copper, and all mask. Clarify which roles each primitive may target.
- Separate footprint-relative role resolution from explicit board-layer references. Ordinary reusable footprints must not import a board's layer objects.
- Define schema versioning and the migration path from current floating-point pads and board-bound layer targets.
- Define SVG physical dimensions, coordinate scaling, element ordering, number formatting, and correspondence between SVG elements and IR entity IDs.
- Decide how pad dimensions, mask expansion, paste reduction, and board-level overrides combine. Preserve the inputs needed to explain the resolved result.

Record these choices as part of the contract before implementation. Fixed-point storage alone does not make arbitrary transformations exact or prove that a footprint is manufacturing-ready.

## Initial authoring scope

Use one inline `style` model with physical lengths. Container components may provide convenient names, but must share the same layout semantics.

| Area | Initial support | Deferred |
| --- | --- | --- |
| Units | `mm`, `mil`, `in`, `um`, `nm` | Pixels, font units, viewport units |
| Positioning | Explicit dimensions and absolute offsets | Percentages and content-dependent sizing |
| Flexbox | Rows, columns, fixed child sizes, gaps, alignment | Wrapping, grow/shrink, intrinsic sizing |
| Grid | Explicit fixed tracks, row/column placement, spans | Implicit tracks, `fr`, min/max-content |
| Transforms | Translation, quarter-turn rotation, reflection | Arbitrary rotation until precision rules exist |
| Shapes | Rectangle, rounded rectangle, circle, oval | General paths and curved polygons |
| Graphics | Explicit strokes and outlines | Text until font geometry is reproducible |

Unsupported properties must produce actionable diagnostics rather than being ignored. Layout containers emit no manufacturing geometry. JavaScript mapping can generate repeated pads; a dedicated repetition component is optional and should only be added if it improves the API.

## Implementation phases

### 1. Physical geometry and layer contract

- [x] Define checked physical lengths, bounds, transforms, and typed shapes.
- [x] Introduce semantic footprint layers and per-instance role resolution.
- [x] Preserve stable pad and graphic IDs independently of positions and layout order.
- [x] Represent copper, drills, mask openings, paste openings, and documentation graphics distinctly.
- [x] Specify and implement the versioned migration from existing footprint definitions.
- [x] Retain an explicit-coordinate authoring path alongside future layout authoring.

Acceptance: one shared footprint can compile without a board and be placed on two boards with different layer IDs. Front and back placements resolve their own geometry and layer bindings without changing the definition. Exact unit conversion, overflow rejection, JSON round trips, and reference validation have contract tests.

### 2. SVG projection and inspection

- [x] Serialize typed physical geometry to SVG with physical dimensions and a documented `viewBox` scale.
- [x] Group elements by semantic layer and attach stable entity IDs.
- [x] Specify deterministic ordering, escaping, and decimal formatting.
- [x] Provide a way to inspect compiled footprints independently of a board.
- [x] Ensure holes and layer-specific openings are represented explicitly rather than through visual paint conventions alone.

Acceptance: repeated compilation yields identical IR and SVG bytes. Fixtures verify physical bounds, primitive coordinates, and layer membership; rendered inspection confirms pad and hole placement. SVG generation does not alter geometry or become a second source of truth.

### 3. Absolute-positioned JSX authoring

- [x] Add footprint, group, pad, hole, and graphic declarations with serializable inline styles.
- [x] Parse physical-unit strings in Rust and normalize them to canonical lengths.
- [x] Resolve fixed dimensions, absolute offsets, and supported transforms.
- [x] Reject unsupported style values and underdetermined layouts.
- [x] Attach diagnostics to footprint and feature IDs, retaining frontend source information where available.

Acceptance: an illustrative 0402 footprint produces the same canonical geometry through explicit-coordinate and positioned JSX authoring. The declaration protocol contains authoring intent; the final IR contains resolved geometry.

### 4. Restricted Flexbox

- [ ] Implement row/column layout with fixed physical child dimensions and gaps.
- [ ] Specify container sizing and alignment when free space is available.
- [ ] Specify deterministic allocation and rounding for distributed spacing, if supported.
- [ ] Prove that layout wrappers and visual body graphics do not accidentally change pad pitch.

Acceptance: a two-pad passive and an SOIC-style pad row compile to analytically verified positions and pitches. Reordering unrelated graphics does not change pad IDs. Layout results are independent of browser engines and host fonts.

### 5. Restricted Grid

- [ ] Implement explicit physical track sizes, row/column assignments, and spans.
- [ ] Specify alignment within cells and reject invalid or missing track references.
- [ ] Keep repeated-track syntax restricted and unambiguous if introduced.
- [ ] Exercise layouts with two-sided pad rows and a small pin-header array.

Acceptance: fixture assertions verify every pad center, size, pitch, and bounds. Grid and explicit-coordinate versions produce equivalent physical geometry.

### 6. Manufacturing validation and basic-example integration

- [ ] Validate duplicate feature IDs, invalid dimensions, unsupported layer combinations, drills, and incomplete physical definitions.
- [ ] Introduce explicit manufacturing profiles for minimum feature size, annular ring, spacing, and other supported checks.
- [ ] Report checks that cannot yet be performed rather than implying comprehensive manufacturability approval.
- [ ] Add mask/paste and courtyard checks once their geometry is represented.
- [x] Integrate a small authored footprint into `examples/basic.tsx`.
- [ ] Document supported styles, units, coordinate conventions, layer roles, precision limits, and migration behavior.
- [ ] Add regression fixtures and required checks to CI.

Acceptance: the basic example compiles, the full existing suite passes, and invalid manufacturing-profile fixtures emit useful diagnostics. Illustrative dimensions remain clearly identified; manufacturing readiness requires verified land-pattern data and the applicable validation profile.

## Validation strategy

Use small checked-in fixtures with independently calculated geometry: a two-pad passive, SOIC-style rows, a through-hole header, and a footprint placed on both board sides. Test unit equivalence, stable identities under unrelated edits, exact pitch, layer resolution, serialization, deterministic SVG output, and failure diagnostics.

Use a documented quantization tolerance only for operations that require rounding. Byte stability complements geometric checks; it does not replace them. Visually inspect SVG fixtures when a change affects rendering or coordinate conventions.

## Completion criteria

- Footprints compile independently of board instances and component definitions.
- Supported inline layouts resolve to explicit physical geometry with a documented precision policy.
- Canonical IR retains electrical and manufacturing meaning alongside deterministic SVG output.
- Placed parts resolve transforms and board layers without mutating reusable definitions.
- Unsupported or ambiguous authoring inputs fail explicitly.
- Small fixtures and the basic board demonstrate the API, and all required repository checks pass.

## Deferred work

Arbitrary SVG paths, font outlines, browser-complete CSS, general polygon operations, full manufacturing export, autorouting, thermal analysis, and a realistic ESC design are later work. Revisit each when a concrete use case justifies expanding the contract.
