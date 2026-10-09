#!/usr/bin/env bun
import {exportBoardPreview} from './build.ts';
import {startBoardPreview} from './server.ts';

const args = process.argv.slice(2);
const mode = args.shift();
const entry = args.shift();
let output = 'dist/index.html';
let port = 3000;
const watch: string[] = [];
try {
  if (!['build', 'dev'].includes(mode ?? '') || !entry || entry.startsWith('--')) {
    throw new Error('Usage: react-pcb-preview build <board.tsx> [--out dist/index.html]\n       react-pcb-preview dev <board.tsx> [--port 3000] [--watch path]');
  }
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--out' && mode === 'build') output = value;
    else if (flag === '--port' && mode === 'dev' && /^\d+$/.test(value) && Number(value) <= 65535) port = Number(value);
    else if (flag === '--watch' && mode === 'dev') watch.push(value);
    else throw new Error(`Unsupported option ${flag} ${value}`);
  }
  if (mode === 'build') console.log(await exportBoardPreview(entry, output));
  else {
    const preview = await startBoardPreview(entry, {port, watch});
    console.log(`Board preview: ${preview.url}`);
    if (preview.snapshot.error) console.error(preview.snapshot.error);
    const stop = async () => { await preview.stop(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
