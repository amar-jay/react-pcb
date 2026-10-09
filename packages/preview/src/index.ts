import type {ReactNode} from 'react';
import {compile, boardSvg, type CompileOptions, type CompileResult, type BoardProjection, type CompilerDiagnostic} from '@react-pcb/core';
import {previewHtml} from './html.ts';

export type PreviewSnapshot = {
  entry: string;
  result: CompileResult | null;
  projection: BoardProjection | null;
  error: string | null;
  /** Findings from the latest failed build, separate from retained last-good scene data. */
  buildDiagnostics?: readonly CompilerDiagnostic[];
  version: number;
  building: boolean;
  live: boolean;
};

/** Self-contained offline HTML from board JSX. Writes are explicit via Bun.write. */
export async function boardHtml(element: ReactNode, options: CompileOptions = {}): Promise<string> {
  const result = await compile(element, options);
  const projection = await boardSvg(result.ir, {cwd: options.cwd});
  return previewHtml({entry: '', result, projection, error: null, version: 1, building: false, live: false});
}

export {buildBoardPreview, exportBoardPreview} from './build.ts';
export {startBoardPreview} from './server.ts';
export type {PreviewBuildOptions, PreviewBuild} from './build.ts';
export type {PreviewServerOptions} from './server.ts';
export {boardSvg} from '@react-pcb/core';
export type {BoardProjection} from '@react-pcb/core';
