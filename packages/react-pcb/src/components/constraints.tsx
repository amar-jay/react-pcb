import React from 'react';

import type {CopperLayer} from '../layers/index.ts';
import type {Net, Region} from '../model/index.ts';

export type ZoneProps = {
  net: Net;
  layers: readonly CopperLayer[];
  boundary: Region | 'board';
  clearance?: number;
};
export function Zone(props: ZoneProps) {
  return React.createElement('pcb-zone', props);
}

export type KeepoutProps = {
  region: Region;
  disallow: readonly ('components' | 'copper' | 'tracks' | 'vias')[];
  except?: readonly Net[];
};
export function Keepout(props: KeepoutProps) {
  return React.createElement('pcb-keepout', props);
}
