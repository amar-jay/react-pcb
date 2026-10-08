import type {ReactNode} from 'react';
import {renderFootprintDeclarations, type FootprintDeclarations} from './jsx.tsx';
import {compilerError} from '../compiler/diagnostics.ts';
import type {FootprintDefinition} from './index.ts';

export const FOOTPRINT_SCHEMA_VERSION = 2 as const;
export type PhysicalLength = `${number}${'nm' | 'um' | 'mm' | 'mil' | 'in'}`;
export type FootprintRole = 'front-copper' | 'back-copper' | 'all-copper'
  | 'front-mask' | 'back-mask' | 'all-mask' | 'front-paste' | 'back-paste'
  | 'front-silkscreen' | 'back-silkscreen' | 'front-courtyard' | 'back-courtyard'
  | 'front-fabrication' | 'back-fabrication';
export const footprintLayer = Object.freeze({
  frontCopper: 'front-copper', backCopper: 'back-copper', allCopper: 'all-copper',
  frontMask: 'front-mask', backMask: 'back-mask', allMask: 'all-mask',
  frontPaste: 'front-paste', backPaste: 'back-paste',
  frontSilkscreen: 'front-silkscreen', backSilkscreen: 'back-silkscreen',
  frontCourtyard: 'front-courtyard', backCourtyard: 'back-courtyard',
  frontFabrication: 'front-fabrication', backFabrication: 'back-fabrication',
} as const);
export type PhysicalShape<L> =
  | Readonly<{kind: 'rect' | 'oval'; size: readonly [L, L]}>
  | Readonly<{kind: 'rounded-rect'; size: readonly [L, L]; radius: L}>
  | Readonly<{kind: 'circle'; diameter: L}>;
export type FeaturePurpose = 'pad' | 'plated-hole' | 'non-plated-hole' | 'copper'
  | 'mask-opening' | 'paste-opening' | 'silkscreen' | 'courtyard' | 'fabrication';
export type PhysicalFeature<L> = Readonly<{
  id: string;
  purpose: FeaturePurpose;
  at: readonly [L, L];
  shape: PhysicalShape<L>;
  rotation: 0 | 90 | 180 | 270;
  layers: readonly FootprintRole[];
  drill: Readonly<{diameter: L; slot?: readonly [L, L]; plated: boolean}> | null;
  stroke: L | null;
}>;
export type FeatureInput = Omit<PhysicalFeature<PhysicalLength>, 'rotation' | 'layers' | 'drill' | 'stroke'> & {
  rotation?: 0 | 90 | 180 | 270;
  layers?: readonly FootprintRole[];
  drill?: Readonly<{diameter: PhysicalLength; slot?: readonly [PhysicalLength, PhysicalLength]; plated: boolean}>;
  stroke?: PhysicalLength;
};
export type PhysicalFootprintInput = Readonly<{
  schemaVersion: 1 | typeof FOOTPRINT_SCHEMA_VERSION;
  key: string;
  features: readonly FeatureInput[];
}>;
export type PhysicalFootprint = Readonly<{
  schemaVersion: 1 | typeof FOOTPRINT_SCHEMA_VERSION;
  key: string;
  units: 'nm';
  features: readonly PhysicalFeature<number>[];
  bounds: Readonly<{min2: readonly [number, number]; max2: readonly [number, number]}>;
}>;
export type PlacedPhysicalFeature = Readonly<{
  geometry: PhysicalFeature<number>;
  layers: readonly string[];
}>;

/** Declare independent, explicit physical geometry; Rust performs authoritative checks. */
export function definePhysicalFootprint(input: Omit<PhysicalFootprintInput, 'schemaVersion'>): PhysicalFootprintInput {
  return freeze({schemaVersion: FOOTPRINT_SCHEMA_VERSION, ...structuredClone(input)});
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Compile explicit geometry, serialized layout intent, or JSX independently of a board. */
export async function compileFootprint(input: PhysicalFootprintInput | FootprintDeclarations | ReactNode, options: {cwd?: string; command?: readonly string[]} = {}): Promise<PhysicalFootprint> {
  const declaration = input !== null && typeof input === 'object' && ('schemaVersion' in input || 'protocolVersion' in input)
    ? input : await renderFootprintDeclarations(input as ReactNode);
  return runPhysical(declaration, 'footprint', options);
}

/** Convert old numeric coordinates only with explicit units and layer meaning. */
export async function migrateFootprint(input: FootprintDefinition, units: 'mm' | 'mil' | 'in', layerRoles: Readonly<Record<string, FootprintRole>>, options: {cwd?: string; command?: readonly string[]} = {}): Promise<PhysicalFootprint> {
  return runPhysical({footprint: {...input, resolved: true}, units, layerRoles}, 'migrate-footprint', options);
}

async function runPhysical(input: unknown, operation: string, options: {cwd?: string; command?: readonly string[]}): Promise<PhysicalFootprint> {
  const process = Bun.spawn([...(options.command ?? ['cargo', 'run', '--quiet', '-p', 'pcbir', '--', operation])], {
    cwd: options.cwd, stdin: new Blob([JSON.stringify(input)]), stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code !== 0) throw compilerError(stderr, code);
  return JSON.parse(stdout) as PhysicalFootprint;
}

/** Project authoritative compiled geometry to a standalone SVG inspection artifact. */
export async function footprintSvg(input: PhysicalFootprint, options: {cwd?: string; command?: readonly string[]} = {}): Promise<string> {
  const process = Bun.spawn([...(options.command ?? ['cargo', 'run', '--quiet', '-p', 'pcbir', '--', 'footprint-svg'])], {
    cwd: options.cwd, stdin: new Blob([JSON.stringify(input)]), stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code !== 0) throw compilerError(stderr, code);
  return stdout;
}
