import { resolve } from 'node:path';
import tailwind from 'bun-plugin-tailwind';

export const frontendEntry = resolve(import.meta.dir, 'index.html');

/** HTML is the entrypoint for both the live site and the offline board viewer. */
export async function bundleFrontend(outdir?: string, entry = frontendEntry) {
  const result = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    compile: true,
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [tailwind],
    ...(outdir ? { outdir } : {}),
  });
  if (!result.success)
    throw new AggregateError(result.logs, 'Preview frontend build failed');
  const html = result.outputs.find((output) => output.path.endsWith('.html'));
  if (!html)
    throw new Error('Preview frontend build did not produce index.html');
  return html.text();
}

if (import.meta.main) {
  const outdir = resolve(import.meta.dir, '../../../../dist');
  await bundleFrontend(outdir);
  console.log(`Preview frontend: ${outdir}/index.html`);
}
