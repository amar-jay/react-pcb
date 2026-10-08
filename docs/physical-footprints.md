# Physical footprint contract

Phase one introduces board-independent, explicit physical geometry. Phase two adds deterministic SVG projection. Phase three adds absolute-positioned JSX authoring; Flexbox and Grid remain later phases.

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

Shapes are rectangles, rounded rectangles, circles, and ovals. Features have stable local IDs and explicit purposes: pads, plated/non-plated holes, copper, mask openings, paste openings, silkscreen, courtyard, and fabrication graphics. Drills retain diameter, optional capsule slot dimensions, and plating separately from copper geometry. Documentation outlines can have an explicit physical stroke width; omitted stroke means filled geometry.

IDs remain unchanged when features move or reorder. References to a feature must include its owning footprint or placed-part ID. A footprint's key is independent of its component and geometry.

Layer roles describe footprint-relative front/back copper, mask, paste, silkscreen, courtyard, fabrication, all copper, and all mask. Resolution uses the board's declared layer kinds, sides, and purposes, never ID spelling. Missing or ambiguous technical roles and overlapping role targets are errors. Copper sides use the stackup's first/last copper layers. All-copper/all-mask target their whole sets. Inner copper is not reversed by semantic role resolution because the initial vocabulary contains no individual inner-layer selector.

## Instances and compatibility

Board IR now emits `schemaVersion: 2`. Each resolved footprint optionally contains `physical`, and each part contains `physicalFeatures`. The physical footprint now has its own `schemaVersion: 2` and `units: 'nm'`. Version-one round-drill physical footprints remain readable; slots require version two. These version namespaces are independent.

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
- Drills appear once per source feature, in a final `drills` group (`data-layer="drill"`), sorted by feature ID. Round drills encode exact center and radius; slotted drills encode capsule dimensions and the feature rotation. Both retain source ID, `data-purpose="drill"`, and `data-plated`. Dedicated hole features emit drill elements even though they have no semantic layers. Pad drills are independent of the pad's copper/mask/paste projections.
- Mask/paste openings have explicit elements in their respective groups. Layer colors and dark drill fills are inspection styling; they do not define manufacturing meaning or subtract material from canonical shapes. Later groups can cover earlier ones in the composite preview; use the inspection page's layer toggles to see each layer independently.
- XML text/attributes escape ampersands, angle brackets, both quotes, and attribute whitespace. Invalid XML control characters in keys/IDs fail with `PCBSVG001`. No IDs are interpolated into executable markup.
- UTF-8 output uses LF newlines, fixed attribute order, and one final newline. Repeated compilation of the same declaration and repeated projection yield identical bytes. Projection also ignores feature and role input ordering. Canonical IR itself retains declared feature order.

SVG generation validates the supplied canonical footprint, including its stored bounds, and never mutates it. SVG is a derived inspection artifact rather than a field in physical IR; consumers must retain typed geometry for manufacturing. Neither physical nor board schema versions change in Phase two.

## Absolute-positioned JSX authoring

Phase three adds `Footprint`, `FootprintGroup`, `Pad`, `Hole`, and `Graphic`. They render serializable declarations through the existing React renderer; Rust alone parses units and resolves layout. The explicit-coordinate authoring API remains supported.

```tsx
import {Footprint, Pad, compileFootprint, footprintSvg, renderFootprintDeclarations} from '@react-pcb/core';

const element = <Footprint name="example:0402" style={{
  width: '1.6mm', height: '0.7mm', left: '-0.8mm', top: '-0.35mm',
}}>
  <Pad name="1" layers={['front-copper', 'front-mask', 'front-paste']}
    style={{position: 'absolute', width: '0.6mm', height: '0.7mm', left: '0mm', top: '0mm'}} />
  <Pad name="2" layers={['front-copper', 'front-mask', 'front-paste']}
    style={{position: 'absolute', width: '0.6mm', height: '0.7mm', right: '0mm', top: '0mm'}} />
</Footprint>;

const declarations = await renderFootprintDeclarations(element);
const footprint = await compileFootprint(declarations); // compileFootprint(element) also works
const svg = await footprintSvg(footprint);
```

