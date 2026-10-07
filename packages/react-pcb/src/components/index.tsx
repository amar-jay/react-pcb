import React, {type ReactNode} from 'react';
import type {CopperLayer} from '../layers.ts';

export type PartProps = {
  id: Part;
  definition?: unknown;
  mpn?: string;
  value?: string;
  footprint: string;
  at?: readonly [number, number];
  connect: Readonly<Record<string, Net>>;
};
export function Part(props: PartProps) {
  return React.createElement('pcb-part', props);
}

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


export { Board, type BoardProps } from './board';
