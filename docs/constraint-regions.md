# Constraint regions: schema-3 contract

Board IR schema **3** and board declaration protocol **2** define explicit
constraint scope. Physical footprint schema 2 and footprint layout protocol 1
are unchanged. The [implementation plan](constraint-regions-plan.md) records
the remaining phases.

## Current implementation and coverage

| Behavior | Status |
| --- | --- |
| Typed keepout restrictions, scope defaults, scope validation and serialization | Implemented. |
| Explicit schema-2 upgrade preserving canonical identities and geometry | Implemented. |
| Unsupported constraint properties and malformed serialized scopes rejected | Implemented. |
| Uniform exact region precision, constraint reference checks and off-board policy | Implemented across compilation, decoding, projection and standalone board validation. |
| Predictable declaration identity and actionable collision diagnostics | Implemented. Existing IDs are preserved; errors name the declaration and owner and provide a matching key example. |
| Physical keepout enforcement and incomplete-coverage diagnostics | Implemented for canonical placed pads/copper and explicit courtyard reservations. Missing realization reports incomplete coverage. |
| Route waypoint feasibility and realized traversal checks | Empty on-board waypoints reject. Keepout feasibility is pending phase 5; realized traversal requires future routing geometry. |
| Zone overlays, region selection and full constraint inspection | Pending phase 6. Current preview draws keepouts and route waypoints as one overlay. |

The semantic rules below define constraint intent and the available checks.
A successful compile rejects proven keepout violations but does not establish
complete physical constraint satisfaction; read the coverage warnings.

## Geometry and ownership

Regions have their own stable IDs and rectangular geometry; constraints refer to
those IDs. Coordinates use the board's declared units and global board coordinate
system. Modules namespace identities and do not transform coordinates.

Every stored rectangle is validated, including custom zone boundaries and regions
that no constraint currently references. Values must be finite, dimensions must
be positive, and declared decimal board-unit values must convert exactly to
integer nanometres. Sub-nanometre values reject during compilation. Coordinates,
dimensions and derived right/bottom edges must fit the exact JSON integer range
in nm (absolute value at most 9,007,199,254,740,991). Edge and intersection
arithmetic uses doubled nm without floating-point multiplication or rounding.

Region map keys must agree with their IDs. Constraint IDs are nonempty and unique
across routes, differential pairs, zones and keepouts. References must resolve
to regions, declared nets, connected logical endpoint pins and appropriate copper
layers. Ownership is established by references, never inferred from ID spelling.
Serialized IR may share a region between constraints or revisit it in an ordered
waypoint sequence; every use is checked in its owner's context.

Preserve region IDs across unrelated insertion, reordering and geometry edits.
Frontends may supply ordinary keys to distinguish repeated declarations; keys
are not canonical IR entities. Multiple waypoints in one route, multiple keepouts
in one scope, and multiple zones with the same net/layer anchor need distinct
keys. Ambiguous anonymous declarations are rejected instead of receiving IDs
derived from array positions or mutable coordinates.

### Declaration keys

