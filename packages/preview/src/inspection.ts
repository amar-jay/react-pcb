import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  footprintSvg,
  type CompileResult,
  type CompilerDiagnostic,
  type IrPart,
  type ManufacturingReport,
  type PhysicalFootprint,
} from '@react-pcb/core';
import { DOMParser } from 'linkedom';
import {
  buildBoardPreview,
  compilerRoot,
  type PreviewBuildOptions,
} from './build.ts';
import { bundleFrontend } from './frontend/build.ts';
import { embedPreviewData } from './html.ts';
import { inspectionFootprintSvg } from './inspection-svg.ts';
import { exportBoardSvg } from './frontend/lib/scene-presentation.ts';
import { sceneLayers, type SceneLayer } from './frontend/lib/scene.ts';

export type InspectedFootprint = {
  key: string;
  physical: PhysicalFootprint | null;
  parts: readonly IrPart[];
  layers: SceneLayer[];
  svg: string | null;
  report: ManufacturingReport | null;
  files: {
    definition: string;
    geometry: string | null;
    svg: string | null;
    manufacturing: string;
  };
};
export type BoardInspection = {
  entry: string;
  result: CompileResult;
  footprints: InspectedFootprint[];
  diagnostics: readonly CompilerDiagnostic[];
  svg: string;
  files: {
    board: string;
    svg: string;
    result: string;
    manufacturing: string;
    manifest: string;
  };
};
let frontend: Promise<string> | undefined;

/** Discover reusable footprints by canonical definition key, never by instance order or display name. */
export async function buildBoardInspection(
  entry: string,
  options: PreviewBuildOptions = {},
): Promise<BoardInspection> {
  const build = await buildBoardPreview(entry, options);
  if (build.error || !build.result || !build.projection)
    throw new Error(build.error ?? 'Board inspection compilation failed');
  const result = build.result;
  const keys = [
    ...new Set(result.ir.parts.map((part) => part.footprint)),
  ].sort();
  const footprints: InspectedFootprint[] = [];
  for (const key of keys) {
    const definition = result.ir.footprintDefinitions[key];
    if (!definition) throw new Error(`Missing footprint definition: ${key}`);
    const base = `footprints/${createHash('sha256').update(key).digest('hex')}`;
    const geometry = definition.physical;
    const rendered = geometry
      ? inspectionFootprintSvg(
          await footprintSvg(geometry, {
            cwd: options.cwd ?? compilerRoot,
            command: options.command,
          }),
        )
      : null;
    footprints.push({
      key,
      physical: geometry,
      parts: result.ir.parts
        .filter((part) => part.footprint === key)
        .toSorted((a, b) => a.id.localeCompare(b.id)),
      svg: rendered?.svg ?? null,
      layers: rendered?.layers ?? [],
      report: result.manufacturingReports[key] ?? null,
      files: {
        definition: `${base}.definition.json`,
        geometry: geometry ? `${base}.json` : null,
        svg: geometry ? `${base}.svg` : null,
        manufacturing: `${base}.manufacturing.json`,
      },
    });
  }
  const document = new DOMParser().parseFromString(
    build.projection.svg,
    'image/svg+xml',
  ) as unknown as Document;
  const layers = sceneLayers(build.projection.svg, result.ir, document);
  const svg = exportBoardSvg(
    build.projection.svg,
    layers,
    Object.fromEntries(layers.map((layer) => [layer.key, true])),
    { view: 'analysis', theme: 'light' },
    document,
  );
  return {
    entry: resolve(entry),
    result,
    footprints,
    svg,
    diagnostics: [...result.diagnostics, ...build.projection.diagnostics],
    files: {
      board: 'board.json',
      svg: 'board.svg',
      result: 'result.json',
      manufacturing: 'board.manufacturing.json',
      manifest: 'manifest.json',
    },
  };
}

/** Offline gallery and machine-readable artifacts from exactly the board's compiled definitions/reports. */
export async function exportBoardInspection(
  entry: string,
  output = 'dist/inspect',
  options: PreviewBuildOptions = {},
): Promise<string> {
  const inspection = await buildBoardInspection(entry, options);
  frontend ??= bundleFrontend(
    undefined,
    join(import.meta.dir, 'frontend/inspect/index.html'),
  ).catch((error) => {
    frontend = undefined;
    throw error;
  });
  const html = embedPreviewData(await frontend, inspection);
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const files = new Map<string, string>([
    ['board.json', json(inspection.result.ir)],
    ['board.svg', inspection.svg],
    ['result.json', json(inspection.result)],
    [
      'board.manufacturing.json',
      json(inspection.result.boardManufacturingReport),
    ],
  ]);
  for (const footprint of inspection.footprints) {
    files.set(
      footprint.files.definition,
      json(inspection.result.ir.footprintDefinitions[footprint.key]),
    );
    files.set(footprint.files.manufacturing, json(footprint.report));
    if (footprint.files.geometry)
      files.set(footprint.files.geometry, json(footprint.physical));
    if (footprint.files.svg) files.set(footprint.files.svg, footprint.svg!);
  }
  files.set(
    'manifest.json',
    json({
      schemaVersion: 1,
      entry: inspection.entry,
      board: inspection.result.ir.board.id,
      files: inspection.files,
      diagnostics: inspection.diagnostics,
      footprints: inspection.footprints.map(({ key, parts, files }) => ({
        key,
        parts: parts.map((part) => part.id),
        files,
      })),
    }),
  );
  files.set('index.html', html);
  const destination = resolve(output);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(join(dirname(destination), '.pcb-inspect-'));
  try {
    for (const [name, content] of files) {
      const staged = join(temporary, name);
      await mkdir(dirname(staged), { recursive: true });
      await Bun.write(staged, content);
    }
    // Stage every artifact first; compilation/rendering failures leave previous output intact.
    for (const name of files.keys()) {
      const file = join(destination, name);
      await mkdir(dirname(file), { recursive: true });
      await rename(join(temporary, name), file);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return join(destination, 'index.html');
}
