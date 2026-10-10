# Footprint and board manufacturing validation

Phase six adds explicit, scoped process checks to the footprint authoring system.
A profile is supplied by the caller; no distributor or fabricator capabilities
are inferred. The checked-in profiles are illustrative process limits, not a
claim that any fixture or board is ready to manufacture.

## API and retained policy

```tsx
import {compileFootprint, validateFootprintManufacturing} from '@react-pcb/core';
import {ManufacturingPassive, inspectionProfile} from '../examples/basic/footprints/manufacturing.tsx';

const footprint = await compileFootprint(<ManufacturingPassive />);
const report = await validateFootprintManufacturing(footprint, inspectionProfile);
// report.conformsToCheckedRules is true for this fixture.
// report.complete is always false; read the explicit skipped checks.
```

`validateFootprintManufacturing` takes canonical physical geometry and a
`ManufacturingProfileInput`. Its CLI equivalent is `pcbir validate-footprint`,
reading `{footprint, profile}` JSON on stdin. Rust callers use
`manufacturing::ProfileInput::compile` and `manufacturing::validate`. Independent
reports serialize without JSX, browser styles or EDA-specific meanings.

Malformed profiles and structurally invalid footprints reject with a structured
`PcbCompileError`. Valid geometry that violates selected process limits returns a
report with failures, allowing an inspection tool to show all applicable problems.
The standalone CLI exits successfully when it produces such a report; callers
must inspect `conformsToCheckedRules`. It exits unsuccessfully for malformed input.

`<Board manufacturingProfile={profile}>` applies the same profile to each unique
physical footprint definition and resolved placed geometry during compilation. A checked-rule violation
rejects board compilation with `PCBMFG002`, preserving other findings and skipped
checks in the error's `diagnostics`. Successful compilation returns
`manufacturingReports`, keyed by footprint key, plus `boardManufacturingReport`, and includes skipped-check warnings
in `diagnostics`. Legacy/library definitions without canonical physical geometry
emit `PCBMFG003` and receive no fabricated report. An omitted board profile leaves
structural checks active and selects no manufacturing policy.

## Placed-board checks

`boardManufacturingReport` is separate from reusable footprint reports. It retains
the board ID, normalized profile, coverage counts, diagnostics, and
`conformsToCheckedRules`; `complete` remains `false`. Without a board profile,
the compiler returns `boardManufacturingReport: null`.

`board-copper-spacing` compares placed pads and copper primitives on each shared
concrete copper layer ID using `minCopperSpacing`. It checks both different parts
and concrete-layer aliases within a part, including single-copper-layer boards.
Actual world coordinates include quarter-turn rotation, back-side reflection,
and board-unit conversion. Layer ID spelling and descriptive net names have no
electrical meaning.

Two pads bound through `pinMap` and `connections` to the same established net ID
are exempt from board copper spacing. Unconnected pads, different net IDs with
identical names, and copper graphics without an electrical binding remain checked.
Standalone footprint spacing retains its conservative, net-independent contract.

`inter-part-courtyard` runs when the profile selects `minCourtyardClearance`.
It checks that declared courtyard reservations of different parts do not overlap
on the same physical side, resolving side from concrete mechanical-layer metadata.
Front and back reservations are checked independently. Courtyards already encode
package enclosure margins: their shapes are compared at their declared centerlines,
without applying `minCourtyardClearance` a second time. Touching boundaries pass;
interior overlap fails, including when the parts share a net. Multiple outlines
are compared individually, and overlapping outlines within one part do not create
inter-part failures. Documentation stroke is not an additional reserved margin.

Unplaced parts, unavailable physical geometry, and missing courtyards on a part's
placement side produce explicit skipped/partial coverage. Declared courtyards on
the opposite side are also checked when present; a through-hole pad alone does
not establish a package body or courtyard on that side. No envelope is invented
from pads or bounding boxes. Board edges, routed traces/vias, realized zones,
board mask/paste checks, NPTH isolation, and 3D bodies remain unverified.

For inspection without rejecting a valid IR document because of rule failures:

```tsx
import {validateBoardManufacturing} from '@react-pcb/core';

const report = await validateBoardManufacturing(ir, profile);
// Failed rules are returned in report.checks; malformed IR/profile rejects.
```

The CLI equivalent is `pcbir validate-board`, reading `{board: ir, profile}`.
Rust callers use `manufacturing::validate_board`. The validator verifies stored
realization against definitions and placements, validates IDs/references, and
never modifies IR. Findings sort by stable part/feature/layer IDs; declaration
reordering preserves the report. Board compilation collects footprint and board
findings before rejecting selected-rule failures with `PCBMFG002`. The preview
shows these failed-build diagnostics while retaining its last valid scene.

