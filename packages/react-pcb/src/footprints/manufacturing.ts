import {compilerError} from '../compiler/diagnostics.ts';
import type {CompilerDiagnostic} from '../compiler/diagnostics.ts';
import type {PhysicalFootprint, PhysicalLength} from './physical.ts';

/** Explicit user-selected process limits; no fabricator defaults are inferred. */
export type ManufacturingProfileInput = Readonly<{
  schemaVersion: 1;
  key: string;
  minCopperFeature: PhysicalLength;
  minCopperSpacing: PhysicalLength;
  minDrillDiameter: PhysicalLength;
  minAnnularRing: PhysicalLength;
  minMaskExpansion?: PhysicalLength;
  minMaskWeb?: PhysicalLength;
  minPasteFeature?: PhysicalLength;
  minCourtyardClearance?: PhysicalLength;
}>;
export type ManufacturingProfile = Readonly<{
  schemaVersion: 1;
  key: string;
  units: 'nm';
  minCopperFeature: number;
  minCopperSpacing: number;
  minDrillDiameter: number;
  minAnnularRing: number;
  minMaskExpansion: number | null;
  minMaskWeb: number | null;
  minPasteFeature: number | null;
  minCourtyardClearance: number | null;
}>;
export type ManufacturingCheck = Readonly<{
  id: string;
  status: 'passed' | 'failed' | 'partial' | 'skipped' | 'not-applicable';
  evaluated: number;
  skipped: number;
  diagnostics: readonly CompilerDiagnostic[];
}>;
export type ManufacturingReport = Readonly<{
  footprint: string;
  profile: ManufacturingProfile;
  conformsToCheckedRules: boolean;
  complete: false;
  checks: readonly ManufacturingCheck[];
}>;

/** Inspect canonical geometry without altering it. Rule violations are returned
 * in the report; malformed geometry or profile inputs reject with PcbCompileError. */
export async function validateFootprintManufacturing(footprint: PhysicalFootprint, profile: ManufacturingProfileInput,
  options: {cwd?: string; command?: readonly string[]} = {}): Promise<ManufacturingReport> {
  const process = Bun.spawn([...(options.command ?? ['cargo', 'run', '--quiet', '-p', 'pcbir', '--', 'validate-footprint'])], {
    cwd: options.cwd, stdin: new Blob([JSON.stringify({footprint, profile})]), stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code !== 0) throw compilerError(stderr, code);
  return JSON.parse(stdout) as ManufacturingReport;
}
