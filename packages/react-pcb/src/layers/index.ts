export type BoardSide = 'front' | 'back';
export type CopperUsage = 'signal' | 'plane' | 'mixed';

type Layer<Kind extends string> = Readonly<{kind: Kind; id: string}>;

export type CopperLayer = Layer<'copper'> & Readonly<{
  thickness: number;
  usage: CopperUsage;
}>;

export type DielectricLayer = Layer<'dielectric'> & Readonly<{
  material: string;
  thickness: number;
  epsilonR: number;
  lossTangent?: number;
}>;

export type SolderMaskLayer = Layer<'solder-mask'> & Readonly<{
  side: BoardSide;
  expansion?: number;
}>;

export type PasteLayer = Layer<'paste'> & Readonly<{side: BoardSide}>;
export type SilkscreenLayer = Layer<'silkscreen'> & Readonly<{
  side: BoardSide;
  color?: string;
}>;
export type MechanicalLayer = Layer<'mechanical'> & Readonly<{
  purpose: 'assembly' | 'courtyard' | 'fabrication' | 'other';
  side?: BoardSide;
}>;

export type StackupLayer = CopperLayer | DielectricLayer;
export type TechnicalLayer = SolderMaskLayer | PasteLayer | SilkscreenLayer | MechanicalLayer;
export type Stackup = Readonly<{
  kind: 'stackup';
  entries: readonly StackupLayer[];
}>;
export type LayerSet = Readonly<{
  kind: 'layer-set';
  stackup: Stackup;
  technical: readonly TechnicalLayer[];
}>;

export function copperLayer(
  options: Readonly<{id: string; thickness: number; usage?: CopperUsage}>,
): CopperLayer {
  assertName(options.id, 'layer ID', true);
  assertPositive(options.thickness, 'copper thickness');
  return Object.freeze({kind: 'copper', id: options.id, thickness: options.thickness, usage: options.usage ?? 'signal'});
}

export function dielectricLayer(
  options: Readonly<{id: string; material: string; thickness: number; epsilonR: number; lossTangent?: number}>,
): DielectricLayer {
  assertName(options.id, 'layer ID', true);
  assertPositive(options.thickness, 'dielectric thickness');
  assertPositive(options.epsilonR, 'dielectric epsilonR');
  if (options.lossTangent !== undefined) {
    assertNonNegative(options.lossTangent, 'dielectric lossTangent');
  }
  return Object.freeze({kind: 'dielectric', ...options});
}

export function solderMaskLayer(options: Readonly<{id: string; side: BoardSide; expansion?: number}>): SolderMaskLayer {
  if (options.expansion !== undefined) assertNonNegative(options.expansion, 'solder mask expansion');
  assertName(options.id, 'layer ID', true);
  return Object.freeze({kind: 'solder-mask', id: options.id, side: options.side, expansion: options.expansion});
}

export function pasteLayer(options: Readonly<{id: string; side: BoardSide}>): PasteLayer {
  assertName(options.id, 'layer ID', true);
  return Object.freeze({kind: 'paste', id: options.id, side: options.side});
}

export function silkscreenLayer(options: Readonly<{id: string; side: BoardSide; color?: string}>): SilkscreenLayer {
  assertName(options.id, 'layer ID', true);
  return Object.freeze({kind: 'silkscreen', id: options.id, side: options.side, color: options.color});
}

export function mechanicalLayer(
  options: Readonly<{id: string; purpose: MechanicalLayer['purpose']; side?: BoardSide}>,
): MechanicalLayer {
  assertName(options.id, 'layer ID', true);
  return Object.freeze({kind: 'mechanical', id: options.id, purpose: options.purpose, side: options.side});
}

export function defineStackup(entries: readonly StackupLayer[]): Stackup {
  if (entries.length === 0 || entries[0]?.kind !== 'copper' || entries.at(-1)?.kind !== 'copper') {
    throw new Error('a stackup must start and end with copper');
  }
  entries.forEach((entry, index) => {
    if (index > 0 && entry.kind === entries[index - 1]?.kind) throw new Error('stackup entries must alternate between copper and dielectric');
  });
  const copperLayerCount = entries.filter(entry => entry.kind === 'copper').length;
  if (copperLayerCount > 32) throw new Error('a stackup may contain at most 32 copper layers');
  return Object.freeze({kind: 'stackup', entries: Object.freeze([...entries])});
}

export function defineLayerSet(options: Readonly<{stackup: Stackup; technical?: readonly TechnicalLayer[]}>): LayerSet {
  const technical = options.technical ?? [];
  const ids = new Set<string>();
  for (const layer of [...options.stackup.entries, ...technical]) {
    assertName(layer.id, 'layer ID', true);
    if (ids.has(layer.id)) throw new Error(`duplicate layer ID ${layer.id}`);
    ids.add(layer.id);
  }
  return Object.freeze({kind: 'layer-set', stackup: options.stackup, technical: Object.freeze([...technical])});
}
import {assertName, assertNonNegative, assertPositive} from '../validation/index.ts';