The canonical board retains the selected profile as
`board.manufacturingProfile`, including its stable `key`, schema version and
exact nanometre limits. Reports retain that same normalized policy. Optional
board profiles and compiler reports are additive schema-two fields; physical
schema version two and layout protocol version one remain unchanged. New policy
fields require a compiler that implements Phase six; older compilers must not be
used to enforce them.

## Profile contract

All authoring lengths are exact physical-unit strings (`nm`, `um`, `mm`, `mil`,
`in`) parsed by Rust. Unknown properties, unsupported versions, empty keys,
overflows and sub-nanometre values reject. No rounding, implicit units or numerical
fabricator defaults are allowed.

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Required, exactly `1`; independent of footprint/board versions. |
| `key` | Required nonempty stable policy ID. |
| `minCopperFeature` | Required positive minimum smaller dimension of a copper primitive. |
| `minCopperSpacing` | Required non-negative Euclidean separation: shared semantic roles in footprints; concrete copper layers and established pad-net exemptions on boards. |
| `minDrillDiameter` | Required positive minimum tool diameter, including slot minor diameter. |
| `minAnnularRing` | Required non-negative Euclidean margin between a plated pad's drill/slot and its actual copper shape. |
| `minMaskExpansion` | Optional non-negative enclosure margin of mask apertures around each copper pad on its front/back sides. |
| `minMaskWeb` | Optional non-negative separation between exposed mask apertures on each side. |
| `minPasteFeature` | Optional positive minimum smaller dimension of a paste aperture. |
| `minCourtyardClearance` | Optional non-negative enclosure margin to a courtyard's declared centerline; also selects inter-part courtyard overlap checks. |

Omitted optional thresholds are explicitly skipped; they are not assumed zero.
A selected check with no applicable entities is `not-applicable`. Boundary
equality passes. Zero spacing permits touching but still rejects interior
overlap between distinct copper primitives or non-contained mask apertures.
A plated standalone `Hole` has no associated copper pad, so its ring check is
skipped. NPTH tool diameter is checked, but NPTH copper isolation is unverified.

## What is checked

Structural validation runs first, with or without a profile: stable nonempty
unique feature IDs, exact supported dimensions/rotations, valid shape/radius,
compatible semantic layer roles, nonempty required layers, layer overlap,
complete hole/drill geometry, plating and slot consistency, exact bounds, and
supported schema versions. Invalid physical features carry `footprint-key/id`
diagnostics. A footprint must contain physical features; a copper pad is not
required for a legitimate mechanical-only footprint.

Copper spacing compares each pair that shares front, back or all-copper roles.
Distinct feature IDs are treated separately even if a future board pin/net mapping
joins them; the report states this conservative electrical assumption. It does
not check distances between different placed parts. The separate board report
checks placed geometry, concrete layers, and stable pad-net bindings, including
front/back copper aliases on a single-copper-layer board.

Pad mask roles create nominal apertures using the pad's shape. Explicit
`mask-opening` features contribute their own exact aperture shapes. Expansion
passes when one aperture contains a pad with the selected margin on that side.
Missing apertures fail a selected expansion check. Web checks remove completely
contained/identical apertures, so an expanded explicit aperture supersedes the
pad's nominal aperture without creating an artificial overlap error. Remaining
non-contained overlaps or insufficient separation fail. A single aperture
covering multiple complete pad shapes fails a positive web requirement. Partial
mask coverage, merged aperture topology, and solder-mask registration tolerances
are not a comprehensive process analysis.

Paste roles on pads likewise imply nominal paste apertures. Every explicit or
implicit front/back paste aperture must be contained by one copper pad on the
same side; this check always runs when paste is present. An orphan aperture,
wrong-side aperture, or rectangular corner protruding outside a circular pad
fails. Multiple apertures within one pad are allowed. Minimum paste feature size
is checked when selected. Area coverage, stencil thickness, release ratio and
paste-over-drill suitability remain unverified.

Courtyard checks enclose copper, standalone holes/drills and fabrication geometry
on each applicable side. Documentation stroke contributes half its exact width
to the envelope, including odd nanometre widths; courtyard clearance is measured
to its declared shape centerline. Silkscreen and mask/paste apertures are not
package-body geometry for this check. Missing applicable side outlines are
skipped with an explicit reason. Multiple outlines are permitted, but each object
must fit in one individual outline; union-of-outlines containment is not inferred.
Through-hole copper is applicable on both sides. Real 3D bodies, assembly-height
constraints remain unverified. The board report checks declared courtyard
collisions between different placed parts.

## Exact geometry and determinism

