import React from 'react';
import type {ReactNode} from 'react';

export type BoardProps = Children & {
  outline: Region;
  layers: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export function Board({children, ...props}: BoardProps) {
  return React.createElement('pcb-board', props, children);
}
