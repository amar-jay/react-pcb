import type {ReactNode} from 'react';
import {createDeclarationTransaction} from '../protocol/index.ts';
import {renderDeclarations} from '../renderer/index.ts';
import {compilerError, formatDiagnostic} from './diagnostics.ts';
import type {CompilerDiagnostic} from './diagnostics.ts';

export {formatDiagnostic, PcbCompileError} from './diagnostics.ts';
export type {CompilerDiagnostic, DiagnosticSeverity} from './diagnostics.ts';

export type CompileOptions = {
  command?: readonly string[];
  cwd?: string;
  hideWarnings?: boolean;
};

export type CompileResult = {
  ir: unknown;
  diagnostics: CompilerDiagnostic[];
};

type CompilerResponse = CompileResult & {compilerDiagnostics: CompilerDiagnostic[]};

export async function compile(
  element: ReactNode,
  options: CompileOptions = {},
): Promise<CompileResult> {
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
  if (exitCode !== 0) throw compilerError(stderr, exitCode);
  if (stderr.trim()) console.error(stderr.trim());
  const {compilerDiagnostics, ...result} = JSON.parse(stdout) as CompilerResponse;
  if (!options.hideWarnings) {
    for (const diagnostic of compilerDiagnostics) {
      console.error(formatDiagnostic(diagnostic));
    }
  }
  return result;
}
