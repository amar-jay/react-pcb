import React from 'react';

import type {Children, Net, Pin, Region} from '../model/index.ts';

export type RouteProps = Children & {net: Net; from: Pin; to: Pin; width?: number};
export function Route({children, ...props}: RouteProps) {
  return React.createElement('pcb-route', props, children);
}

export type RouteThroughProps = {region: Region};
export function RouteThrough(props: RouteThroughProps) {
  return React.createElement('pcb-route-through', props);
}

export type DifferentialPairProps = Children & {
  positive: Net;
  negative: Net;
  width?: number;
  gap?: number;
  targetImpedance?: number;
  from: readonly [Pin, Pin];
  to: readonly [Pin, Pin];
};
export function DifferentialPair({children, ...props}: DifferentialPairProps) {
  return React.createElement('pcb-differential-pair', props, children);
}
