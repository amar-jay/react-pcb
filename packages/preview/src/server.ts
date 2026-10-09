import {resolve} from 'node:path';
import {buildBoardPreview, type PreviewBuildOptions} from './build.ts';
import type {PreviewSnapshot} from './index.ts';
import frontend from './frontend/index.html';
import {fingerprint} from './watch.ts';

export type PreviewServerOptions = PreviewBuildOptions & {
  port?: number;
  pollInterval?: number;
  /** Extra dynamically loaded data, configuration, or directories to watch. */
  watch?: readonly string[];
};
/** Poll watched imports, serialize rebuilds, and retain the last valid board. */
export async function startBoardPreview(entry: string, options: PreviewServerOptions = {}) {
  const absolute = resolve(entry);
  let snapshot: PreviewSnapshot = {entry: absolute, result: null, projection: null, error: null, version: 0, building: true, live: true};
  let files = new Map<string, string>();
  const extra = (options.watch ?? []).map(p => resolve(p));
  let stopped = false;
  let dirty = false;
  let running: Promise<void> | null = null;
  let polling = false;
  const rebuild = () => {
    if (running) { dirty = true; return running; }
    running = (async () => {
      do {
        dirty = false;
        snapshot = {...snapshot, building: true};
        const beforeExtra = new Map<string,string>();
        for (const path of extra) beforeExtra.set(path, await fingerprint(path,true));
        let build;
        try { build = await buildBoardPreview(absolute, options); }
        catch (error) {
          build = {result: null, projection: null, error: String(error), dependencies: [absolute], directories: [], inputs: {}};
        }
        if (stopped) break;
        snapshot = {...snapshot, version: snapshot.version + 1, building: false, error: build.error,
          ...(build.result && build.projection ? {result: build.result, projection: build.projection} : {})};
        const paths = new Set([...build.dependencies, ...build.directories, ...extra]);
        if (build.error) for (const path of files.keys()) paths.add(path);
        const next = new Map<string, string>();
        for (const path of paths) {
          const value = await fingerprint(path, extra.includes(path));
          // An edit during compilation must trigger a subsequent fresh build.
          if (files.has(path) && value !== files.get(path)) dirty = true;
          if (build.inputs[path] !== undefined && value !== build.inputs[path]) dirty = true;
          if (beforeExtra.has(path) && value !== beforeExtra.get(path)) dirty = true;
          next.set(path, value);
        }
        files = next;
      } while (dirty && !stopped);
    })().finally(() => { running = null; });
    return running;
  };
  const server = Bun.serve({hostname: '127.0.0.1', port: options.port ?? 3000,
    routes: {'/': frontend, '/index.html': frontend},
    development: {hmr: true, console: true},
    fetch(request) {
    const path = new URL(request.url).pathname;
    const headers = {'Cache-Control': 'no-store'};
    if (request.method !== 'GET') return new Response('Method not allowed', {status: 405, headers});
    if (path === '/__preview/status') return Response.json({version: snapshot.version, building: snapshot.building}, {headers});
    if (path === '/__preview/data') return Response.json(snapshot, {headers});
    return new Response('Not found', {status: 404, headers});
  }});
  const timer = setInterval(async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      for (const [path, old] of files) {
        const value = await fingerprint(path, extra.includes(path));
        if (value !== old) { files.set(path, value); dirty = true; }
      }
      if (dirty && !running) void rebuild();
    } finally { polling = false; }
  }, options.pollInterval ?? 250);
  try { await rebuild(); }
  catch (error) { clearInterval(timer); await server.stop(true); throw error; }
  return {
    url: server.url,
    get snapshot() { return snapshot; },
    async stop() { stopped = true; clearInterval(timer); await server.stop(true); await running; },
  };
}
