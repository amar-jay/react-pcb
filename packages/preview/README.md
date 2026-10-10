# @react-pcb/preview

Board inspection, HTML and PNG export for React PCB. This Bun workspace package owns
the browser viewer, offline HTML generation, isolated JSX entry builds, file
watching, local server, and CLI. It uses the public `@react-pcb/core` API for board
compilation and SVG projection. Core does not depend on preview.

The UI uses React, Bun's HTML bundler, Tailwind CSS, shadcn sidebar/sheet/dialog
primitives, and controls from the `@amarjay-ui` registry. It includes a board
canvas, layer/overlay controls, searchable parts, an inspector, diagnostics,
an export menu, and light/dark themes.
The workbench groups layers into copper, technical types, and overlays. Each technical type has a visibility menu for Hidden, Front, Back or Both, limited to the sides present in the board.
Canvas rulers follow actual millimetre coordinates through pan and zoom; the
inspector displays board dimensions and stackup or the selected part's details.
The design sidebar collapses with its toggle or `Ctrl/Cmd+B`. Board/part details
dock beside the canvas on large screens and open as a sheet on smaller screens.
Click the red X in the bottom bar to open compilation failure details; diagnostics have separate
All, Errors, and Warnings tabs in a bottom sheet.

From the repository root:

```sh
bun install --frozen-lockfile
bun run board:dev examples/basic/board.tsx
bun run board:build examples/basic/board.tsx --out dist/index.html
```

The package also provides its own executable:

```sh
bun run preview dev examples/basic/board.tsx --port 0 --watch ./board-data
bun run preview build examples/basic/board.tsx --out dist/index.html
```

Default-export a synchronous board component or JSX element from your entry.
Static export produces a single offline HTML file. Dev mode rebuilds imported
board and footprint changes, preserves viewer controls, and displays build errors
with the last successful board.

## PNG output for visual inspection

Export Board and Analysis images directly from the CLI, without starting a server
or installing a browser:

```sh
bun run preview png examples/basic/board.tsx --view both --out dist/basic.png
# Writes dist/basic.board.png and dist/basic.analysis.png.
bun run board:build examples/basic/board.tsx --out dist/analysis.png --view analysis --layers all --width 4096
```

PNG defaults are Board view, All layers, light theme, 2048 pixels wide, and
`dist/board.png`. Use `--view board|analysis|both`, `--layers
front|back|copper|fabrication|all`, `--theme light|dark`, and `--width 1..8192`.
Height follows the full-board aspect ratio, including the projection margin;
outputs exceeding 32 million pixels reject with guidance to reduce width.
Both views compile the entry once and share the canvas's colors and layer presets.
Images have opaque backgrounds and include references and drills where the preset
enables them. The renderer resolves the local monospace family for reference labels, matching
browser font selection where Fontconfig is available.

The CLI prints absolute output filenames to stdout and compiler/projection
diagnostics to stderr, so AI agents can inspect the images and geometry warnings
together. Failed compilation or rendering preserves existing output files.
Browser preferences, pan/zoom and temporary selection highlights do not affect
these exports. `preview --help` lists the options.

## Footprint inspection derived from a board

```sh
bun run preview inspect examples/basic/board.tsx --out dist/basic-inspect
bun run board:inspect examples/esc/index.tsx --out dist/esc-inspect
```

Open the printed `index.html` directly in a browser. The small static page lists
one entry per canonical footprint key used by the compiled board, including
unplaced parts. Each entry shows component-side geometry, dimensions, part
references, selected check status, and links to its JSON/SVG files. Images use
Analysis view, light theme, and all layers. There is no JavaScript, bundled font,
embedded IR, or UI framework in the HTML; geometry and data stay in linked files.
Agents can read `manifest.json` to locate canonical artifacts directly. No
example-specific script or manually maintained footprint list is needed.

The default output directory is `dist/inspect`. The directory contains `board.json`
(canonical IR), `board.svg` (Analysis, light, all layers), `result.json` (full compile
result), `board.manufacturing.json`, `manifest.json`, and the offline `index.html`.
Under `footprints/`, each used definition has a `.definition.json` and
`.manufacturing.json`, plus canonical physical `.json` and styled `.svg` when
physical geometry exists. Filenames use a SHA-256 hash of the canonical key;
the manifest maps original keys and stable part IDs to these files.

Manufacturing reports are exactly those produced by the board’s selected profile.
Absent reports are JSON `null` and shown as “No manufacturing profile selected.”
Inspection does not select a profile or relax thresholds. Legacy/unresolved
footprints retain their definition and part references, with no invented physical
geometry or SVG. Compilation or rendering failures preserve the existing output.

Canonical geometry stays in integer nanometres. Inspection SVGs convert the core
half-nanometre projection exactly to millimetres and add a display margin; they
share the workbench’s colors and opening outlines. These are visual artifacts,
while the canonical JSON retains the manufacturing-relevant geometry.

