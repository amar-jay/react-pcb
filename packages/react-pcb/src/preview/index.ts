import type {ReactNode} from 'react';
import {compile, type CompileOptions, type CompileResult} from '../compiler/index.ts';
import {compilerError, type CompilerDiagnostic} from '../compiler/diagnostics.ts';
import type {BoardIr} from '../ir/index.ts';
import {previewHtml} from './html.ts';

export type BoardProjection = {svg: string; diagnostics: CompilerDiagnostic[]};
export type PreviewSnapshot = {
  entry: string;
  result: CompileResult | null;
  projection: BoardProjection | null;
  error: string | null;
  version: number;
  building: boolean;
  live: boolean;
};

/** Project compiled placement; no placement/routing is inferred by the viewer. */
export async function boardSvg(ir: BoardIr, options: {cwd?: string; command?: readonly string[]} = {}): Promise<BoardProjection> {
  const child = Bun.spawn([...(options.command ?? ['cargo', 'run', '--quiet', '-p', 'pcbir', '--', 'board-svg'])], {
    cwd: options.cwd, stdin: new Blob([JSON.stringify(ir)]), stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw compilerError(stderr, code);
  return JSON.parse(stdout) as BoardProjection;
}

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
