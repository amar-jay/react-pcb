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
| Uniform exact region precision, complete reference checks and off-board policy | Pending phase 2. Existing rectangle parsing checks finite values and positive dimensions. |
| Improved anonymous-declaration identity diagnostics | Pending phase 3. Use keys to distinguish repeated anonymous constraints. |
| Physical keepout enforcement and incomplete-coverage diagnostics | Pending phase 4. Scopes are retained but violations are not yet evaluated. |
| Route waypoint feasibility and realized traversal checks | Static feasibility is pending phase 5; realized traversal requires future routing geometry. |
| Zone overlays, region selection and full constraint inspection | Pending phase 6. Current preview draws keepouts and route waypoints as one overlay. |

The semantic rules below define how later validators must interpret this intent.
A successful compile today does not establish physical constraint satisfaction.

## Geometry and ownership

Regions have their own stable IDs and rectangular geometry; constraints refer to
those IDs. Coordinates use the board's declared units and global board coordinate
system. Modules namespace identities and do not transform coordinates.

Preserve region IDs across unrelated insertion, reordering and geometry edits.
Frontends may supply ordinary keys to distinguish repeated declarations; keys
are not canonical IR entities. Multiple waypoints in one route, multiple keepouts
in one scope, and multiple zones with the same net/layer anchor need distinct
keys. Ambiguous anonymous declarations are rejected instead of receiving IDs
derived from array positions or mutable coordinates.

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

## Zones, board intersections and feasibility

A zone declares its intended fill boundary, net, copper layers and clearance.
It does not create filled copper or establish electrical continuity. An overlapping
keepout may require a future fill engine to subtract forbidden areas; boundary
overlap alone is not proof of an invalid zone.

The pending region validator will preserve authored geometry and compute its
on-board intersection explicitly. Partially off-board regions are allowed;
stored geometry is not rewritten. Completely off-board keepouts and zones warn
because they have no on-board effect. A route waypoint with no positive-area
board intersection is an error.

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
schema 2 or current schema 3, validates scope, and does not mutate the API input.
Legacy documents containing schema-3 scope fields are rejected rather than
overwritten. Unsupported versions require a separate migration.

Migration does not compile declarations, move parts, synthesize routing, prove
physical connectivity or certify constraint satisfaction. The next validator
phases evaluate additional structure and available physical geometry.

`PCBIR035` identifies an invalid keepout scope. `PCBIR036` identifies incompatible
or malformed board IR at decoding/upgrade boundaries. Existing property and
geometry diagnostics retain their codes.
