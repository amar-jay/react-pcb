import type {ReactNode} from 'react';
import {createDeclarationTransaction} from '../protocol/index.ts';
import {renderDeclarations} from '../renderer/index.ts';

export type CompileOptions = {
  command?: readonly string[];
  cwd?: string;
};

export async function compile(element: ReactNode, options: CompileOptions = {}): Promise<unknown> {
  const declarations = await renderDeclarations(element);
  const command = options.command ?? ['cargo', 'run', '--quiet', '-p', 'pcbir', '--', 'compile'];
  const process = Bun.spawn([...command], {
    cwd: options.cwd,
    stdin: new Blob([JSON.stringify(createDeclarationTransaction(declarations))]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    process.stdout.text(),
    process.stderr.text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `pcbir exited with status ${exitCode}`);
  return JSON.parse(stdout);
}
