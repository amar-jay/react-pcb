# Physical footprint contract

Phase one introduces board-independent, explicit physical geometry. The layout engine and SVG projection are later phases.

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

These checks establish deterministic geometry and reference semantics. Land-pattern verification, manufacturing profiles, mask/paste offsets, general shape intersection checks, SVG output, and CSS layout are subsequent work.