The two pad centers are exactly `[-500000, 0]` and `[500000, 0]` nm. See `examples/footprints/0402.tsx` for a fixture using a layout group. `bun run footprints:inspect` includes its resolved SVG in the inspection page. `examples/basic.tsx` reuses this authored footprint for its decoupling capacitor: `renderFootprintDeclarations` snapshots the JSX, and board compilation resolves its layout, pin bindings, placement, and semantic layers.

### Layout contract

All declarations share one `FootprintStyle` model:

| Property | Contract |
| --- | --- |
| `width`, `height` | Required positive physical-unit strings on roots, groups, and features. |
| `position` | Required as `'absolute'` on children; optional on the root. No flow layout. |
| `left`, `right` | Exactly one horizontal offset per child. `right` computes `parent.width - right - width`. |
| `top`, `bottom` | Exactly one vertical offset per child. `bottom` computes `parent.height - bottom - height`. |
| Root `left`, `top` | Optional translation of the root's top-left corner from footprint origin; default zero. Root `right`/`bottom` are rejected. |
| `borderRadius` | Required physical length for `shape="rounded-rect"`; forbidden on other shapes and containers. Existing radius validation applies. |
| `transform` | Typed object with optional `translate: [x, y]`, `rotate: 0 \| 90 \| 180 \| 270`, `reflectX: boolean`, `reflectY: boolean`. CSS transform strings are rejected. |

Offsets position the **untransformed box's top-left corner** in the parent coordinate system. Negative offsets and geometry outside a container are permitted; containers do not clip children or contribute footprint bounds. Every container has fixed dimensions, so no sizing depends on children or paint. Width/height remain the feature's local dimensions after rotation.

Transforms reflect local axes around the box center, rotate clockwise around that center, then translate in parent coordinates. Ancestor transforms apply outside descendant transforms. Root transforms operate around the root box center. Reflection changes positions/orientations but does not swap semantic layer roles: board-side placement remains responsible for layer swapping. The currently supported symmetric primitives encode reflected shape orientation as an equivalent quarter-turn rotation, chosen from the transformed local positive x axis.

Lengths reuse the checked Rust parser (`nm`, `um`, `mm`, `mil`, `in`), without browser layout, floats, implicit units, or rounding. Layout uses doubled nanometres internally to preserve exact box centers during nested transforms. Resolved feature centers must be whole nanometres and fit the canonical exact integer range; half-nanometre centers are diagnosed rather than quantized. Odd feature dimensions remain supported when the composed transform produces an integer center. Bounds still preserve half-nanometre edges. Overflows and invalid canonical geometry are rejected before output.

Unsupported declarations, props, styles, transforms, nonphysical units, percentages, automatic/intrinsic sizing, Flexbox, Grid, and overdetermined or missing offsets produce actionable errors. Unknown properties are never treated as cosmetic CSS. Undefined optional TypeScript props are omitted during serialization; functions, symbols, bigints, and non-finite numbers are rejected by the frontend snapshot.

### Feature meaning and identity

- `Footprint.name` supplies the stable library key. Containers emit no manufacturing geometry and have no canonical IR entity.
- `Pad` defaults to a rectangular shape. Its `layers` must contain semantic pad roles including copper. Optional `drill={{diameter, plated}}` retains independent drill meaning.
- `Hole` requires `plated`, equal width/height, and emits a circular plated/non-plated hole with matching drill diameter. It has no layer targets.
- `Graphic` requires `purpose` and semantic `layers`. Supported purposes are copper, mask-opening, paste-opening, silkscreen, courtyard, and fabrication. `stroke` is a physical length and is limited to documentation graphics. Pads and holes use their dedicated declarations.
- `Pad` and `Graphic` support `rect` (default), `rounded-rect`, `circle` (equal dimensions), and `oval` shapes. All existing physical validation still applies.
- Feature `name`, when supplied, identifies a local feature within the whole footprint and becomes its stable canonical ID. It is independent of layout-group nesting; pad names such as `'1'` are convenient for pin maps. Names across pads, holes, and graphics must be unique.
- Anonymous features receive compiler IDs `feature/<FNV-1a-128 hash>` derived from named/keyed group ancestry, declaration type, graphic purpose, and frontend `sourceKey`. Geometry, style, and array positions never enter identity. Repeated anonymous features of the same kind require distinct React keys. Duplicate or colliding IDs are rejected. Unnamed/unkeyed group wrappers do not affect identity.
- Named/keyed groups must be unique within their group ancestry. JavaScript mapping and ordinary custom React components work through the existing renderer. React keys are identity hints and do not survive in canonical physical IR.

