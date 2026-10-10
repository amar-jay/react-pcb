# Board JSX preview

Export a board JSX entry to one offline `index.html`, or inspect it through a local
server that recompiles when the board, its imported footprints/components, or the
workspace compiler changes. Both modes use the same viewer and authoritative
compiled PCB IR.

The viewer, HTML export, entry worker, watch logic and local server live in the
[`@react-pcb/preview` workspace package](../packages/preview/README.md). It depends
on `@react-pcb/core`; core has no dependency on the preview package. Board authoring,
compilation and the Rust SVG projection remain in core.
The browser UI uses React, Tailwind CSS, shadcn layout and interaction primitives,
and controls from `@amarjay-ui`.
Bun bundles its HTML entry for development and for production export.

```sh
# Local preview; open the printed URL (default http://127.0.0.1:3000).
bun run board:dev examples/basic.tsx
bun run board:dev examples/basic.tsx --port 3100

# One self-contained file; open it directly in a browser.
bun run board:build examples/basic.tsx
bun run board:build examples/basic.tsx --out dist/board/index.html
```

The default export destination is `dist/index.html`. `--port 0` lets the OS choose
an available port. The server binds to localhost and stops on Ctrl+C. Static
exports include all scene data, styles and viewer code, with no CDN, browser-side
compiler, network dependency, or asset directory required.

`bun run preview:build` builds the React site shell into `dist/`. It can load board
data when hosted alongside the preview API. Use `board:build` to embed a particular
board in a file that opens directly in a browser. Both use Bun's standalone HTML
bundler, including local fonts.

## Board entry contract

Default-export a synchronous board component or a JSX element. The component can
use the existing net/part hooks and import physical footprints. It is evaluated
through the existing declaration renderer, not a browser React renderer.

```tsx
import React from 'react';
import {Board, Part, compile, net, part, rect} from '@react-pcb/core';
import {boardLayers} from './layers.ts';
import {capacitorFootprint} from './footprints.ts';

export default function MyBoard() {
  return <Board outline={rect(0, 0, 40, 30)} layers={boardLayers}>
    <Part id={part('C1')} at={[10, 10]} footprint={capacitorFootprint}
      connect={{1: net('3V3'), 2: net('GND')}} />
  </Board>;
}

// Optional executable behavior must be guarded, so importing the board is safe.
if (import.meta.main) {
  console.log(JSON.stringify(await compile(<MyBoard />), null, 2));
}
```

`examples/basic.tsx` follows this contract and continues to print the compiled board
when executed directly. An entry with no supported default export fails with a
specific message. Entry code runs in Bun with normal project imports; JSX/React
and package resolution use the project's existing setup. In this workspace, the
CLI invokes the compiler from the repository root even when the board is elsewhere
in the source tree. Programmatic callers can set `cwd` for another Rust workspace.

## Viewer

- Toggle concrete board copper and technical layers independently. IDs come from
  the board layer set; their spelling does not determine side or purpose. Front
  copper/front silkscreen, drills and references start visible. Inner/back copper
  and other technical layers start hidden.
- Layer controls are grouped into copper, technical front/back pairs, and overlays.
  Collapsible groups keep large layer sets manageable. The board overview shows
  dimensions, placement counts, and the ordered material stackup.
- Zoom with the buttons or wheel, drag to pan, and use **Fit board** to restore the
  current board/geometry bounds. Inspect a part by clicking it or selecting it from
  the list. The inspector shows placement, footprint, connections and manufacturing
  check coverage.
  Canvas rulers and cursor coordinates are in millimetres and follow pan, zoom,
  and resizing. Inspector values retain the board's declared units.
- Use the **Layers** and **Parts** navigation controls, search by reference,
  footprint, value, MPN, or manufacturer, and switch between light and dark themes.
  Collapse the design sidebar with its toggle or `Ctrl/Cmd+B`. It becomes a drawer
  on mobile. **Board overview** opens a details panel; selecting a part opens its
  inspection details. The panel docks beside the canvas on large screens and
  becomes a dismissible sheet on smaller screens. Focus the
  canvas to pan with arrow keys, zoom with `+`/`-`, or fit the board with `F`.
- Highlight a net from the selector or a part's connection list. Highlighting uses
  canonical logical-pin-to-pad bindings and connection IDs; it does not imply a
  routed trace.
- Show constraint regions as dashed outlines. They describe keepouts and routing
  corridors, not realized copper. Traces, vias, generated zones, placement synthesis
  and autorouting remain outside the current compiler's realization scope.
- Read compiler, manufacturing and preview diagnostics. Unplaced parts and
  footprints without canonical physical geometry stay listed with explicit
  warnings; the preview does not invent pad geometry for them.
  A selected board manufacturing profile checks placed copper spacing and
  same-side inter-part courtyard overlaps. The overview distinguishes board
  checks from the selected part's footprint checks. A failed build's findings
  replace the diagnostic list while its last successful scene stays visible.
  Click the red X in the bottom bar (**View compilation failure**) to open an
  alert dialog with blocking errors and optional full compiler output. Failures
  leave the dialog closed until requested. A successful rebuild closes it.
  **Diagnostics** opens a bottom sheet with All, Errors, and Warnings tabs;
  errors appear first. Dialogs support keyboard navigation and return focus
  to their opening control when dismissed.
- Save the compiled result as JSON or the full projection as SVG. The saved SVG
  contains every declared layer/overlay; viewer colors, visibility, highlighting and zoom
  are viewer state rather than changes to canonical geometry or the saved SVG.
  Both downloads are in the **Export** menu.

## Geometry and serialization

