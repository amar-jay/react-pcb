import {Part as PartComponent} from './components/index.ts';
import type {Part as PartModel} from './model/index.ts';

export {Board, DifferentialPair, Keepout, Route, RouteThrough, Zone} from './components/index.ts';
export const Part = PartComponent;
export type Part = PartModel;
export type {
  BoardProps,
  DifferentialPairProps,
  KeepoutProps,
  LengthUnit,
  PartProps,
  RouteProps,
  RouteThroughProps,
  ZoneProps,
} from './components/index.ts';
export {compile} from './compiler/index.ts';
export type {CompileOptions} from './compiler/index.ts';
export {net, pad, part, point, rect} from './model/index.ts';
export type {Children, Net, Pin, Point, Rect, Region} from './model/index.ts';
export {definePart} from './parts/index.tsx';
export type {
  DatasheetSource,
  DefinedPartProps,
  ElectricalType,
  PartConnections,
  PartDefinition,
  PinDefinition,
} from './parts/index.tsx';
export {globalNet, Module, useNet, usePart} from './scope/index.tsx';
export type {ModuleProps} from './scope/index.tsx';
export {
  copperLayer,
  defineLayerSet,
  defineStackup,
  dielectricLayer,
  mechanicalLayer,
  pasteLayer,
  silkscreenLayer,
  solderMaskLayer,
} from './layers/index.ts';
export type {
  BoardSide,
  CopperLayer,
  CopperUsage,
  DielectricLayer,
  LayerSet,
  MechanicalLayer,
  PasteLayer,
  SilkscreenLayer,
  SolderMaskLayer,
  Stackup,
  StackupLayer,
  TechnicalLayer,
} from './layers/index.ts';
