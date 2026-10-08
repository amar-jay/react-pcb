# Physical footprint contract

Phase one introduces board-independent, explicit physical geometry. Phase two adds deterministic SVG projection; layout authoring remains a later phase.

## Authoring

```ts
import {definePhysicalFootprint, compileFootprint, footprintLayer} from '@react-pcb/core';

const declaration = definePhysicalFootprint({
  key: 'example:pad',
  features: [{
    id: '1',
    purpose: 'pad',
    at: ['0mm', '0mm'],
    shape: {kind: 'rounded-rect', size: ['0.6mm', '0.7mm'], radius: '0.1mm'},
    layers: [footprintLayer.frontCopper, footprintLayer.frontMask, footprintLayer.frontPaste],
  }],
});

const physical = await compileFootprint(declaration);
```

`compileFootprint` invokes `pcbir footprint` and needs no board, component, or React tree. Both the declaration and compiled definition can be passed as a placed part's `footprint`. Rust validates physical input even when callers bypass the TypeScript helpers.

## Precision and coordinates

Lengths accept decimal strings ending in `nm`, `um`, `mm`, `mil`, or `in`. Rust parses them using checked integer arithmetic. One mil is exactly 25,400 nm; one inch is exactly 25,400,000 nm. Exponents, implicit units, non-finite values, overflow, and sub-nanometre lengths are rejected. No rounding is performed.

Canonical feature coordinates and dimensions are integer nanometres within JavaScript's exact integer range. Bounds store doubled nanometres (`min2`, `max2`) to preserve the half-nanometre edges of odd-width shapes. Bounds must also fit the exact integer range; this imposes a tighter practical limit than feature centers alone.

Feature `at` is its center in footprint-local coordinates. The origin is explicitly selected by the author. Positive x points right and positive y points down; positive rotation is clockwise. Quarter turns (0, 90, 180, 270 degrees) are supported. Back placement reflects local x, then applies board rotation, then translates. Arbitrary-angle physical placement is rejected until a quantization policy exists.

## Geometry and meaning

Shapes are rectangles, rounded rectangles, circles, and ovals. Features have stable local IDs and explicit purposes: pads, plated/non-plated holes, copper, mask openings, paste openings, silkscreen, courtyard, and fabrication graphics. Drills retain diameter and plating separately from copper geometry. Documentation outlines can have an explicit physical stroke width; omitted stroke means filled geometry.

IDs remain unchanged when features move or reorder. References to a feature must include its owning footprint or placed-part ID. A footprint's key is independent of its component and geometry.

Layer roles describe footprint-relative front/back copper, mask, paste, silkscreen, courtyard, fabrication, all copper, and all mask. Resolution uses the board's declared layer kinds, sides, and purposes, never ID spelling. Missing or ambiguous technical roles and overlapping role targets are errors. Copper sides use the stackup's first/last copper layers. All-copper/all-mask target their whole sets. Inner copper is not reversed by semantic role resolution because the initial vocabulary contains no individual inner-layer selector.

## Instances and compatibility

Board IR now emits `schemaVersion: 2`. Each resolved footprint optionally contains `physical`, and each part contains `physicalFeatures`. The physical footprint has its own `schemaVersion: 1` and `units: 'nm'`. These version namespaces are independent.

`physical` is authoritative exact geometry. The existing `pads` collection remains a compatibility index for logical-pin bindings and old consumers. Its numeric dimensions are a millimetre bounding-envelope projection; a rounded rectangle projects as a rectangle there. Manufacturing consumers must use `physical` to preserve its radius and additional features. Board coordinates and legacy footprints keep their existing numeric-unit convention during this transition.

Explicitly placed physical parts receive `physicalFeatures`, keyed by local feature ID, with exact world geometry and concrete layer IDs. Unplaced parts have an empty world-geometry map; their semantic layer references are still checked. Front/back instances never mutate or copy changes back into the reusable definition.

Existing `defineFootprint` calls remain supported. They retain their original geometry and board-bound IDs; they are not silently converted into reusable role-based definitions. Rust's `physical::migrate_footprint` converts a resolved legacy footprint only when the caller provides its original length unit and an explicit map from layer IDs to semantic roles. Migration preserves keys and feature IDs and rejects unsupported precision/rotations. Unresolved footprints need geometry before migration. Schema-one board JSON can still deserialize using default values for the new optional footprint field and instance map; callers must explicitly update the board schema version before publishing a schema-two document.

