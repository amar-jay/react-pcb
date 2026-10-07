export type BoardSide = 'front' | 'back';
export type CopperRole = 'signal' | 'plane' | 'mixed';

type NamedLayer<Kind extends string> = Readonly<{kind: Kind; id: string; name: string}>;

export type CopperLayer = NamedLayer<'copper'> & Readonly<{
  thickness: number;
  role: CopperRole;
}>;

export type DielectricLayer = NamedLayer<'dielectric'> & Readonly<{
  material: string;
  thickness: number;
  epsilonR: number;
  lossTangent?: number;
}>;

export type SolderMaskLayer = NamedLayer<'solder-mask'> & Readonly<{
  side: BoardSide;
  expansion?: number;
}>;

export type PasteLayer = NamedLayer<'paste'> & Readonly<{side: BoardSide}>;
export type SilkscreenLayer = NamedLayer<'silkscreen'> & Readonly<{
  side: BoardSide;
  color?: string;
}>;
export type MechanicalLayer = NamedLayer<'mechanical'> & Readonly<{
  purpose: 'board-outline' | 'assembly' | 'courtyard' | 'fabrication' | 'other';
  side?: BoardSide;
}>;

export type StackupLayer = CopperLayer | DielectricLayer;
export type ArtworkLayer = SolderMaskLayer | PasteLayer | SilkscreenLayer | MechanicalLayer;
export type Stackup = Readonly<{
  kind: 'stackup';
  entries: readonly StackupLayer[];
  copperLayerCount: number;
}>;
export type LayerSet = Readonly<{
  kind: 'layer-set';
  stackup: Stackup;
  artwork: readonly ArtworkLayer[];
}>;

type LayerOptions = Readonly<{id?: string}>;

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function named<Kind extends string>(kind: Kind, name: string, id?: string): NamedLayer<Kind> {
  if (!name.trim()) throw new Error('layer name must not be empty');
  return {kind, id: id ?? name, name};
}

export function copperLayer(
  name: string,
  options: LayerOptions & Readonly<{thickness: number; role?: CopperRole}>,
): CopperLayer {
  positive(options.thickness, `${name} thickness`);
  return Object.freeze({...named('copper', name, options.id), thickness: options.thickness, role: options.role ?? 'signal'});
}

export function dielectricLayer(
  name: string,
  options: LayerOptions & Readonly<{material: string; thickness: number; epsilonR: number; lossTangent?: number}>,
): DielectricLayer {
  positive(options.thickness, `${name} thickness`);
  positive(options.epsilonR, `${name} epsilonR`);
  if (options.lossTangent !== undefined && options.lossTangent < 0) throw new Error(`${name} lossTangent must not be negative`);
  return Object.freeze({...named('dielectric', name, options.id), ...options, id: options.id ?? name});
}

export function solderMaskLayer(name: string, options: LayerOptions & Readonly<{side: BoardSide; expansion?: number}>): SolderMaskLayer {
  return Object.freeze({...named('solder-mask', name, options.id), side: options.side, expansion: options.expansion});
}

export function pasteLayer(name: string, options: LayerOptions & Readonly<{side: BoardSide}>): PasteLayer {
  return Object.freeze({...named('paste', name, options.id), side: options.side});
}

export function silkscreenLayer(name: string, options: LayerOptions & Readonly<{side: BoardSide; color?: string}>): SilkscreenLayer {
  return Object.freeze({...named('silkscreen', name, options.id), side: options.side, color: options.color});
}

export function mechanicalLayer(
  name: string,
  options: LayerOptions & Readonly<{purpose: MechanicalLayer['purpose']; side?: BoardSide}>,
): MechanicalLayer {
  return Object.freeze({...named('mechanical', name, options.id), purpose: options.purpose, side: options.side});
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
  return Object.freeze({kind: 'stackup', entries: Object.freeze([...entries]), copperLayerCount});
}

export function defineLayerSet(options: Readonly<{stackup: Stackup; artwork?: readonly ArtworkLayer[]}>): LayerSet {
  const artwork = options.artwork ?? [];
  const ids = [...options.stackup.entries, ...artwork].map(layer => layer.id);
  if (new Set(ids).size !== ids.length) throw new Error('layer ids must be unique');
  return Object.freeze({kind: 'layer-set', stackup: options.stackup, artwork: Object.freeze([...artwork])});
}