The new Rust `board_svg` projection consumes schema-two board IR. It verifies
stored placed features against the physical definition, instance transform and
board-layer bindings before drawing them. It reuses the footprint projection's
shape construction, escaping, decimal formatting and stable hex ID encoding.
Rounded rectangles, circles, capsule ovals, circular/slotted drills and documentation
strokes retain their physical meanings. SVG entity IDs separate concrete layer
and drill-overlay namespaces, so arbitrary board layer IDs cannot collide with
viewer overlays.

Board SVG user units are **millimetres**, serialized exactly from doubled
nanometres with up to seven decimal places. Very large raw nanometre SVG lengths
can exceed browser drawing limits even on ordinary boards; millimetre coordinates
keep practical board sizes renderable without changing canonical integer geometry.
Standalone footprint SVG retains its existing half-nanometre user-unit contract.
Board outline and constraint rectangles are converted from declared board units
with the checked physical parser. Values finer than one nanometre reject rather
than round. Browser pan/zoom uses floating-point view state solely for inspection.

The viewport includes the board outline and physical feature bounds, with a small
display margin. Features outside the outline are displayed without clipping or
moving them. This is not a board-edge clearance check. References and constraint
regions are inspection overlays. Front/back placements are shown together in a
front-coordinate view, using already-resolved world geometry and concrete layers.

The HTML embeds serialized data with escaped script delimiters and renders labels,
metadata and errors as text. Export does not change IR, geometry or entity IDs.
Manufacturing coverage retains the [existing scoped-report contract](manufacturing-validation.md);
the viewer does not add fabrication approval.

## Rebuilds and recovery

The server polls tracked inputs every 250 ms; the browser polls build status every
500 ms. Bun's bundler discovers static imports, including JSX footprint files and
editable workspace API source. Workspace configuration and Rust compiler source
are also tracked. Each compilation evaluates the board in a fresh subprocess,
so transitive modules and declaration-renderer state cannot remain cached between
builds. Rebuilds are serialized and rapid edits are coalesced; an input changed
during compilation schedules another build, including during initial startup.

Syntax, import, layout and compiler failures are displayed in the browser. The
last valid board stays visible and is marked as the last successful build. If the
first build fails, the server still runs and displays the error. Fixing the source
or creating a missing imported file triggers recovery. Layer choices, zoom, net
highlighting and selection survive successful updates where their IDs still exist.
The browser retries after a disconnected server. Board source changes use
recompilation and live viewer refresh. Edits to the React UI and styles use Bun's
frontend HMR; they do not require restarting the compiler or preview server.

Files loaded dynamically through filesystem calls or computed imports cannot be
fully discovered statically. Add explicit files or directories:

```sh
bun run board:dev examples/basic.tsx --watch ./board-data --watch ./custom-rules.json
```

Explicit directories are watched recursively; generated `dist`, Rust `target`,
`node_modules` and `.git` directories are excluded. Package installation requires
a server restart if it changes runtime/package resolution in a way the tracked
configuration does not reflect. A failed static export exits unsuccessfully and
leaves any existing destination unchanged; successful exports replace it atomically.

## Programmatic API

```tsx
import {compile} from '@react-pcb/core';
import {boardHtml, boardSvg, exportBoardPreview, startBoardPreview} from '@react-pcb/preview';
import MyBoard from './board.tsx';

await Bun.write('dist/index.html', await boardHtml(<MyBoard />, {cwd: process.cwd()}));
await exportBoardPreview('./board.tsx', 'dist/index.html');

const result = await compile(<MyBoard />);
const {svg, diagnostics} = await boardSvg(result.ir);

const preview = await startBoardPreview('./board.tsx', {port: 0, watch: ['./board-data']});
console.log(preview.url);
// Later: await preview.stop();
```

`buildBoardPreview(entry, options?)` returns the compiled result/projection or a
build error, along with discovered inputs for tooling. `boardHtml` takes JSX and
returns a string; `exportBoardPreview` takes an entry filename, builds it in
isolation and writes a file. File-based APIs default to this workspace's compiler
root; their `cwd` and `command` options select the compiler invocation. `boardSvg`
also accepts its own command override. `startBoardPreview` returns its URL, latest
snapshot and an async `stop()` method that releases the server and watch timer and
waits for an active rebuild to finish.

Import preview APIs from `@react-pcb/preview` instead of `@react-pcb/core`.
`boardSvg` and its `BoardProjection` type remain available from core and are
re-exported by preview for convenience. The package provides the
`react-pcb-preview build <board.tsx>` and `react-pcb-preview dev <board.tsx>`
executables; the root `board:build` and `board:dev` scripts call this executable.

The Rust CLI exposes the projection directly: `pcbir board-svg < board-ir.json`
returns `{svg, diagnostics}` JSON. `PCBPREVIEW001` means invalid preview input;
`PCBPREVIEW002` reports unavailable part geometry. Physical/reference checks retain
their existing diagnostic codes.

## Verification

Preview tests cover exact placement and board-layer binding, both sides, odd
nanometre edges, unit conversion, stable and collision-free SVG IDs, forged
realization rejection, safe offline serialization, transitive import updates,
atomic exports, failed/initial builds, missing imports, dynamic data, source edits
during compilation, HTML bundling, served frontend assets, HTTP responses and
server cleanup. CI runs these through
`bun run check` and exports the basic board as an additional artifact-generation
check. Desktop/mobile browser inspection verifies live refresh, preserved controls,
zoom/pan, part selection, net highlighting, search, themes, export menus and error
recovery. Browser verification also opens the exported React HTML offline with
no network requests and checks that React HMR preserves viewer controls. Ruler
tests cover coordinate alignment, negative coordinates, fractional labels and
unmeasurable canvases. Responsive browser checks include narrow mobile, tablet,
and desktop widths.
