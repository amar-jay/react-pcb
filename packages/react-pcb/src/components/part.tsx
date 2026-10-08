import React from 'react';

import type {BoardSide} from '../layers/index.ts';
import type {Net, Part as PartHandle} from '../model/index.ts';

export type PartProps = {
  id: PartHandle;
  definition?: unknown;
  mpn?: string;
  value?: string;
  footprint: string;
  at?: readonly [number, number];
  side?: BoardSide;
  rotation?: number;
  connect: Readonly<Record<string, Net>>;
};

export function Part(props: PartProps) {
  return React.createElement('pcb-part', props);
}
