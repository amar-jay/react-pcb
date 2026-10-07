import React from 'react';
import type {ReactNode} from 'react';
import type {LayerSet} from '../../layers.ts';

export type BoardProps = Children & {
  outline: Region;
  layers: LayerSet;
  metadata?: Readonly<Record<string, unknown>>;
};

export function Board({children, ...props}: BoardProps) {
  return React.createElement('pcb-board', props, children);
}
