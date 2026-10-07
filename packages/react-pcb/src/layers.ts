export type BoardSide = 'front' | 'back';
export type CopperRole = 'signal' | 'plane' | 'mixed';

type Layer<Kind extends string> = Readonly<{kind: Kind}>;

export type CopperLayer = Layer<'copper'> & Readonly<{
  thickness: number;
  role: CopperRole;
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

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
}

export function copperLayer(
  options: Readonly<{thickness: number; role?: CopperRole}>,
): CopperLayer {
  positive(options.thickness, 'copper thickness');
  return Object.freeze({kind: 'copper', thickness: options.thickness, role: options.role ?? 'signal'});
}

export function dielectricLayer(
  options: Readonly<{material: string; thickness: number; epsilonR: number; lossTangent?: number}>,
): DielectricLayer {
  positive(options.thickness, 'dielectric thickness');
  positive(options.epsilonR, 'dielectric epsilonR');
  if (options.lossTangent !== undefined && options.lossTangent < 0) throw new Error('dielectric lossTangent must not be negative');
  return Object.freeze({kind: 'dielectric', ...options});
}

export function solderMaskLayer(options: Readonly<{side: BoardSide; expansion?: number}>): SolderMaskLayer {
  return Object.freeze({kind: 'solder-mask', side: options.side, expansion: options.expansion});
}

export function pasteLayer(options: Readonly<{side: BoardSide}>): PasteLayer {
  return Object.freeze({kind: 'paste', side: options.side});
}

export function silkscreenLayer(options: Readonly<{side: BoardSide; color?: string}>): SilkscreenLayer {
  return Object.freeze({kind: 'silkscreen', side: options.side, color: options.color});
}

export function mechanicalLayer(
  options: Readonly<{purpose: MechanicalLayer['purpose']; side?: BoardSide}>,
): MechanicalLayer {
  return Object.freeze({kind: 'mechanical', purpose: options.purpose, side: options.side});
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
  return Object.freeze({kind: 'layer-set', stackup: options.stackup, technical: Object.freeze([...technical])});
}