TypeScript callers can use `migrateFootprint(legacy, 'mm', {'old-top': 'front-copper'})`. The CLI exposes the same adapter as `pcbir migrate-footprint`, accepting `{footprint, units, layerRoles}`. Every old board-layer target requires a role mapping; the all-copper selector carries its meaning directly.

These checks establish deterministic geometry and reference semantics. Land-pattern verification, manufacturing profiles, mask/paste offsets, general shape intersection checks and CSS layout are subsequent work.

## SVG projection and inspection

`footprintSvg(compiledFootprint, options?)` projects a validated canonical physical footprint to a standalone SVG string. It needs no board, component, or React tree. The CLI accepts compiled JSON:

```sh
cargo run --quiet -p pcbir -- footprint < declaration.json > footprint.json
cargo run --quiet -p pcbir -- footprint-svg < footprint.json > footprint.svg
bun run footprints:inspect /tmp/react-pcb-footprints
```

Open the generated `index.html` in a browser to toggle semantic layers independently, or open the individual SVG files. The checked-in inspection source generates a passive and a through-hole header, including separate mask/paste openings, plated drills, a mounting hole, and documentation strokes. Their dimensions are illustrative.

### Projection contract

- One SVG user unit is **half a nanometre**. The `viewBox` is `min2.x min2.y (max2.x-min2.x) (max2.y-min2.y)`, using the canonical bounds including documentation strokes. There is no added margin, origin shift, or geometric rounding.
- Root `width` and `height` have `mm` suffixes, calculated exactly from doubled nanometres. Decimal formatting uses at most seven fractional digits, no exponent, no unnecessary trailing zeros, and no negative zero. Coordinates and sizes in the SVG are integers. Projection arithmetic uses wider integers so differences between valid bounds cannot overflow.
- Local x points right, y points down; local clockwise quarter-turn rotation is applied about the shape center, then the shape is translated to its feature position. Rectangles and rounded rectangles retain dimensions/radii. Ovals are capsules with radius half the smaller dimension, rather than ellipses. Circles retain exact diameters. Stroke widths scale with the geometry.
- Semantic role groups appear in lexicographic role-name order. Features within each group appear in UTF-8 byte order of their stable IDs. A feature targeting several roles emits one element per role. All-copper and all-mask remain semantic groups without inventing board layers. Groups with no features are omitted.
- Each projected element has a collision-free XML `id` formed as `f-<hex footprint key>-<hex role>-<hex feature ID>`, using lowercase hex UTF-8 bytes. `data-feature-id` preserves the source local ID; root `data-footprint-key` identifies its owner. `data-purpose` preserves feature purpose. Semantic groups use `layer-<role>` IDs and `data-layer` attributes.
- Drills appear once per source feature, in a final `drills` group (`data-layer="drill"`), sorted by feature ID. Their circles encode exact center and radius, source ID, `data-purpose="drill"`, and `data-plated`. Dedicated hole features emit drill elements even though they have no semantic layers. Pad drills are independent of the pad's copper/mask/paste projections.
- Mask/paste openings have explicit elements in their respective groups. Layer colors and dark drill fills are inspection styling; they do not define manufacturing meaning or subtract material from canonical shapes. Later groups can cover earlier ones in the composite preview; use the inspection page's layer toggles to see each layer independently.
- XML text/attributes escape ampersands, angle brackets, both quotes, and attribute whitespace. Invalid XML control characters in keys/IDs fail with `PCBSVG001`. No IDs are interpolated into executable markup.
- UTF-8 output uses LF newlines, fixed attribute order, and one final newline. Repeated compilation of the same declaration and repeated projection yield identical bytes. Projection also ignores feature and role input ordering. Canonical IR itself retains declared feature order.

SVG generation validates the supplied canonical footprint, including its stored bounds, and never mutates it. SVG is a derived inspection artifact rather than a field in physical IR; consumers must retain typed geometry for manufacturing. Neither physical nor board schema versions change in Phase two.
