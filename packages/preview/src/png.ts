import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import type { BoardIr, BoardProjection, CompilerDiagnostic } from '@react-pcb/core';
import { Resvg } from '@resvg/resvg-js';
import { DOMParser } from 'linkedom';
import { buildBoardPreview, type PreviewBuildOptions } from './build.ts';
import { layerPresets, presetVisibility, type LayerPresetId } from './frontend/lib/layer-presets.ts';
import { exportBoardSvg, type BoardView } from './frontend/lib/scene-presentation.ts';
import { sceneLayers } from './frontend/lib/scene.ts';

export type PngRenderOptions = {
  view?: BoardView;
  /** Output width in pixels; height follows the full-board SVG aspect ratio. */
  width?: number;
  theme?: 'light' | 'dark';
  layers?: LayerPresetId;
};
export type PngExportOptions = PreviewBuildOptions & Omit<PngRenderOptions, 'view'> & {
  view?: BoardView | 'both';
};
export type PngExport = { files: string[]; diagnostics: readonly CompilerDiagnostic[] };

function validateOptions(options: PngRenderOptions | PngExportOptions) {
  const width = options.width ?? 2048;
  if (!Number.isInteger(width) || width < 1 || width > 8192)
    throw new Error('PNG width must be an integer between 1 and 8192 pixels');
  if (options.theme && !['light', 'dark'].includes(options.theme))
    throw new Error('PNG theme must be light or dark');
  if (options.layers && !layerPresets.some(preset => preset.id === options.layers))
    throw new Error('PNG layers must be front, back, copper, fabrication or all');
  if (options.view && !['board', 'analysis', 'both'].includes(options.view))
    throw new Error('PNG view must be board, analysis or both');
  return width;
}

/** Render authoritative geometry with the same presentation and presets as the canvas. */
export function renderBoardPng(projection: BoardProjection, ir: BoardIr, options: PngRenderOptions = {}): Uint8Array {
  const width = validateOptions(options);
  if (options.view === ('both' as string)) throw new Error('renderBoardPng requires one view');
  const document = new DOMParser().parseFromString(projection.svg, 'image/svg+xml') as unknown as Document;
  const layers = sceneLayers(projection.svg, ir, document);
  const theme = options.theme ?? 'light';
  exportBoardSvg(projection.svg, layers, presetVisibility(layers, options.layers ?? 'front'), {
    view: options.view ?? 'board', theme,
  }, document);
  const svg = document.documentElement as unknown as SVGSVGElement;
  const viewBox = svg.getAttribute('viewBox')!.trim().split(/\s+/).map(Number);
  const unitsPerPixel = viewBox[2]! / width;
  // resvg does not support non-scaling-stroke. Resolve display stroke widths at output scale.
  for (const element of svg.querySelectorAll<SVGElement>('[style]')) {
    if (element.style.vectorEffect !== 'non-scaling-stroke') continue;
    element.style.strokeWidth = String(parseFloat(element.style.strokeWidth) * unitsPerPixel);
    element.style.removeProperty('vector-effect');
  }
  const renderer = new Resvg(svg.outerHTML, {
    fitTo: { mode: 'width', value: width },
    background: theme === 'dark' ? '#020617' : '#f8fafc',
    font: { loadSystemFonts: true },
  });
  // Bound total allocation as well as width for unusually tall board outlines.
  if (renderer.width * renderer.height > 32_000_000)
    throw new Error('PNG exceeds 32 million pixels; use a smaller --width');
  return renderer.render().asPng();
}

/** Compile once for both views. Render everything before publishing any destination. */
export async function exportBoardPng(entry: string, output = 'dist/board.png', options: PngExportOptions = {}): Promise<PngExport> {
  validateOptions(options);
  if (extname(output).toLowerCase() !== '.png') throw new Error('PNG output must end in .png');
  const build = await buildBoardPreview(entry, options);
  if (build.error || !build.result || !build.projection)
    throw new Error(build.error ?? 'Board preview compilation failed');
  const destination = resolve(output);
  const views: BoardView[] = options.view === 'both' ? ['board', 'analysis'] : [options.view ?? 'board'];
  const images = views.map(view => ({
    file: options.view === 'both' ? `${destination.slice(0, -4)}.${view}.png` : destination,
    bytes: renderBoardPng(build.projection!, build.result!.ir, { ...options, view }),
  }));
  await mkdir(dirname(destination), { recursive: true });
  const staged: { temporary: string; file: string }[] = [];
  try {
    for (const image of images) {
      const temporary = `${image.file}.${crypto.randomUUID()}.tmp`;
      staged.push({ temporary, file: image.file });
      await Bun.write(temporary, image.bytes);
    }
    for (const image of staged) await rename(image.temporary, image.file);
  } finally {
    await Promise.all(staged.map(image => rm(image.temporary, { force: true })));
  }
  return { files: images.map(image => image.file), diagnostics: [...build.result.diagnostics, ...build.projection.diagnostics] };
}
