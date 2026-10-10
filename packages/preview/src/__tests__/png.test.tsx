import { expect, test } from 'bun:test';
import React from 'react';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  Board,
  Part,
  compile,
  definePhysicalFootprint,
  net,
  part,
  rect,
} from '@react-pcb/core';
import {
  boardSvg,
  buildBoardPreview,
  exportBoardPng,
  renderBoardPng,
} from '../index.ts';
import { testLayers } from './fixtures.ts';

const cwd = resolve(import.meta.dir, '../../../..');
const footprint = definePhysicalFootprint({
  key: 'png:pad',
  features: [
    {
      id: 'P',
      purpose: 'pad',
      at: ['0mm', '0mm'],
      shape: { kind: 'rect', size: ['2mm', '2mm'] },
      layers: ['front-copper'],
    },
    {
      id: 'mask',
      purpose: 'mask-opening',
      at: ['0mm', '0mm'],
      shape: { kind: 'rect', size: ['2.4mm', '2.4mm'] },
      layers: ['front-mask'],
    },
    {
      id: 'paste',
      purpose: 'paste-opening',
      at: ['0mm', '0mm'],
      shape: { kind: 'rect', size: ['1.6mm', '1.6mm'] },
      layers: ['front-paste'],
    },
  ],
});

// Decode resvg's RGBA PNG so tests verify rendered colors, not just different files.
function pixels(bytes: Uint8Array) {
  const png = Buffer.from(bytes);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const data = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const decoded = Buffer.alloc(stride * height);
  const colors = new Map<string, number>();
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const offset = y * stride + x;
      const left = x < 4 ? 0 : decoded[offset - 4]!;
      const above = y === 0 ? 0 : decoded[offset - stride]!;
      const corner = y === 0 || x < 4 ? 0 : decoded[offset - stride - 4]!;
      const prediction = left + above - corner;
      const distances = [
        Math.abs(prediction - left),
        Math.abs(prediction - above),
        Math.abs(prediction - corner),
      ];
      const paeth =
        distances[0]! <= distances[1]! && distances[0]! <= distances[2]!
          ? left
          : distances[1]! <= distances[2]!
            ? above
            : corner;
      decoded[offset] =
        (data[y * (stride + 1) + x + 1]! +
          [0, left, above, Math.floor((left + above) / 2), paeth][filter]!) &
        255;
    }
  }
  for (let offset = 0; offset < decoded.length; offset += 4) {
    if (decoded[offset + 3] !== 255)
      throw new Error('PNG must have an opaque background');
    const color = decoded.subarray(offset, offset + 3).toString('hex');
    colors.set(color, (colors.get(color) ?? 0) + 1);
  }
  return { width, height, colors, rgba: decoded };
}

