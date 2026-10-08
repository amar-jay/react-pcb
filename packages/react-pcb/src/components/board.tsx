import React from 'react';
import type {ManufacturingProfileInput} from '../footprints/manufacturing.ts';

import type {LayerSet} from '../layers/index.ts';
import type {Children, Region} from '../model/index.ts';

export type LengthUnit = 'mm' | 'mil' | 'in';
export type BoardProps = Children & {
  outline: Region;
  layers: LayerSet;
  units?: LengthUnit;
  manufacturingProfile?: ManufacturingProfileInput;
  metadata?: Readonly<Record<string, unknown>>;
};

export function Board({children, ...props}: BoardProps) {
  return React.createElement('pcb-board', props, children);
}
