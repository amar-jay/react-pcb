#!/usr/bin/env bun
import { extname } from 'node:path';
import { exportBoardPreview } from './build.ts';
import { exportBoardPng, type PngExportOptions } from './png.ts';
import { startBoardPreview } from './server.ts';

const usage = `Usage: react-pcb-preview build <board.tsx> [--out dist/index.html]
       react-pcb-preview png <board.tsx> [--out dist/board.png] [--view board|analysis|both]
                             [--width 2048] [--theme light|dark] [--layers front|back|copper|fabrication|all]
       react-pcb-preview dev <board.tsx> [--port 3000] [--watch path]
Build also accepts a .png output with the same PNG options.
With --view both, <name>.png produces <name>.board.png and <name>.analysis.png.`;
const args = process.argv.slice(2);
const mode = args.shift();
const entry = args.shift();
let output: string | undefined;
let port = 3000;
const watch: string[] = [];
const png: PngExportOptions = {};
try {
  if (mode === '--help' || mode === '-h') {
    console.log(usage);
  } else {
    if (!['build', 'png', 'dev'].includes(mode ?? '') || !entry || entry.startsWith('--'))
      throw new Error(usage);
    while (args.length) {
      const flag = args.shift();
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if (flag === '--out' && mode !== 'dev') output = value;
      else if (flag === '--port' && mode === 'dev' && /^\d+$/.test(value) && Number(value) <= 65535) port = Number(value);
      else if (flag === '--watch' && mode === 'dev') watch.push(value);
      else if (flag === '--view' && mode !== 'dev' && ['board', 'analysis', 'both'].includes(value)) png.view = value as PngExportOptions['view'];
      else if (flag === '--theme' && mode !== 'dev' && ['light', 'dark'].includes(value)) png.theme = value as PngExportOptions['theme'];
      else if (flag === '--layers' && mode !== 'dev' && ['front', 'back', 'copper', 'fabrication', 'all'].includes(value)) png.layers = value as PngExportOptions['layers'];
      else if (flag === '--width' && mode !== 'dev' && /^\d+$/.test(value)) png.width = Number(value);
      else throw new Error(`Unsupported option ${flag} ${value}\n${usage}`);
    }
    if (mode === 'png' || (mode === 'build' && extname(output ?? '').toLowerCase() === '.png')) {
      const exported = await exportBoardPng(entry, output, png);
      for (const file of exported.files) console.log(file);
      for (const diagnostic of exported.diagnostics)
        console.error(`${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`);
    } else if (mode === 'build') {
      if (Object.keys(png).length) throw new Error('PNG options require the png command or --out <name>.png');
      console.log(await exportBoardPreview(entry, output));
    } else {
      const preview = await startBoardPreview(entry, { port, watch });
      console.log(`Board preview: ${preview.url}`);
      if (preview.snapshot.error) console.error(preview.snapshot.error);
      const stop = async () => { await preview.stop(); process.exit(0); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
