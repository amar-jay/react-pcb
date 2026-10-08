import type {FootprintDeclarations} from './jsx.tsx';
import type {CopperLayerInput, PasteLayerInput, SolderMaskLayerInput} from '../layers/index.ts';
import type {PhysicalFootprint, PhysicalFootprintInput} from './physical.ts';
import {assertFinite, assertName, assertPositive} from '../validation/index.ts';

/** A board layer object, its ID, or an explicit selector for through-hole copper. */
export type PadLayer = string | Readonly<{kind: 'all-copper'}> | CopperLayerInput | SolderMaskLayerInput | PasteLayerInput;
export type FootprintPad = Readonly<{
  id: string;
  at: readonly [number, number];
  shape: 'rect' | 'circle' | 'oval';
  size: readonly [number, number];
  rotation?: number;
  layers: readonly PadLayer[];
  drill?: Readonly<{diameter: number; plated: boolean}>;
}>;
export type FootprintDefinition = Readonly<{
  key: string;
  pads: readonly FootprintPad[];
}>;
export type PinMap = Readonly<Record<string, string | readonly string[]>>;
export type FootprintBinding = Readonly<{
  footprint: FootprintDefinition | PhysicalFootprint | PhysicalFootprintInput | FootprintDeclarations | string;
  pinMap: PinMap;
}>;

export function defineFootprint(definition: FootprintDefinition): FootprintDefinition {
  assertName(definition.key, 'footprint key', true);
  if (!definition.pads.length) throw new Error('a footprint must contain pads');
  const ids = new Set<string>();
  const pads = definition.pads.map(pad => {
    assertName(pad.id, 'pad ID', true);
    if (ids.has(pad.id)) throw new Error(`duplicate footprint pad ${pad.id}`);
    ids.add(pad.id);
    if (pad.at.length !== 2 || pad.size.length !== 2) throw new Error('pad position and size must have two values');
    if (!['rect', 'circle', 'oval'].includes(pad.shape)) throw new Error('unsupported pad shape');
    pad.at.forEach(value => assertFinite(value, 'pad position'));
    pad.size.forEach(value => assertPositive(value, 'pad size'));
    if (pad.rotation !== undefined) assertFinite(pad.rotation, 'pad rotation');
    if (!pad.layers.length) throw new Error('a pad must target at least one layer');
    const seen = new Set<unknown>();
    const layers = pad.layers.map(layer => {
      const bound = bindPadLayer(layer);
      const key = typeof layer === 'string' ? layer : layer.kind === 'all-copper' ? layer.kind : layer;
      if (seen.has(key)) throw new Error('pad layers must be unique');
      seen.add(key);
      return bound;
    });
    if (pad.drill) assertPositive(pad.drill.diameter, 'drill diameter');
    return Object.freeze({...pad, at: Object.freeze([...pad.at]) as readonly [number, number],
      size: Object.freeze([...pad.size]) as readonly [number, number],
      layers: Object.freeze(layers),
      ...(pad.drill ? {drill: Object.freeze({...pad.drill})} : {})});
  });
  return Object.freeze({key: definition.key, pads: Object.freeze(pads)});
}

function bindPadLayer(layer: PadLayer): PadLayer {
  if (typeof layer === 'string') {
    assertName(layer, 'pad layer ID', true);
    return layer;
  }
  if (layer.kind === 'all-copper') return Object.freeze({kind: 'all-copper'});
  const source = layer;
  const {id: _id, ...rest} = source;
  return Object.freeze({
    ...rest,
    get id() {
      return source.id;
    },
    toJSON(): string {
      if (source.id === undefined) {
        throw new Error(`pad layer ${source.kind} has no ID; add it to the board layer set before compiling`);
      }
      return source.id;
    },
  });
}