Rectangles, rounded rectangles, circles and ovals at quarter turns all have an
exact representation as an axis-aligned rectangular core plus a disk. Cores may
collapse to a point or line. Calculations use doubled nanometres and wider signed
integers; circles, capsules, reflected/rotated instances, and half-nanometre edges
retain exact meaning. No floats, sampled curves or square-root rounding determine
passes or failures.

Spacing compares the squared distance between rectangular cores with the squared
sum of radii and requested clearance. Containment maximizes the difference of
support functions of the inner and outer rounded boxes, accounting for the
requested margin. This catches curved-corner protrusion that bounding-box tests
would miss. General paths, arbitrary rotations and polygon unions remain outside
the physical authoring contract.

Check IDs and check order are fixed; feature-based findings sort by stable local
ID. Reordering physical feature declarations leaves report bytes unchanged.
Reports never mutate physical IR, its IDs, bounds, nominal shapes or SVG output.

## Aperture policy and board overrides

Copper pad dimensions are nominal copper. Pad mask/paste roles use that same
nominal shape. To express expansion/reduction, declare separate physical
`Graphic` apertures, with their own stable IDs, sizes, layer roles and purposes.
The canonical geometry preserves both the nominal copper and the explicit
opening; a profile preserves the limits used to explain each check result.

Board solder-mask `expansion` metadata is retained but does not resize these
apertures. No pad, board or manufacturing-profile field silently overrides explicit
geometry. Automatic aperture offsets and board override precedence beyond this
explicit-geometry rule are deferred until they have a separate authoring and
provenance contract. Reports explicitly identify unapplied board mask metadata.
A process profile validates selected geometry; it is not a geometry-generation
recipe. This is the settled initial-contract decision from `PLAN.md`.

## Coverage and diagnostics

Each check reports `id`, `status`, `evaluated`, `skipped` and structured
`diagnostics`. Status is `passed`, `failed`, `partial`, `skipped`, or
`not-applicable`; failures take priority over skipped coverage. `conformsToCheckedRules`
means only that evaluated rules have no failures. `complete` is always `false`,
because land-pattern provenance/tolerances, full board DRC, process suitability,
plating tolerance, NPTH isolation, 3D bodies and other listed checks remain
unverified. The final `unverified` check names these boundaries explicitly.

- `PCBMFG001`: malformed or invalid manufacturing policy/input.
- `PCBMFG002`: selected process-rule violation, with feature ID and check-name help.
- `PCBMFG003`: skipped or unavailable check, with an explicit reason.
- Existing `PCBFP001` and `PCBFP002` retain physical/layout validation meaning.

The API intentionally offers no “ready for fabrication” boolean. Read and resolve
failed, partial and skipped checks against verified manufacturer land-pattern
sources and the actual assembly/fabrication process before using a design.

## Fixtures and required checks

`examples/basic/footprints/manufacturing.tsx` provides a Grid-authored passive with
0.05 mm expanded mask openings, 0.05 mm paste inset, and a 0.20 mm courtyard
clearance. `inspectionProfile` names illustrative limits. `examples/basic/board.tsx`
reuses it and selects an illustrative board profile with zero mask expansion
for the USB/MCU's nominal openings. All three board footprints have canonical
physical definitions and instance geometry. The board emits three footprint reports and a board report,
including warnings about remaining unverified coverage.
The capacitor now sits at `[23, 18]` mm, outside the MCU courtyard. Its previous
`[27, 18]` placement is a regression case that fails both new board checks.

`bun run board:inspect examples/basic/board.tsx --out dist/basic-inspect` derives its
three used footprints from the board and writes the actual board-selected
`.manufacturing.json` reports beside their JSON/SVG previews. The inspection
command does not select an independent profile. Generic Grid/Flexbox fixtures
are covered by tests and intentionally lack some apertures/courtyards; stricter
validation can return useful failed/skipped reports. These are not production
land-pattern fixtures.

`bun run check` requires Rust formatting, TypeScript checking, Cargo checking,
Clippy with warnings denied, Rust tests, and Bun tests including the actual basic
example subprocess. Rust tests build dependencies before Bun's CLI bridge tests
to avoid first-compilation timeouts in a clean checkout. CI runs that same command
and generates the inspection artifacts. Tests cover exact boundaries and overflow,
round/slotted drills, curved containment, diagonal separation, both board sides,
missing/unresolved geometry, malformed policies, shared masks, absent courtyards,
odd-width strokes, immutable definitions and deterministic reports.
`board-manufacturing.test.tsx` adds real C1/U1 collisions, exact board spacing and
courtyard boundaries, stable net IDs, both sides, concrete layer aliases, curved
reservations, missing coverage, unit conversion, and forged-realization rejection.
Preview tests verify initial board failures, retained scenes and current diagnostics,
and clearing findings after recovery.