## Frontend development and builds

Run `board:dev` to work on the UI with a real board. Bun serves
`src/frontend/index.html` and provides React HMR for frontend edits. Board edits
compile separately and update the viewer through the preview API. Both preserve
layer choices, zoom/pan, selection, and net highlighting.

```sh
# Build the React site shell into the repository's dist/ directory.
bun run preview:build
# Embed a compiled board in the same React UI, also in dist/ by default.
bun run board:build examples/basic/board.tsx
```

The package's `bun run build` also writes to the repository's `dist/` directory.
The site shell loads board data from `/__preview/*` when hosted with the preview
server. For an HTML file that opens directly with a board already loaded, use
`board:build`. Production HTML inlines React, styles, icons, and local fonts; no
asset directory or CDN is needed.

`components.json` configures the registry and component aliases. Registry source
lives in `src/frontend/components/ui`; workbench components and hooks live
alongside it. Workbench layout and styling use Tailwind utilities in the components.
`styles.css` holds shared light/dark theme tokens, base styles, and animation definitions.
The canvas toolbar, inspector sheet, diagnostics, parts list, layer controls,
export menu, build status, and stackup are separate components. Board identity lives
in the canvas toolbar, build status sits beside diagnostics, and the design sidebar
contains export and theme controls.
Add controls from the package directory:

```sh
bunx --bun shadcn@latest registry add @amarjay-ui
bunx --bun shadcn@latest add @amarjay-ui/button
```

The checked-in root and package `bunfig.toml` files enable `bun-plugin-tailwind`
for HTML routes. A host Bun project using the programmatic server also needs
that plugin configured under `[serve.static]`.

## Programmatic API

```tsx
import {boardHtml, exportBoardPreview, exportBoardPng, exportBoardInspection, startBoardPreview} from '@react-pcb/preview';
import MyBoard from './board.tsx';

await Bun.write('dist/index.html', await boardHtml(<MyBoard />, {cwd: process.cwd()}));
await exportBoardPreview('./board.tsx', 'dist/index.html');
await exportBoardInspection('./board.tsx', 'dist/inspect');
const {files, diagnostics} = await exportBoardPng('./board.tsx', 'dist/board.png', {
  view: 'both', layers: 'front', width: 2048, theme: 'light',
});

const preview = await startBoardPreview('./board.tsx', {port: 0});
console.log(preview.url);
// Later: await preview.stop();
```

`buildBoardPreview` returns the compiled board, SVG projection, errors, and tracked
inputs without writing HTML or starting a server. `boardSvg` and `BoardProjection`
are re-exported from core. `renderBoardPng(projection, ir, options?)` returns PNG
bytes from an already compiled board for one view; `exportBoardPng` compiles an
entry, writes one or both views, and returns filenames and diagnostics.
`buildBoardInspection(entry, options?)` returns the compiled board, unique used
footprints, local SVGs, and actual reports without writing files.
`exportBoardInspection(entry, directory?, options?)` writes the gallery and
artifacts and returns the absolute `index.html` filepath.
File APIs default to the repository's Rust compiler;
use `cwd` and `command` options to select another compiler invocation. The package
is currently private and consumes TypeScript source directly through Bun.

See the [board preview guide](../../docs/board-preview.md) for all options, geometry
contracts, rebuild behavior, and verification coverage.

The canvas uses a dotted background. Use the ruler button (or press `R` while the canvas is focused), then click two points to measure their distance in millimetres. The measurement stays aligned when you pan or zoom. Alt-drag pans while measuring; `Escape` clears the measurement and exits the tool.

Open the shadcn command palette with the toolbar search button or `Ctrl/Cmd+K`. Search canvas actions, parts, nets, layers, diagnostics, theme settings and exports; use arrow keys and Enter to run a command, or Escape to close it.

The Layers tab includes Front, Back, Copper only, Fabrication and All layers presets, also searchable in the command palette. Front/Back show the corresponding copper and silkscreen with drills and references; Fabrication shows fabrication and courtyard drawings with drills and references. Manual toggles display Custom unless they match a preset. A selected preset is reapplied when the live board rebuilds.

Use the Board view selector (or command palette) to switch between Board and Analysis. Analysis uses a contrasting light/dark substrate, distinct layer colors, readable outlines and labels; both views share layer visibility, selection, measurement and pan/zoom. Mask openings use solid outlines and paste openings use dashed outlines, keeping copper colors visible even with All layers enabled. Board view uses amber courtyards and violet constraint regions. These styles apply to the canvas and SVG/PNG exports. Save SVG exports the active view and visible layers as a standalone full-board drawing at its original physical dimensions. Canvas pan/zoom and temporary selection highlights are excluded.

Board view, layer presets and custom layer visibility are saved in local storage per full source filepath and restored on refresh. Files with the same basename in different directories have separate settings. Unavailable browser storage leaves the controls usable for the current session.
