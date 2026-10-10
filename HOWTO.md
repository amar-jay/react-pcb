# How to create and debug a PCB with react-pcb

Use this guide from the repository root. It covers component selection, physical
footprints, connectivity, placement, process checks, and visual inspection by
humans or AI agents.

The current compiler produces normalized PCB IR, exact placed footprint geometry,
diagnostics, and inspection artifacts. `Route`, `DifferentialPair`, `Zone`, and
`Keepout` describe design intent. They do not yet synthesize routed traces, vias,
copper pours, impedance solutions, or Gerbers. A successful compile establishes
the checks described below, rather than a finished fabrication package.

Jump to the [runnable tutorial](#3-create-a-small-board),
[datasheet sources](#4-source-and-verify-each-footprint),
[diagnostics](#6-read-diagnostics-and-manufacturing-reports), or
[PNG debugging](#8-debug-with-pngs-including-ai-review).

## 1. Set up and inspect an existing board

Install the Bun version recorded in [.bun-version](.bun-version) and a stable
Rust toolchain with `rustfmt` and `clippy`. Bun executes the TypeScript/JSX frontend;
Cargo runs the authoritative geometry and IR compiler.

```sh
bun install --frozen-lockfile
bun run check

# Browser preview; open the printed localhost URL.
bun run preview dev examples/basic/board.tsx

# Canonical JSON, footprint SVGs, reports, and a small static index.
bun run preview inspect examples/basic/board.tsx --out dist/basic-inspect

# Two images of the same compiled board.
bun run preview png examples/basic/board.tsx --view both --out dist/basic.png
```

The last command produces `dist/basic.board.png` and `dist/basic.analysis.png`.
`preview` is the workspace CLI installed by Bun. Run `bun run preview --help`
for its accepted commands. The root `board:dev`, `board:build`, and
`board:inspect` scripts are aliases for the corresponding preview commands.

Start with [the basic board](examples/basic/board.tsx). The
[ESC example](examples/esc/README.md) demonstrates more packages, source records,
and reusable modules; it is a footprint study with documented electrical gaps.

## 2. Plan the circuit and its evidence

Before placing components, record:

- Board dimensions, connector positions, mechanical restrictions, and mounting.
- Supply voltages, expected currents, interfaces, signal directions, and grounding.
- Exact manufacturer/MPN/package selections and every required pin connection.
- Decoupling, reset/debug, protection, biasing, and external connections required
  by the selected devices. Keep unresolved electrical questions visible.
- Proposed stackup and the fabrication/assembly process limits to validate.

Keep electrical definitions, reusable footprints, and placed instances separate:

| Declaration | Responsibility |
| --- | --- |
| `definePart(...)` | Manufacturer, MPN, datasheet, logical pins, and pin-to-pad binding. |
| `Footprint` / `definePhysicalFootprint(...)` | Local copper, drills, mask/paste openings, body documentation, and courtyards. |
| A placed part component / `Part` | Stable instance identity, position, side, rotation, and net connections. |
| `Board` | Outline, stackup, technical layers, metadata, and optional manufacturing policy. |
| Route/zone/keepout declarations | Requirements retained for downstream physical realization. |

Build incrementally: establish one physical part, inspect its definition and
binding, then add parts and constraints in small groups. Compilation cannot find
an omitted circuit block or a pin mapping that is structurally valid but wrong
according to the datasheet.

## 3. Create a small board

The following four files form a runnable starting point: two selected capacitors
on a two-layer board, explicit openings and courtyards, and one route constraint.
They demonstrate the authoring workflow without claiming a complete circuit.

```sh
mkdir -p examples/my-board/footprints examples/my-board/parts
```

### `examples/my-board/layers.ts`

Stackup order runs from front to back. Explicit IDs preserve layer identity when
other layers are added. Footprints use semantic roles; the board resolves those
roles to these concrete layer IDs.

```ts
import {
  copperLayer, defineLayerSet, defineStackup, dielectricLayer,
  mechanicalLayer, pasteLayer, silkscreenLayer, solderMaskLayer,
} from "@react-pcb/core";

export const frontCopper = copperLayer({
  id: "copper/front", thickness: 0.035, usage: "signal",
});
export const backCopper = copperLayer({
  id: "copper/back", thickness: 0.035, usage: "signal",
});

export const boardLayers = defineLayerSet({
  stackup: defineStackup([
    frontCopper,
    dielectricLayer({
      id: "dielectric/core", material: "FR-4", thickness: 1.53, epsilonR: 4.2,
    }),
    backCopper,
  ]),
  technical: (["front", "back"] as const).flatMap((side) => [
    solderMaskLayer({ id: `mask/${side}`, side }),
    pasteLayer({ id: `paste/${side}`, side }),
    silkscreenLayer({ id: `silk/${side}`, side }),
    mechanicalLayer({ id: `fabrication/${side}`, purpose: "fabrication", side }),
    mechanicalLayer({ id: `courtyard/${side}`, purpose: "courtyard", side }),
  ]),
});
```

These thicknesses and dielectric properties are tutorial inputs. Replace them
with the intended stackup. A layer's ID is an identity; its kind, side, usage,
and stackup position establish physical meaning.

### `examples/my-board/footprints/GRM155.tsx`

This land pattern uses a 0.40 mm gap and 0.40 × 0.50 mm copper lands, centered
at x = ±0.40 mm. They follow the selected GRM15 reflow ranges in the
[Murata reference sheet, page 27, Table 2](https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM155R71H104KE14-01A.pdf),
also used by [the existing capacitor footprint](examples/esc/footprints/passives.tsx).
The 0.05 mm mask expansion, 0.05 mm paste inset, fabrication outline, and
courtyard are authored choices. Evaluate them against the actual assembly process
and package tolerances.

```tsx
import { Footprint, Graphic, Pad } from "@react-pcb/core";
import { Fragment } from "react";

const lands = [
  { name: "1", left: "0.4mm", mask: "0.35mm", paste: "0.45mm" },
  { name: "2", left: "1.2mm", mask: "1.15mm", paste: "1.25mm" },
] as const;

export function GRM155Footprint() {
  return (
    <Footprint
      name="my-board:grm155-reflow"
      source={{ file: "examples/my-board/footprints/GRM155.tsx" }}
      style={{ width: "2mm", height: "1.2mm", left: "-1mm", top: "-0.6mm" }}
    >
      {lands.map((land) => (
        <Fragment key={land.name}>
          <Pad
            name={land.name}
            layers={["front-copper"]}
            style={{ position: "absolute", width: "0.4mm", height: "0.5mm",
              left: land.left, top: "0.35mm" }}
          />
          <Graphic
            name={`mask-${land.name}`} purpose="mask-opening" layers={["front-mask"]}
            style={{ position: "absolute", width: "0.5mm", height: "0.6mm",
              left: land.mask, top: "0.3mm" }}
          />
          <Graphic
            name={`paste-${land.name}`} purpose="paste-opening" layers={["front-paste"]}
            style={{ position: "absolute", width: "0.3mm", height: "0.4mm",
              left: land.paste, top: "0.4mm" }}
          />
        </Fragment>
      ))}
      <Graphic
        name="body" purpose="fabrication" layers={["front-fabrication"]} stroke="0.05mm"
        style={{ position: "absolute", width: "1mm", height: "0.5mm",
          left: "0.5mm", top: "0.35mm" }}
      />
      <Graphic
        name="courtyard" purpose="courtyard" layers={["front-courtyard"]} stroke="0.05mm"
        style={{ position: "absolute", width: "1.9mm", height: "1.2mm",
          left: "0.05mm", top: "0mm" }}
      />
    </Footprint>
  );
}
```

JSX offsets position a box's **top-left corner** relative to its parent. The
root offset above puts the component origin at the body center. In the alternative
`definePhysicalFootprint(...)` API, a feature's `at` is its **center**; translate
between these conventions deliberately.

### `examples/my-board/parts/Capacitor.tsx`

Keep the selected electrical component and its source evidence separate from
the reusable land pattern. `renderFootprintDeclarations` snapshots JSX intent;
Rust resolves its physical layout during board compilation.

```tsx
import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import { GRM155Footprint } from "../footprints/GRM155.tsx";

const footprint = await renderFootprintDeclarations(<GRM155Footprint />);

export const Capacitor = definePart(
  {
    manufacturer: "Murata Manufacturing",
    mpn: "GRM155R71H104KE14D",
    package: "0402 imperial / 1005 metric, 100 nF, 50 V, X7R",
    datasheet: {
      url: "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM155R71H104KE14-01A.pdf",
      document: "GRM155R71H104KE14-01A",
      page: 27,
    },
    pinoutCoverage: "complete",
    pins: {
      "1": { electricalType: "passive", required: true },
      "2": { electricalType: "passive", required: true },
    },
  },
  { footprint, pinMap: { "1": "1", "2": "2" } },
);
```

The keys of `connect` and `pad(part, name)` are **logical pin names**. `pinMap`
maps those names to physical pad IDs. One logical pin may map to several pads:
`GND: ["A1/B12", "B1/A12"]`, for example. Every referenced pad must exist, and a
physical pad cannot be mapped twice.

Use `pinoutCoverage: "complete"` when the whole package pinout is modeled and
mapped. Use `"partial"` for an explicitly incomplete definition, and document
what remains. `required: true` enforces connection presence; `electricalType`
records intent and does not establish complete electrical-rule checking.

### `examples/my-board/board.tsx`

```tsx
import {
  Board, compile, formatDiagnostic, pad, PcbCompileError, rect,
  Route, useNet, usePart, type ManufacturingProfileInput,
} from "@react-pcb/core";
import { boardLayers } from "./layers.ts";
import { Capacitor } from "./parts/Capacitor.tsx";

// Tutorial limits; replace with documented limits for your intended process.
export const manufacturingProfile: ManufacturingProfileInput = {
  schemaVersion: 1, key: "my-board:tutorial-process",
  minCopperFeature: "0.15mm", minCopperSpacing: "0.15mm",
  minDrillDiameter: "0.3mm", minAnnularRing: "0.15mm",
  minMaskExpansion: "0.05mm", minMaskWeb: "0.1mm",
  minPasteFeature: "0.1mm", minCourtyardClearance: "0.2mm",
};

export default function MyBoard() {
  const supply = useNet("3V3");
  const ground = useNet("GND");
  const c1 = usePart("C1");
  const c2 = usePart("C2");

  return (
    <Board units="mm" outline={rect(0, 0, 30, 20)} layers={boardLayers}
      manufacturingProfile={manufacturingProfile}
      metadata={{ title: "My first board", revision: "0.1" }}>
      <Capacitor id={c1} at={[8, 8]} connect={{ "1": supply, "2": ground }} />
      <Capacitor id={c2} at={[12, 8]} connect={{ "1": supply, "2": ground }} />
      <Route net={supply} from={pad(c1, "1")} to={pad(c2, "1")} width={0.2} />
    </Board>
  );
}

// Importing the board for preview must not run the CLI or exit the process.
if (import.meta.main) {
  try {
    const result = await compile(<MyBoard />, { cwd: process.cwd(), hideWarnings: true });
    for (const diagnostic of result.diagnostics) console.error(formatDiagnostic(diagnostic));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (!(error instanceof PcbCompileError)) throw error;
    for (const diagnostic of [...error.diagnostics, error.diagnostic]) {
      console.error(formatDiagnostic(diagnostic));
    }
    process.exitCode = 1;
  }
}
```

Preview entries default-export a synchronous component or a JSX element.
Top-level imports may prepare footprint declarations asynchronously; the board
component itself must remain synchronous. Executable code belongs behind
`import.meta.main`. Run the compilation command below from the repository root
so the example's `process.cwd()` points Cargo at this workspace.

```sh
mkdir -p dist/my-board
bun run examples/my-board/board.tsx > dist/my-board/compile.json
bun run preview inspect examples/my-board/board.tsx --out dist/my-board/inspect
bun run preview png examples/my-board/board.tsx --view both --out dist/my-board/board.png
bun run preview dev examples/my-board/board.tsx
```

Selected rules should pass. Some warnings about unverified manufacturing coverage
are expected: they describe checks the compiler does not implement.

## 4. Source and verify each footprint

For each purchased component, record the exact orderable MPN and package variant,
manufacturer URL, document identifier, revision/date when known, printed page
and figure/table, coordinate origin, and component-side viewing convention.
Save a permitted local copy or a document checksum when reproducible review
requires it. Keep source notes beside the footprint, for example in
`footprints/README.md`; the electrical `datasheet` object supports one source,
so additional package drawings, application notes, and assembly choices belong
in those notes.

Use separate evidence for the pinout, package outline, recommended copper land
pattern, and stencil. A body outline alone does not specify solder lands. Record
which dimensions are manufacturer recommendations and which are process choices.
Do not infer geometry from an MPN, a generic package label, or a rendered image.
Document inaccessible sources and fallback references explicitly.

Examples already in the repository:

| Package / component | Relevant source | Implementation / notes |
| --- | --- | --- |
| STM32G0B1CBT6, LQFP48 | [ST DS13560](https://www.st.com/resource/en/datasheet/stm32g0b1cb.pdf): pinout, package outline, Figure 44 land pattern (Rev 6, p. 136). | [LQFP48 source notes](docs/footprints/LQFP48.md), [footprint](examples/basic/footprints/LQFP48.tsx). |
| USB4105-GF-A | [GCT drawing](https://gct.co/files/drawings/usb4105.pdf) and [product page](https://gct.co/connector/usb4105): contact numbering, mounting slots, locating holes, and lands. | [USB4105 source notes](docs/footprints/USB4105.md), [complete pin binding](examples/basic/parts/USB4105GFA.ts). |
| IR2101STRPBF, SOIC8 | [Infineon IR2101 datasheet](https://www.infineon.com/assets/row/public/documents/24/49/infineon-ir2101-ds-en.pdf): lead assignments and package/footprint drawings. | [SOIC8 footprint](examples/esc/footprints/SOIC8.tsx). |
| PSMN2R8-40YSB, LFPAK56 | [Nexperia device datasheet](https://assets.nexperia.com/documents/data-sheet/PSMN2R8-40YSB.pdf) for pinning; [SOT669 package information](https://assets.nexperia.com/documents/package-information/SOT669.pdf) for lands and stencil. | [LFPAK56 footprint](examples/esc/footprints/LFPAK56.tsx). |
| Murata GRM155R71H104KE14D | [Manufacturer reference sheet](https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM155R71H104KE14-01A.pdf): dimensions and reflow land ranges. | [Capacitor footprint and source notes](examples/esc/README.md#sources-and-component-selection). |
| Vishay WSL2512R0100FEA | [Vishay document 30100](https://www.vishay.com/docs/30100/wsl.pdf): use the land dimensions for the selected resistance range. | [Passive footprints](examples/esc/footprints/passives.tsx), [coordinate notes](examples/esc/README.md#coordinates-and-lands). |

The ESC source notes also identify a capacitor using a general series table and
an XT30UPB connector checked against a library reference because its manufacturer
drawing was inaccessible. Preserve those evidence gaps when reusing them. Board-owned
solder terminals need authored geometry and rationale, without an invented MPN
or datasheet.

Check pin 1, polarity, exposed pads, duplicated contacts, shell stakes, and
non-electrical holes individually. For multi-pad terminals such as a MOSFET drain,
verify both the physical geometry and the many-pad logical binding. Package
variants with similar names can have different holes, numbering, or orientation.

## 5. Author geometry and preserve identity

- Board numeric lengths use `Board.units` (`mm` by default; also `mil` and `in`).
  Footprint and process-profile lengths use explicit `nm`, `um`, `mm`, `mil`, or
  `in` strings. Physical geometry is normalized to integer nanometres.
- Local +x is right and +y is down; positive rotation is clockwise. Physical
  placement supports 0, 90, 180, and 270 degrees. A back-side placement reflects
  local x, applies rotation, then translates, and resolves layers for that side.
  Author a component-side footprint once; avoid an extra manual mirroring step.
- `Footprint.style` describes fixed physical layout. It is not browser CSS:
  percentages, `px`, auto sizing, arbitrary rotation, and unsupported layout
  properties produce diagnostics. Fixed Flexbox and Grid are supported under
  the [layout contract](docs/physical-footprints.md); Grid requires explicit
  physical tracks and one-based cell assignments.
- Rectangles, rounded rectangles, circles, and capsule-shaped ovals are supported.
  General polygon/path geometry is not currently an authoring primitive. Document
  any approximation instead of silently replacing an unsupported shape.
- Give footprints stable keys and features stable, unique local names. Mapped pads
  retain the package's real pad IDs. Repeated anonymous declarations need stable
  React keys; array indexes are unsuitable when items can be reordered.
- `usePart("C1")` and `useNet("GND")` derive scoped identities. Inside a
  `Module`, locally declared nets and parts belong to that module. Pass the same
  parent net into multiple modules to connect them, or use an intentional
  `globalNet`. Matching display names across scopes do not establish connectivity.

Copper, mask, and paste are separate physical meanings. Adding a mask/paste role
to a pad implies an opening with the same shape as its copper. For expanded mask
or reduced/windowed paste, author separate openings as in the tutorial. Board
mask `expansion` metadata does not resize these features; a manufacturing profile
validates geometry rather than generating it.

For plated holes, declare actual pad copper plus
`drill={{ diameter: "...mm", plated: true }}` and appropriate roles such as
`all-copper` and `all-mask`. A slot additionally supplies
`slot: [width, height]`; its `diameter` equals the smaller dimension. A standalone
`Hole` has no associated pad copper. Declare opposite-side courtyard reservations
when needed; through-hole copper alone does not provide a package body there.

Use `<Part footprint={physicalDefinition} pinMap={...} ... />` for board-owned
features or generic parts when appropriate. A string such as `footprint="0402"`
does not load a library footprint: unresolved geometry stays unresolved and cannot
be fully displayed or checked.

For reusable circuit blocks, use a named `Module` and ordinary components taking
net props. Add `RouteThrough`, `DifferentialPair`, `Zone`, and `Keepout` when the
electrical/mechanical intent is known. Their constraints remain independent of
resolved copper; a zone declaration does not establish a realized ground plane.

## 6. Read diagnostics and manufacturing reports

Treat three checks separately: TypeScript/API correctness, compiler structure
and references, and selected process-rule geometry. Run `bunx tsc --noEmit` for
types and compile the board for the latter two. TypeScript alone cannot validate
the resolved physical layout.

`CompilerDiagnostic` contains `code`, `severity`, `message`, `entity`, and optional
`help` and `source`. Read stable entity IDs and the help text before changing
geometry. `formatDiagnostic(...)` formats it for people. The tutorial runner
prints JSON to stdout, diagnostics to stderr, and exits unsuccessfully on failure.
`hideWarnings: true` suppresses automatic warning printing, while the returned
diagnostic data remains available and is printed explicitly by that runner.

On `PcbCompileError`, inspect **both** `error.diagnostics` and `error.diagnostic`:
the former preserves additional findings, including warnings before the fatal
error. Syntax/import errors and errors raised while evaluating author code can be
ordinary errors, rather than structured compiler diagnostics.

| Diagnostic | First things to inspect |
| --- | --- |
| `PCBCLI001` / `PCBCLI002` | Cargo invocation, working directory, compiler output, or compiler/IR version compatibility. |
| `PCBFP001` | Exact dimensions, units, rotations, shape/drill validity, semantic layers, and canonical geometry consistency. |
| `PCBFP002` | JSX layout: missing or conflicting offsets, unsupported style properties, overflowing flow boxes, or feature identity. |
| `PCBIR006` / `PCBIR023` | Duplicate instance IDs or conflicting definitions claiming one footprint key. |
| `PCBIR024` | A named footprint has no resolved physical geometry. Supply its definition. |
| `PCBIR026` | Missing pin-to-pad mapping, an unknown logical pin, or a referenced physical pad that does not exist. |
| `PCBIR031` | A placed physical feature extends outside the board outline. Inspect the named part/features, placement, rotation, board units, and outline dimensions. |
| `PCBIR002`–`PCBIR005` | Route endpoints: unknown part/pin, mismatched net, or unconnected pin. |
| `PCBMFG001` | Invalid manufacturing policy or malformed validator input. |
| `PCBMFG002` | A selected manufacturing check failed; identify the check and implicated part/feature IDs. |
| `PCBMFG003` | Unavailable or skipped coverage; read the reason and determine the remaining verification. |
| `PCBPREVIEW001` / `PCBPREVIEW002` | Invalid projection input or unavailable/unplaced physical geometry. |

Required-pin errors can also be raised directly by `definePart` before reaching
Rust. Verify logical pin spelling, required connections, and `pinMap` together.
Find an implicated entity in `board.json` or the inspector, then follow its
definition key to the source. JSX source locations are optional, author-provided
`source` metadata; automatic file/line inference is not implemented.

To exercise a real failure in the tutorial, temporarily move C2 from `[12, 8]`
to `[8.5, 8]`. Compilation rejects it with `PCBMFG002` findings for overlapping
front-side courtyards and insufficient copper spacing between C1's pad `2` and
C2's pad `1`. Both failures are collected. PNG generation also rejects that
revision and preserves previous images. Restore `[12, 8]` and regenerate to
confirm recovery; do not treat the preserved image as a render of the failed board.

### What a manufacturing profile establishes

`Board.manufacturingProfile` validates each unique physical footprint and the
placed board. Selected failures reject compilation. Without a profile, structural
validation still runs, but manufacturing reports are absent; the inspection
command does not choose or relax a profile for you.

Read `result.manufacturingReports` and `result.boardManufacturingReport`:

- Footprint checks cover selected copper dimensions/spacing, drill diameter,
  annular containment, mask expansion/web, paste containment/size, and courtyard
  enclosure. Their copper spacing is conservative and net-independent.
- Board checks cover placed copper separation on shared concrete layers and
  declared inter-part courtyard overlap on each physical side. Same established
  pad-net IDs exempt board copper spacing; a matching net display name does not.
- `checks[].status` distinguishes `passed`, `failed`, `partial`, `skipped`, and
  `not-applicable`. Read `evaluated`, `skipped`, and per-check diagnostics.
- `conformsToCheckedRules` means no evaluated rule failed. `complete` remains
  `false`. Board-edge manufacturing clearances, realized routing/zones, comprehensive electrical rules,
  thermal behavior, 3D/mechanical clearance, and other coverage remain unverified.

Optional thresholds omitted from a profile are skipped, rather than implicitly
zero. Retain the actual profile and its source when reporting results. Fix the
geometry or document a justified policy change; reducing a threshold merely to
clear a failure changes what the result establishes.

To inspect a footprint's rule failures before enforcing them on the board, use
the standalone API with your actual profile:

```tsx
import { compileFootprint, validateFootprintManufacturing } from "@react-pcb/core";
import { GRM155Footprint } from "./footprints/GRM155.tsx";
import { manufacturingProfile } from "./board.tsx";

const physical = await compileFootprint(<GRM155Footprint />, { cwd: process.cwd() });
const report = await validateFootprintManufacturing(physical, manufacturingProfile);
console.log(JSON.stringify(report, null, 2));
if (!report.conformsToCheckedRules) process.exitCode = 1;
```

This snippet assumes a script beside the tutorial's `board.tsx`, executed from
the repository root. Valid geometry with rule violations returns a failed report;
malformed geometry/policy throws. `validateBoardManufacturing(ir, profile)` has
the equivalent report-oriented behavior for valid board IR. Neither validator
changes the geometry. See [manufacturing validation](docs/manufacturing-validation.md)
for coverage and exact threshold semantics.

## 7. Inspect the board and its footprints

```sh
bun run preview dev examples/my-board/board.tsx
bun run preview build examples/my-board/board.tsx --out dist/my-board/index.html
bun run preview inspect examples/my-board/board.tsx --out dist/my-board/inspect
```

Dev mode recompiles imported board/footprint changes. On a failed rebuild, the
last successful scene remains visible: click the bottom-bar failure icon to read
the **current** failure. A green compile indicator reflects compilation, not full
manufacturing coverage. Inspect Board checks and part details as well.

Use Board view for material appearance and Analysis view for contrast and feature
boundaries. Select front/back/copper/fabrication/all layer presets, inspect parts
and net membership, and use the ruler/distance tool for visual measurements.
Canonical numbers remain the reference for precise verification. Browser view and
layer choices persist per board filepath; CLI exports use explicit options and
their own defaults.

`build` exports one self-contained HTML viewer. `inspect` exports a small static
HTML index with linked artifacts; keep that directory together. Footprints are
derived from used board definitions, including unplaced instances. No separate
`inspect.ts` or manually maintained footprint list is needed.

| Inspection artifact | Use |
| --- | --- |
| `manifest.json` | Find footprint keys, stable part IDs, diagnostics, and relative artifact paths. |
| `board.json` | Canonical IR: definitions, instances, connections, layers, constraints, and resolved geometry. |
| `result.json` | Compile result with diagnostics and selected manufacturing reports. |
| `board.manufacturing.json` | Board report, or JSON `null` when no profile is selected. |
| `board.svg` | Full board in Analysis view, light theme, all layers. |
| `footprints/*` | Definition JSON, physical geometry JSON, component-side SVG, and manufacturing report for each used key. |

Footprint filenames are hashes of their keys; resolve them through the manifest.
Unresolved footprints have no invented geometry/SVG. Reports can be `null`.
Canonical coordinates are in nanometres and bounds `min2`/`max2` are doubled
nanometres; `(max2 - min2) / 2_000_000` gives a millimetre dimension. Inspection
SVGs convert exact geometry to millimetres for viewing. Raw `footprintSvg(...)`
uses half-nanometre SVG coordinates; see the [projection contract](docs/physical-footprints.md).

## 8. Debug with PNGs, including AI review

Generate images directly from the CLI; no browser, screenshot automation, or
preview server is needed. Rendering uses the same presentation as the canvas.

```sh
# Full context in both views, with every layer and region visible.
bun run preview png examples/my-board/board.tsx \
  --view both --layers all --theme light --width 4096 \
  --out dist/my-board/review.png

# Isolate copper from technical layers and overlays.
bun run preview png examples/my-board/board.tsx \
  --view analysis --layers copper --width 4096 \
  --out dist/my-board/copper.png

# Package documentation, courtyard reservations, references, and drills.
bun run preview png examples/my-board/board.tsx \
  --view analysis --layers fabrication --width 4096 \
  --out dist/my-board/fabrication.png

# Also supported: infer PNG export from a build output ending in .png.
bun run preview build examples/my-board/board.tsx \
  --out dist/my-board/front.png --view analysis --layers front
```

| Option | Accepted values / default |
| --- | --- |
| `--view` | `board`, `analysis`, `both`; default `board`. |
| `--layers` | `front`, `back`, `copper`, `fabrication`, `all`; default `all`. |
| `--theme` | `light`, `dark`; default `light`. |
| `--width` | Integer 1–8192 pixels; default 2048. Height follows the board aspect ratio; maximum 32 million pixels. |
| `--out` | PNG destination; `preview png` defaults to `dist/board.png`. With `both`, adds `.board` and `.analysis` before `.png`. |

Front/back presets show that side's copper and silkscreen, plus references and
drills; they omit mask, paste, fabrication, and courtyard. Copper omits overlays.
Fabrication omits copper and mask/paste. All includes constraint regions. Export
both front and back when reviewing opposite-side placements; all layers together
can hide the distinction between sides. The Back preset selects back-side layers
in the board's front-coordinate view; it does not flip the camera.

### A useful review loop

1. Compile and read diagnostics first. Confirm the command succeeded before using
   its outputs. A failed export preserves old files; their existence does not
   prove they represent the current source.
2. Generate Board + Analysis/all for context, then Copper and Fabrication to
   separate crowded features. Compare pin numbering, body placement, polarity,
   pad spacing, drill/slot locations, aperture outlines, courtyard reservations,
   and constraints against the source drawings.
3. Record suspected problems using stable part/feature IDs. Treat pixels as clues;
   read canonical geometry and reports to confirm dimensions, nets, sides, and
   exact collisions. Constraint regions are not courtyard geometry; courtyards
   are amber and constraints violet in Board view.
4. For a small or obscured package, inspect its standalone SVG and physical JSON.
   Increase PNG width within the limits when needed. The PNG CLI currently exports
   the whole board; it has no crop, zoom, or selected-net flags.
5. Make a focused source change, regenerate the affected artifacts, and compare
   using the same view, layers, theme, and width. Recompile rather than editing
   the generated image, SVG, JSON, or HTML.

For an agent handoff, include the source revision, entry filepath, export commands,
current diagnostics, `manifest.json`, `result.json`, relevant source documents,
and generated PNGs. Keep a distinct output directory per review iteration to avoid
confusing earlier exports with a failed rebuild. A small automated batch can use:

```sh
set -e
review_dir=dist/my-board/review-001
mkdir -p "$review_dir"
bun run preview inspect examples/my-board/board.tsx --out "$review_dir/inspect"
bun run preview png examples/my-board/board.tsx --view both --layers all --width 4096 \
  --out "$review_dir/context.png" > "$review_dir/paths.txt" 2> "$review_dir/diagnostics.log"
```

PNG stdout lists generated paths; stderr carries findings. Use a previously unused
review directory, check the exit status, and read the inspection result for the
full structured diagnostics. PNG findings are human-readable text, not a JSON
diagnostic stream. When compilation fails, fix source/import/structural failures
first, or use the standalone validators to inspect process-rule failures.

An example agent review request:

> Compare these Board and Analysis images with the attached pinout/land-pattern
> sources and inspection JSON. Identify suspected mapping, placement, aperture,
> and courtyard problems by stable part/feature ID. Confirm each finding against
> canonical numbers or the relevant source page. Separate confirmed problems,
> visual suspicions, and unverified coverage; do not infer routing or electrical
> completeness from the images.

## 9. Finish a review and keep checks reproducible

Run these after source changes:

```sh
bun run prettify
bun run check
bun run preview inspect examples/my-board/board.tsx --out dist/my-board/inspect
bun run preview png examples/my-board/board.tsx --view both --out dist/my-board/final.png
```

Add focused regression tests for new package geometry: independent expected pad
centers/dimensions, actual pin bindings, drill/slot dimensions, side/rotation
behavior, and important process boundaries. Preserve definition keys, part IDs,
and pad IDs when unrelated declarations are reordered or added.

Keep the final source revision, source-document references and evidence gaps,
selected process policy, diagnostics, canonical artifacts, and reviewed images
together. Record which checks passed and which were skipped. Further routing,
electrical/thermal/mechanical verification, and fabrication output generation
require capabilities beyond the current compiler.

For deeper contracts, see [physical footprints and layout](docs/physical-footprints.md),
[manufacturing validation](docs/manufacturing-validation.md),
[preview and exports](docs/board-preview.md), and
[the ESC's source and design notes](examples/esc/README.md).
