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

type CopperLayerOptions = Readonly<{id?: string; thickness: number; usage?: CopperUsage}>;
type DielectricLayerOptions = Readonly<{
  id?: string;
  material: string;
  thickness: number;
  epsilonR: number;
  lossTangent?: number;
}>;
export type CopperLayerInput = Omit<CopperLayer, 'id'> & Readonly<{id?: string}>;
export type DielectricLayerInput = Omit<DielectricLayer, 'id'> & Readonly<{id?: string}>;
export type StackupLayerInput = CopperLayerInput | DielectricLayerInput;

export function copperLayer(options: CopperLayerOptions & Readonly<{id: string}>): CopperLayer;
export function copperLayer(options: CopperLayerOptions): CopperLayerInput;
export function copperLayer(options: CopperLayerOptions): CopperLayerInput {
  if (options.id !== undefined) assertName(options.id, 'layer ID', true);
  assertPositive(options.thickness, 'copper thickness');
  return {
    kind: 'copper',
    ...(options.id === undefined ? {} : {id: options.id}),
    thickness: options.thickness,
    usage: options.usage ?? 'signal',
  };
}

export function dielectricLayer(options: DielectricLayerOptions & Readonly<{id: string}>): DielectricLayer;
export function dielectricLayer(options: DielectricLayerOptions): DielectricLayerInput;
export function dielectricLayer(options: DielectricLayerOptions): DielectricLayerInput {
  if (options.id !== undefined) assertName(options.id, 'layer ID', true);
  assertPositive(options.thickness, 'dielectric thickness');
  assertPositive(options.epsilonR, 'dielectric epsilonR');
  if (options.lossTangent !== undefined) {
    assertNonNegative(options.lossTangent, 'dielectric lossTangent');
  }
  const {id, ...rest} = options;
  return {kind: 'dielectric', ...rest, ...(id === undefined ? {} : {id})};
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

export function defineStackup(entries: readonly StackupLayerInput[]): Stackup {
  if (entries.length === 0 || entries[0]?.kind !== 'copper' || entries.at(-1)?.kind !== 'copper') {
    throw new Error('a stackup must start and end with copper');
  }
  entries.forEach((entry, index) => {
    if (index > 0 && entry.kind === entries[index - 1]?.kind) throw new Error('stackup entries must alternate between copper and dielectric');
  });
  const counts = {copper: 0, dielectric: 0};
  const identified = entries.map(entry => {
    const position = ++counts[entry.kind];
    const id = entry.id ?? `${entry.kind}/${position}`;
    assertName(id, 'layer ID', true);
	  return {entry, id};
  });
  if (counts.copper > 32) throw new Error('a stackup may contain at most 32 copper layers');
  const ids = new Set<string>();
  for (const {id} of identified) {
    if (ids.has(id)) throw new Error(`duplicate layer ID ${id}`);
    ids.add(id);
  }
  const layers = identified.map(({entry, id}): StackupLayer => {
    const layer = entry as {id?: string};
    if (layer.id === undefined) layer.id = id;
    return Object.freeze(entry) as StackupLayer;
  });
  return Object.freeze({kind: 'stackup', entries: Object.freeze(layers)});
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