### Protocol and diagnostics

`renderFootprintDeclarations(element)` returns a JSON snapshot with `{protocolVersion: 1, kind: 'footprint-declarations', root: DeclarationNode}`. Host declaration types are `fp-footprint`, `fp-group`, `fp-pad`, `fp-hole`, and `fp-graphic`. Props retain physical-unit strings and styles; `sourceKey` retains frontend identity hints. The CLI `pcbir footprint` accepts this envelope or the existing explicit physical declaration. Rust's public `layout::compile_layout` accepts the same envelope. A serialized envelope can also be passed as a placed part's `footprint`; Rust resolves it before binding and placement. Compiled physical definitions continue to work with `Part` and `definePart`.

The layout protocol version is separate from physical schema version and board schema version 2. Phase three originally used physical version one; subsequent slotted-drill support emits physical version two while this layout protocol remains unchanged. Resolved physical IR contains shapes, coordinates, layers, and bounds; it contains no styles, JSX types, group wrappers, or source hints.

Layout failures use `PCBFP002`; unit and physical validation failures retain `PCBFP001`. Diagnostics identify `footprint-key/feature-ID` (or the footprint/group for container failures). Each declaration may provide `source={{file, line, column}}`; lines and columns are optional positive one-based integers. Diagnostics retain that information and `sourceKey` when available, falling back to enclosing declarations if necessary. Source metadata is optional and currently author-provided; the renderer does not infer file locations. The TypeScript diagnostic formatter prints file locations without requiring callers to parse messages.

## Slotted drills and the USB4105 land pattern

Physical schema version two adds optional `slot: [width, height]` to a drill. Lengths are physical-unit strings in authoring declarations and integer nanometres in canonical geometry. `diameter` must equal the smaller slot dimension; slot dimensions must differ, be positive, fit the feature envelope, and pass the existing precision limits. The capsule's axes are local to the containing feature and follow its placement rotation/reflection. `Pad` supports slots through `drill`; `Hole` remains the circular-hole convenience declaration. Documentation and manufacturer checks beyond these geometric envelope validations remain separate.

```tsx
<Pad name="SHELL1" shape="oval" layers={['all-copper', 'all-mask', 'front-paste']}
  style={{position: 'absolute', width: '1mm', height: '2.1mm', left: '0mm', top: '0mm'}}
  drill={{diameter: '0.6mm', slot: ['0.6mm', '1.7mm'], plated: true}} />
```

New explicit declarations, JSX compilations and migration of numeric legacy geometry emit physical schema version two. Existing compiled physical version-one definitions without slots remain accepted and can pass through migration unchanged. Version-one authoring declarations still accept circular drills and normalize to version two; a version-one declaration or canonical definition containing a slot is rejected. The board schema remains version two because the independently versioned `physical` definition is authoritative; consumers must validate that nested version. Compatibility pad drills also retain optional millimetre slot dimensions. SVG renders slots as independent capsule drill elements rather than approximating them with circles.

[USB4105 source and coordinate notes](footprints/USB4105.md) document the GCT B4 land pattern, official KiCad cross-check, merged contact lands, mounting slots, and locating holes. Its authored footprint is integrated into the USB4105-GF-A component and `examples/basic.tsx`; the inspection page includes its layer-separated SVG.

The MCU now uses the authored [LQFP48 land pattern](footprints/LQFP48.md), with all 48 physical pads following ST DS13560 Rev 6 Figure 44. Its logical pin definition remains explicitly partial. All footprints in `examples/basic.tsx` resolve to physical geometry; `bun run footprints:inspect` also includes the LQFP48 SVG.
