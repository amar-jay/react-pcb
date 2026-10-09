import {mkdtemp, mkdir, rm, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, dirname, join} from 'node:path';
import type {CompileOptions} from '@react-pcb/core';
import type {PreviewSnapshot} from './index.ts';
import {previewHtml} from './html.ts';

export type PreviewBuildOptions = Pick<CompileOptions, 'cwd' | 'command'>;
export type PreviewBuild = Pick<PreviewSnapshot, 'result' | 'projection' | 'error'> & {
  dependencies: string[];
  directories: string[];
  inputs: Record<string, string>;
};
export const compilerRoot = resolve(import.meta.dir, '../../..');

/** Fresh process per build prevents stale transitive imports and renderer state. */
export async function buildBoardPreview(entry: string, options: PreviewBuildOptions = {}): Promise<PreviewBuild> {
  const folder = await mkdtemp(join(tmpdir(), 'react-pcb-preview-'));
  const output = join(folder, 'result.json');
  const absolute = resolve(entry);
  try {
    const child = Bun.spawn([process.execPath, join(import.meta.dir, 'worker.ts')], {
      cwd: options.cwd ?? compilerRoot,
      stdin: new Blob([JSON.stringify({entry: absolute, output, options: {...options, cwd: options.cwd ?? compilerRoot}})]),
      stdout: 'pipe', stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code !== 0 || !await Bun.file(output).exists()) {
      return {result: null, projection: null, error: stderr.trim() || stdout.trim() || `Board process exited with status ${code} before producing a preview. Export a default board component and guard executable code with import.meta.main.`,
        dependencies: [absolute], directories: [dirname(absolute)], inputs: {}};
    }
    return await Bun.file(output).json() as PreviewBuild;
  } finally { await rm(folder, {recursive: true, force: true}); }
}

/** Publish a valid export atomically; a failed build leaves existing output intact. */
export async function exportBoardPreview(entry: string, output = 'dist/index.html', options: PreviewBuildOptions = {}): Promise<string> {
  const build = await buildBoardPreview(entry, options);
  if (build.error || !build.result || !build.projection) throw new Error(build.error ?? 'Board preview compilation failed');
  const destination = resolve(output);
  await mkdir(dirname(destination), {recursive: true});
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, previewHtml({result: build.result, projection: build.projection, error: null, entry: resolve(entry), version: 1, building: false, live: false}));
    await rename(temporary, destination);
  } finally { await rm(temporary, {force: true}); }
  return destination;
}