Use a stable key on each declaration that needs distinguishing. A key on an
enclosing circuit component alone does not identify its multiple unkeyed
keepouts or waypoints. Keep keys independent of coordinates, dimensions,
restrictions, array indexes and random values. React's
[key guidance](https://react.dev/learn/rendering-lists#rules-of-keys) explains why
stable keys preserve identity during list changes; this compiler also uses them
as frontend identity hints.

| Declaration | Owner and unkeyed identity anchor | When distinct keys are needed |
| --- | --- | --- |
| `RouteThrough` | Owning route or differential-pair ID. | Multiple waypoints in that owner, even at different coordinates. |
| `Keepout` | Board or module scope. | Multiple keepouts of any geometry, restrictions, layers or exceptions in that scope. |
| `Zone` | Board or module scope plus net ID and the set of copper layer IDs. | Multiple zones with the same net/layer selection, even with different boundaries or clearances. |
| `Route` | Board or module scope plus net ID and ordered endpoints. | Multiple routes with the same net and ordered endpoints. |
| `DifferentialPair` | Board or module scope plus ordered net IDs and endpoints. | Multiple pairs with the same ordered nets and endpoints. |

Within each declaration type, a supplied key replaces the unkeyed anchor;
the owner/scope still participates. Changing a keyed route's endpoints or a
keyed zone's net/layers keeps its ID. Reusing one key for two declarations of
the same type in one owner is an error, even if their properties differ.
Different modules and different routing owners may reuse keys. An unkeyed
declaration and keyed siblings can coexist; existing unkeyed IDs remain stable
when keyed siblings are added. Introducing a key to an existing unkeyed
declaration, changing that key, or moving it to another owner intentionally
changes its derived ID.

```tsx
<Keepout key="connector-clearance" region={rect(0, 2, 2, 4)} disallow={["vias"]} />
<Keepout key="mounting-clearance" region={rect(8, 2, 2, 4)} disallow={["components"]} />

// Two boundaries on the same net and layers still need distinct keys.
<Zone key="ground-left" net={ground} layers={[frontCopper]} boundary={rect(0, 0, 4, 8)} />
<Zone key="ground-right" net={ground} layers={[frontCopper]} boundary={rect(6, 0, 4, 8)} />
```

`PCBIR029` reports ambiguous, conflicting or empty frontend keys with the
declaration kind, its owner and a matching JSX key example. Exact unkeyed zone
and keepout duplicates retain `PCBIR015` and `PCBIR016`, with the same key
guidance. Remove an unintended duplicate or give intended repeated declarations
distinct stable keys; editing geometry alone cannot distinguish their identities.
Other frontends supply an opaque `sourceKey` in declaration protocol 2. The
compiler preserves the existing FNV-1a-128 derivation and excludes these hints
from canonical IR.

## Ordered route waypoints

`RouteThrough` declares an area the future route centerline must visit. The
`through` array follows declaration order from `from` to `to`. Differential pairs
share that waypoint sequence between their two legs.

```tsx
<Route net={signal} from={pad(source, "OUT")} to={pad(destination, "IN")}>
  <RouteThrough key="exit" region={rect(2, 3, 2, 2)} />
  <RouteThrough key="entry" region={rect(8, 3, 2, 2)} />
</Route>
```

Separated waypoints are valid: the route may travel between them. A waypoint does
not reserve exclusive space or confine the entire route to its rectangle.
Width, differential-pair gap and impedance remain independent routing intent.
Endpoints and waypoint rectangles are not substitutes for realized trace paths.

## Keepout restrictions and scope

| Property | Declaration meaning | Canonical IR |
| --- | --- | --- |
| `disallow` | Nonempty, unique set of `components`, `copper`, `tracks`, `vias`. | Typed restriction values. |
| `componentSides` | Front and/or back; available only with `components`. Omission selects both sides. | Explicit side array; empty when components are not restricted. |
| `copperLayers` | Board copper layer handles; available only with `copper`, `tracks` or `vias`. Omission selects all board copper layers. | Explicit concrete layer ID array; empty when no electrical restriction applies. |
| `except` | Unique net handles exempting known-net electrical objects. Nonempty exceptions require an electrical restriction. | Stable net IDs. |

The two scopes are independent. A mixed keepout can restrict front component
placement and a particular inner copper layer without treating layer position
as identity. Explicit scope selections must be nonempty and unique. Missing
layers, technical/dielectric layers, invalid sides and inapplicable scope fields
are errors. Unknown constraint properties are rejected rather than ignored.

```tsx
<Keepout
  key="sensing-buffer"
  region={rect(11.5, 14, 1.2, 13)}
  disallow={["components", "tracks", "vias"]}
  componentSides={["front"]}
  copperLayers={[frontCopper]}
/>
```

Canonical defaults and selections are serialized deterministically. Sets do not
encode physical stackup ordering. Layer handles are resolved by their assigned
board ID; names and copied thickness/usage properties do not define identity.

`copper` restricts all copper-bearing geometry, including pads, tracks, vias and
zone fills once realized. Restricting `tracks` or `vias` alone does not forbid pad
copper or plane fills. Via scope applies when its realized layer span intersects
a selected copper layer.

Component restrictions apply to explicit footprint courtyards as placement
reservations on the selected sides. Missing courtyards or placement data remain
unverified; validators must not infer a package body from pads, a centroid or
fabrication graphics. Net exceptions never exempt a whole component. Electrical
exceptions require an authoritative net binding; unknown-net copper is restricted.

Exact boundary contact is permitted. Interior overlap violates a keepout.
Manufacturing clearances are a separate policy and do not change this structural
rule. Enforcement must work without selecting a manufacturing profile.

Compilation and board SVG projection reject proven overlaps with `PCBIR040`,
identifying the constraint, region, part, feature and affected concrete layer or
component side. Standalone `validateBoardManufacturing` / `pcbir validate-board`
returns the same findings in its `constraint-keepouts` check; violations make
`conformsToCheckedRules` false. This check uses the structural rule regardless of
the supplied profile and does not add process clearances. All supported shapes
(rectangles, rounded rectangles, circles and ovals) use exact primitive
intersections; overlapping bounding boxes alone are insufficient proof. Courtyard
shapes reserve their enclosed area at the declared centerline; documentation
stroke does not add a reservation margin. Explicit round/slotted pad drill voids
are excluded from copper: a region contained in the void may touch its boundary.

`PCBIR041` reports incomplete coverage per keepout: missing part placement or
canonical physical geometry, missing courtyard on a selected placement side,
and unavailable realized tracks, vias or zone fills. A mixed restriction reports
each unavailable object category once, and each missing part once, independent
of the number of selected layers. `tracks`/`vias` alone do not check pad copper
or component reservations. Legacy numeric pads require explicit physical
migration before these checks; the compiler does not invent canonical geometry.
Missing reservations remain unverified even when pads overlap a component keepout.
Completely off-board keepouts have no on-board enforcement or coverage work.
Warnings and other violations survive a fatal keepout finding, and selecting a
manufacturing profile does not duplicate the compiler's keepout warnings.

Serialized physical consumers verify the world geometry against its footprint,
placement and concrete layers and validate logical-pin-to-pad bindings before
checking exceptions. Decoding and upgrading still check structure rather than
constraint satisfaction; they can retain a structurally valid design with a
physical keepout violation for subsequent inspection/validation.

## Zones, board intersections and feasibility

A zone declares its intended fill boundary, net, copper layers and clearance.
It does not create filled copper or establish electrical continuity. An overlapping
keepout may require a future fill engine to subtract forbidden areas; boundary
overlap alone is not proof of an invalid zone.

The shared region validator preserves authored geometry and computes its
on-board intersection explicitly. Partially off-board regions are allowed;
stored geometry is not rewritten. Completely off-board keepouts and zones warn
because they have no on-board effect. A route waypoint with no positive-area
board intersection is an error, including rectangles that only touch the board
edge. This applies to ordinary routes and differential pairs. Compilation and
projection return boundary warnings in their diagnostics; standalone board
validation includes them in its `constraint-regions` check. Decoding and upgrading
validate structure without returning a separate warning report; use projection
or validation to inspect those warnings. Warnings remain available when an
off-board waypoint also fails compilation.

Feasibility errors require proof after considering net exceptions, all eligible
copper layers and permitted boundary contact. Overlap with one keepout, a gap
between waypoints, or a straight-line sketch between endpoints does not establish
that routing is impossible. Checks needing unresolved paths, layer transitions,
trace envelopes or zone fills must report incomplete coverage.

## Saved boards and compatibility

Recompile source declarations with protocol 2 to obtain schema-3 IR. Current
compiler consumers reject unsupported versions; they do not implicitly upgrade
saved boards. Older compilers reject protocol 2 rather than dropping new scope.

Use the explicit upgrade API for saved schema-2 JSON:

```ts
import { upgradeBoardIr } from "@react-pcb/core";

const upgraded = await upgradeBoardIr(await Bun.file("board-v2.json").json());
await Bun.write("board-v3.json", JSON.stringify(upgraded, null, 2));
```

Or use the Rust CLI:

```sh
cargo run --quiet -p pcbir -- upgrade-board < board-v2.json > board-v3.json
```

Upgrading preserves canonical IDs, geometry, revision and route order. It adds
both component sides to legacy component restrictions, all board copper IDs to
legacy electrical restrictions, and empty arrays to inactive scopes. It accepts
schema 2 or current schema 3, validates scope, region geometry and references, and
does not mutate the API input. Invalid legacy geometry or references reject;
the upgrade does not repair them.
Legacy documents containing schema-3 scope fields are rejected rather than
overwritten. Unsupported versions require a separate migration.

Migration does not compile declarations, move parts, synthesize routing, prove
physical connectivity or certify constraint satisfaction. Physical consumers evaluate available placed geometry; later validator
phases add route-region feasibility and further inspection.

`PCBIR035` identifies an invalid keepout scope. `PCBIR036` identifies incompatible
or malformed board IR at decoding/upgrade boundaries. `PCBIR037` identifies invalid
exact region geometry, `PCBIR038` invalid identity or references, and `PCBIR039`
an empty on-board region (error for waypoints, warning for keepouts and zones).
`PCBIR040` identifies a proven physical keepout violation and `PCBIR041`
incomplete keepout coverage. Existing declaration-property diagnostics retain
their codes.
