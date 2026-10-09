# @react-pcb/preview

Board inspection and HTML export for React PCB. This Bun workspace package owns
the browser viewer, offline HTML generation, isolated JSX entry builds, file
watching, local server, and CLI. It uses the public `@react-pcb/core` API for board
compilation and SVG projection. Core does not depend on preview.

From the repository root:

```sh
bun install --frozen-lockfile
bun run board:dev examples/basic.tsx
bun run board:build examples/basic.tsx --out dist/index.html
```

The package also provides its own executable:

```sh
bun run react-pcb-preview dev examples/basic.tsx --port 0 --watch ./board-data
bun run react-pcb-preview build examples/basic.tsx --out dist/index.html
```

Default-export a synchronous board component or JSX element from your entry.
Static export produces a single offline HTML file. Dev mode rebuilds imported
board and footprint changes, preserves viewer controls, and displays build errors
with the last successful board.

```tsx
import {boardHtml, exportBoardPreview, startBoardPreview} from '@react-pcb/preview';
import MyBoard from './board.tsx';

await Bun.write('dist/index.html', await boardHtml(<MyBoard />, {cwd: process.cwd()}));
await exportBoardPreview('./board.tsx', 'dist/index.html');

const preview = await startBoardPreview('./board.tsx', {port: 0});
console.log(preview.url);
// Later: await preview.stop();
```

`buildBoardPreview` returns the compiled board, SVG projection, errors, and tracked
inputs without writing HTML or starting a server. `boardSvg` and `BoardProjection`
are re-exported from core. File APIs default to the repository's Rust compiler;
use `cwd` and `command` options to select another compiler invocation. The package
is currently private and consumes TypeScript source directly through Bun.

See the [board preview guide](../../docs/board-preview.md) for all options, geometry
contracts, rebuild behavior, and verification coverage.
