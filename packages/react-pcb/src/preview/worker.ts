import React from 'react';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from '../compiler/index.ts';
import {boardSvg} from './index.ts';
import type {PreviewBuild, PreviewBuildOptions} from './build.ts';
import {fingerprint} from './watch.ts';

const {entry, output, options} = await Bun.stdin.json() as {entry: string; output: string; options: PreviewBuildOptions};
const dependencies = new Set<string>([entry]);
const directories = new Set<string>([dirname(entry)]);
const inputs: Record<string,string> = {};
for (const name of ['tsconfig.json', 'package.json', 'bun.lock', 'bunfig.toml', 'Cargo.toml', 'Cargo.lock']) {
  dependencies.add(resolve(options.cwd!, name));
}
let response: PreviewBuild;
try {
  for await (const path of new Bun.Glob('crates/pcbir/src/**/*.rs').scan({cwd: options.cwd, absolute: true})) {
    dependencies.add(path); directories.add(dirname(path));
  }
  for (const path of dependencies) inputs[path] = await fingerprint(path);
  // Discover static imports without evaluating author code. Package imports remain
  // external, except our workspace API whose implementation is editable source.
  const build = await Bun.build({entrypoints: [entry], target: 'bun', packages: 'external', plugins: [{
    name: 'pcb-preview-dependencies',
    setup(builder) {
      builder.onResolve({filter: /^@react-pcb\/core$/}, () => ({path: resolve(import.meta.dir, '../index.ts')}));
      builder.onResolve({filter: /^\./}, args => {
        if (args.importer) directories.add(dirname(resolve(dirname(args.importer), args.path)));
        return undefined;
      });
      builder.onLoad({filter: /.*/}, async args => {
        dependencies.add(args.path);
        directories.add(dirname(args.path));
        inputs[args.path] = await fingerprint(args.path);
        return undefined;
      });
    },
  }]});
  if (!build.success) throw new Error(build.logs.map(String).join('\n'));
  const module = await import(pathToFileURL(entry).href);
  const exported = module.default;
  const element = typeof exported === 'function' ? React.createElement(exported) : exported;
  if (!React.isValidElement(element)) throw new Error('Board JSX must default-export a component or a JSX element.');
  const result = await compile(element, {...options, hideWarnings: true});
  const projection = await boardSvg(result.ir, {cwd: options.cwd});
  response = {result, projection, error: null, dependencies: [], directories: [], inputs};
} catch (error) {
  response = {result: null, projection: null, error: error instanceof Error ? error.message : String(error), dependencies: [], directories: [], inputs};
}
response.dependencies = [...dependencies].sort();
response.directories = [...directories].sort();
await Bun.write(output, JSON.stringify(response));
