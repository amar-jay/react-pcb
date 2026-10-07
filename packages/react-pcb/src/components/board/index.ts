import React from 'react';
import type {ReactNode} from 'react';
import type {LayerSet} from '../../layers.ts';

export type LengthUnit = 'mm' | 'mil' | 'in';

export type BoardProps = Children & {
  outline: Region;
  layers: LayerSet;
  units?: LengthUnit;
  metadata?: Readonly<Record<string, unknown>>;
};

export function Board({children, ...props}: BoardProps) {
  return React.createElement('pcb-board', props, children);
}