test('PNG preserves board geometry and uses canvas colors, readable strokes, themes and layer presets', async () => {
  const result = await compile(
    <Board outline={rect(0, 0, 20, 10)} layers={testLayers}>
      <Part
        id={part('F1')}
        at={[5, 5]}
        footprint={footprint}
        connect={{ P: net('GND') }}
      />
      <Part
        id={part('B1')}
        at={[15, 5]}
        side="back"
        footprint={footprint}
        connect={{ P: net('GND') }}
      />
    </Board>,
    { cwd, hideWarnings: true },
  );
  const projection = await boardSvg(result.ir, { cwd });
  const original = JSON.stringify({ result, projection });
  const options = { width: 320, layers: 'front' as const };
  const board = pixels(renderBoardPng(projection, result.ir, options));
  const analysis = pixels(
    renderBoardPng(projection, result.ir, { ...options, view: 'analysis' }),
  );
  const dark = pixels(
    renderBoardPng(projection, result.ir, {
      ...options,
      view: 'analysis',
      theme: 'dark',
    }),
  );
  const back = pixels(
    renderBoardPng(projection, result.ir, {
      ...options,
      view: 'analysis',
      layers: 'back',
    }),
  );
  expect(board.width).toBe(320);
  expect(board.height).toBe(Math.round((320 * 12) / 22));
  expect(analysis.width).toBe(board.width);
  expect(analysis.height).toBe(board.height);
  expect(board.colors.has('234e41')).toBe(true);
  expect(board.colors.has('dfae77')).toBe(true);
  expect(analysis.colors.has('a34d0b')).toBe(true);
  expect(analysis.colors.has('0f172a')).toBe(true);
  expect(analysis.colors.get('64748b') ?? 0).toBeLessThan(1200);
  expect(dark.colors.has('172033')).toBe(true);
  expect(dark.colors.has('fbbf24')).toBe(true);
  expect(back.colors.has('1d4ed8')).toBe(true);
  expect(back.colors.has('a34d0b')).toBe(false);
  for (const view of ['board', 'analysis'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      const all = pixels(
        renderBoardPng(projection, result.ir, {
          width: 440,
          view,
          theme,
          layers: 'all',
        }),
      );
      const frontCopper =
        view === 'board' ? 'dfae77' : theme === 'dark' ? 'fbbf24' : 'a34d0b';
      const backCopper =
        view === 'board' ? '8dace1' : theme === 'dark' ? '60a5fa' : '1d4ed8';
      // At 20 px/mm, these points are inside both copper and paste openings,
      // away from labels and boundaries. Their fill must stay pure copper.
      for (const [x, color] of [
        [120, frontCopper],
        [320, backCopper],
      ] as const) {
        const offset = (130 * all.width + x) * 4;
        expect(all.rgba.subarray(offset, offset + 3).toString('hex')).toBe(
          color,
        );
      }
    }
  }
  const labels = pixels(
    renderBoardPng(
      {
        ...projection,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10">
    <rect width="20" height="10"/><g data-overlay="references" text-anchor="middle"><text x="5" y="5">III</text><text x="15" y="5">WWW</text></g></svg>`,
      },
      result.ir,
      { width: 400 },
    ),
  );
  const labelWidth = (left: number) => {
    const columns: number[] = [];
    for (let x = left; x < left + 200; x++) {
      for (let y = 0; y < labels.height; y++) {
        const offset = (y * labels.width + x) * 4;
        if (
          labels.rgba.subarray(offset, offset + 3).toString('hex') === 'e8eddb'
        ) {
          columns.push(x);
          break;
        }
      }
    }
    return Math.max(...columns) - Math.min(...columns) + 1;
  };
  // A proportional fallback makes III much narrower than WWW. Monospace
  // advances stay equal, with only the outer glyph bearings differing.
  expect(labelWidth(0) / labelWidth(200)).toBeGreaterThan(0.7);
  expect(JSON.stringify({ result, projection })).toBe(original);
  expect(() => renderBoardPng(projection, result.ir, { width: 0 })).toThrow(
    'width',
  );
  expect(() =>
    renderBoardPng(
      {
        ...projection,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="100" viewBox="0 0 1 100"/>',
      },
      result.ir,
      { width: 2048 },
    ),
  ).toThrow('32 million');
});

test('ESC PNG defaults retain courtyard, fabrication, mask, paste and constraint details', async () => {
  const build = await buildBoardPreview(join(cwd, 'examples/esc/index.tsx'));
  expect(build.error).toBeNull();
  const board = pixels(
    renderBoardPng(build.projection!, build.result!.ir, { width: 1024 }),
  );
  const front = pixels(
    renderBoardPng(build.projection!, build.result!.ir, {
      width: 1024,
      layers: 'front',
    }),
  );
  const analysis = pixels(
    renderBoardPng(build.projection!, build.result!.ir, {
      width: 1024,
      view: 'analysis',
    }),
  );
  expect(board.width).toBe(1024);
  expect(board.height).toBe(1024);
  for (const color of ['fbbf24', '67e8f9', 'c4b5fd']) {
    expect(board.colors.has(color)).toBe(true);
    expect(front.colors.has(color)).toBe(false);
  }
  expect(analysis.colors.has('ffffff')).toBe(true);
  expect(analysis.colors.has('7e22ce')).toBe(true);
  expect(board.colors.has('dfae77')).toBe(true);
  expect(analysis.colors.has('a34d0b')).toBe(true);
}, 15000);

const source = `import React from 'react';
import {Board,rect} from '@react-pcb/core';
import {testLayers} from '../packages/preview/src/__tests__/fixtures.ts';
export default function Fixture(){return <Board outline={rect(0,0,20,10)} layers={testLayers}/>;}`;
async function cli(entry: string, ...args: string[]) {
  const child = Bun.spawn(
    [
      process.execPath,
      'run',
      'preview',
      ...args.slice(0, 1),
      entry,
      ...args.slice(1),
    ],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test('CLI exports both PNG views and inferred PNG builds, rejects invalid flags and preserves files on failure', async () => {
  const directory = await mkdtemp(join(cwd, '.png-test-'));
  const entry = join(directory, 'board.tsx');
  try {
    await Bun.write(entry, source);
    const output = join(directory, 'nested', 'preview.png');
    const exported = await cli(
      entry,
      'png',
      '--out',
      output,
      '--view',
      'both',
      '--width',
      '320',
    );
    expect(exported.code).toBe(0);
    const paths = ['board', 'analysis'].map(
      (view) => `${output.slice(0, -4)}.${view}.png`,
    );
    for (const file of paths) {
      expect(exported.stdout).toContain(file);
      expect(
        pixels(new Uint8Array(await Bun.file(file).arrayBuffer())).width,
      ).toBe(320);
    }
    const valid = await Promise.all(
      paths.map((file) => Bun.file(file).arrayBuffer()),
    );
    const inferred = await cli(
      entry,
      'build',
      '--out',
      output,
      '--view',
      'analysis',
      '--theme',
      'dark',
      '--layers',
      'all',
      '--width',
      '128',
    );
    expect(inferred.code).toBe(0);
    expect(
      pixels(new Uint8Array(await Bun.file(output).arrayBuffer())).width,
    ).toBe(128);
    for (const args of [
      ['png', '--width', '0'],
      ['png', '--view', 'typo'],
      ['png', '--layers', 'typo'],
      ['png', '--out', join(directory, 'wrong.html')],
      ['build', '--view', 'analysis'],
      ['dev', '--view', 'analysis'],
    ])
      expect((await cli(entry, ...args)).code).toBe(1);
    await Bun.write(entry, 'export default 123;');
    await expect(
      exportBoardPng(entry, output, { view: 'both' }),
    ).rejects.toThrow('default-export');
    expect(
      (await cli(entry, 'png', '--out', output, '--view', 'both')).code,
    ).toBe(1);
    for (let i = 0; i < paths.length; i++)
      expect(await Bun.file(paths[i]!).arrayBuffer()).toEqual(valid[i]!);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
