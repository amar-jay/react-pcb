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
export {compile, formatDiagnostic, PcbCompileError} from './compiler/index.ts';
export type {
  CompileOptions,
  CompileResult,
  CompilerDiagnostic,
  DiagnosticSeverity,
} from './compiler/index.ts';
export {PCB_IR_SCHEMA_VERSION} from './ir/index.ts';
export type {
  BoardIr,
  IrComponentDefinition,
  IrDifferentialPair,
  IrFootprintDefinition,
  IrFootprintPad,
  IrKeepout,
  IrLayerSet,
  IrNet,
  IrPart,
  IrPinDefinition,
  IrPinRef,
  IrRegion,
  IrRouteConstraint,
  IrStackupLayer,
  IrTechnicalLayer,
  IrZone,
} from './ir/index.ts';
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

export {defineFootprint} from './footprints/index.ts';
export type {FootprintDefinition, FootprintPad, FootprintBinding, PadLayer, PinMap} from './footprints/index.ts';
