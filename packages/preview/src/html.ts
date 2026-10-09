import type {PreviewSnapshot} from './index.ts';
import {bundleFrontend} from './frontend/build.ts';

let frontend: Promise<string> | undefined;

/** Compile the same React HTML entry as the live site, with every asset inlined. */
export async function previewHtml(snapshot: PreviewSnapshot): Promise<string> {
  frontend ??= bundleFrontend().catch(error => {frontend = undefined; throw error;});
  const html = await frontend;
  // Protect the inert JSON script even when labels contain </script>.
  const payload = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const marker = /(<script type="application\/json" id="preview-data">)null(<\/script>)/;
  if (!marker.test(html)) throw new Error('Preview frontend is missing its snapshot placeholder');
  return html.replace(marker, (_, open, close) => `${open}${payload}${close}`);
}
