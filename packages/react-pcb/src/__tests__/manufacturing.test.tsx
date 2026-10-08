import {expect, test} from 'bun:test';
import React from 'react';
import {Board, Part, PcbCompileError, compile, compileFootprint, definePhysicalFootprint, footprintSvg, net, part, rect,
  validateFootprintManufacturing, type ManufacturingProfileInput, type ManufacturingReport, type PhysicalFootprint} from '../index.ts';
import {ManufacturingPassive, inspectionProfile} from '../../../../examples/footprints/manufacturing.tsx';
import {GridPinHeader} from '../../../../examples/footprints/grid.tsx';
import {testLayers} from './fixtures.ts';

const options = {cwd: import.meta.dir + '/../../../..', hideWarnings: true};
const status = (report: ManufacturingReport, id: string) => report.checks.find(c => c.id === id)!;
const tinyProfile: ManufacturingProfileInput = {schemaVersion: 1, key: 'test:exact', minCopperFeature: '1nm', minCopperSpacing: '0nm', minDrillDiameter: '1nm', minAnnularRing: '0nm'};

async function passive() { return compileFootprint(<ManufacturingPassive />, options); }

test('selected manufacturing rules pass while retaining limits, scope, identity and geometry', async () => {
  const ir = await passive();
  const original = JSON.stringify(ir);
  const svg = await footprintSvg(ir, options);
  const report = await validateFootprintManufacturing(ir, inspectionProfile, options);
  expect(report.conformsToCheckedRules).toBe(true);
  expect(report.complete).toBe(false);
  expect(report.profile).toMatchObject({key: inspectionProfile.key, units: 'nm', minMaskExpansion: 50000, minCopperSpacing: 150000});
  for (const rule of ['copper-feature', 'copper-spacing', 'mask-expansion', 'mask-web', 'paste-feature', 'paste-containment', 'courtyard-clearance']) {
    expect(status(report, rule).status).toBe('passed');
  }
  expect(status(report, 'drill-diameter').status).toBe('not-applicable');
  expect(status(report, 'unverified').status).toBe('skipped');
  expect(status(report, 'unverified').diagnostics.some(d => d.message.includes('land-pattern'))).toBe(true);
  expect(JSON.stringify(ir)).toBe(original);
  expect(await footprintSvg(ir, options)).toBe(svg);
  const reordered = {...ir, features: [...ir.features].toReversed()};
  expect(JSON.stringify(await validateFootprintManufacturing(reordered, inspectionProfile, options))).toBe(JSON.stringify(report));
  expect(await validateFootprintManufacturing(JSON.parse(original), inspectionProfile, options)).toEqual(report);
});

test('each selected minimum has exact threshold failures with the implicated feature ID', async () => {
  const ir = await passive();
  const cases: [Partial<ManufacturingProfileInput>, Partial<ManufacturingProfileInput>, string][] = [
    [{minCopperFeature: '0.6mm'}, {minCopperFeature: '0.600001mm'}, 'copper-feature'],
    [{minCopperSpacing: '0.4mm'}, {minCopperSpacing: '0.400001mm'}, 'copper-spacing'],
    [{minMaskExpansion: '0.05mm'}, {minMaskExpansion: '0.050001mm'}, 'mask-expansion'],
    [{minMaskWeb: '0.3mm'}, {minMaskWeb: '0.300001mm'}, 'mask-web'],
    [{minPasteFeature: '0.5mm'}, {minPasteFeature: '0.500001mm'}, 'paste-feature'],
    [{minCourtyardClearance: '0.2mm'}, {minCourtyardClearance: '0.200001mm'}, 'courtyard-clearance'],
  ];
  for (const [boundary, patch, rule] of cases) {
    const equal = await validateFootprintManufacturing(ir, {...inspectionProfile, ...boundary}, options);
    expect(equal.conformsToCheckedRules).toBe(true);
    expect(status(equal, rule).status).toBe('passed');
    const report = await validateFootprintManufacturing(ir, {...inspectionProfile, ...patch}, options);
    expect(report.conformsToCheckedRules).toBe(false);
    expect(status(report, rule).status).toBe('failed');
    expect(status(report, rule).diagnostics[0]?.code).toBe('PCBMFG002');
    expect(status(report, rule).diagnostics[0]?.entity).toStartWith(ir.key + '/');
    expect(status(report, rule).diagnostics[0]?.help).toContain(rule);
  }
});

test('round and slotted drills check tool size and exact annular containment', async () => {
  const ir = await compileFootprint(<GridPinHeader />, options);
  const policy = {...inspectionProfile, minMaskExpansion: '0mm' as const, minAnnularRing: '0.4mm' as const};
  expect(status(await validateFootprintManufacturing(ir, policy, options), 'annular-ring').status).toBe('passed');
  expect(status(await validateFootprintManufacturing(ir, {...policy, minAnnularRing: '0.400001mm'}, options), 'annular-ring').status).toBe('failed');
  expect(status(await validateFootprintManufacturing(ir, {...policy, minDrillDiameter: '0.800001mm'}, options), 'drill-diameter').status).toBe('failed');
  const slot = await compileFootprint(definePhysicalFootprint({key: 'test:slot', features: [
    {id: 'S', purpose: 'pad', at: ['0mm', '0mm'], rotation: 90, shape: {kind: 'oval', size: ['1mm', '2.1mm']}, layers: ['all-copper'],
      drill: {diameter: '0.6mm', slot: ['0.6mm', '1.7mm'], plated: true}},
  ]}), options);
  expect(status(await validateFootprintManufacturing(slot, {...policy, minAnnularRing: '0.2mm'}, options), 'annular-ring').status).toBe('passed');
  expect(status(await validateFootprintManufacturing(slot, {...policy, minAnnularRing: '0.200001mm'}, options), 'annular-ring').status).toBe('failed');
});

test('curved primitive spacing uses exact Euclidean distances rather than envelopes', async () => {
  const ir = await compileFootprint(definePhysicalFootprint({key: 'test:diagonal', features: [
    {id: 'A', purpose: 'pad', at: ['0nm', '0nm'], shape: {kind: 'circle', diameter: '2nm'}, layers: ['front-copper']},
    {id: 'B', purpose: 'pad', at: ['3nm', '4nm'], shape: {kind: 'circle', diameter: '2nm'}, layers: ['front-copper']},
  ]}), options);
  expect(status(await validateFootprintManufacturing(ir, {...tinyProfile, minCopperSpacing: '3nm'}, options), 'copper-spacing').status).toBe('passed');
  expect(status(await validateFootprintManufacturing(ir, {...tinyProfile, minCopperSpacing: '4nm'}, options), 'copper-spacing').status).toBe('failed');
  const differentLayers = structuredClone(ir) as unknown as {features: {layers: string[]}[]};
  differentLayers.features[1]!.layers = ['back-copper'];
  expect(status(await validateFootprintManufacturing(differentLayers as unknown as PhysicalFootprint, {...tinyProfile, minCopperSpacing: '9nm'}, options), 'copper-spacing').status).toBe('not-applicable');
});

test('explicit mask openings supersede contained nominal apertures and shared openings cannot hide missing web', async () => {
  const ir = await passive();
  const withNominal = structuredClone(ir) as {features: {id: string; layers: string[]}[]} & PhysicalFootprint;
  for (const pad of withNominal.features.filter(f => ['1', '2'].includes(f.id))) pad.layers.push('front-mask');
  expect(status(await validateFootprintManufacturing(withNominal, inspectionProfile, options), 'mask-web').status).toBe('passed');
  const shared = await compileFootprint(definePhysicalFootprint({key: 'test:shared-mask', features: [
    {id: '1', purpose: 'pad', at: ['-0.5mm', '0mm'], shape: {kind: 'rect', size: ['0.6mm', '0.7mm']}, layers: ['front-copper']},
    {id: '2', purpose: 'pad', at: ['0.5mm', '0mm'], shape: {kind: 'rect', size: ['0.6mm', '0.7mm']}, layers: ['front-copper']},
    {id: 'shared', purpose: 'mask-opening', at: ['0mm', '0mm'], shape: {kind: 'rect', size: ['1.7mm', '0.8mm']}, layers: ['front-mask']},
  ]}), options);
  const report = await validateFootprintManufacturing(shared, inspectionProfile, options);
  expect(status(report, 'mask-expansion').status).toBe('passed');
  expect(status(report, 'mask-web').status).toBe('failed');
  expect(status(report, 'mask-web').diagnostics[0]?.message).toContain('multiple pads');
});

test('paste containment catches curved corners, wrong-side and orphan apertures', async () => {
  for (const [at, layer] of [[['0nm', '0nm'], 'front-paste'], [['0nm', '0nm'], 'back-paste'], [['20nm', '0nm'], 'front-paste']] as const) {
    const ir = await compileFootprint(definePhysicalFootprint({key: 'paste', features: [
      {id: 'P', purpose: 'pad', at: ['0nm', '0nm'], shape: {kind: 'circle', diameter: '10nm'}, layers: ['front-copper']},
      {id: 'opening', purpose: 'paste-opening', at, shape: {kind: 'rect', size: ['8nm', '8nm']}, layers: [layer]},
    ]}), options);
    expect(status(await validateFootprintManufacturing(ir, tinyProfile, options), 'paste-containment').status).toBe('failed');
  }
});

test('courtyards include odd-width fabrication strokes without rounding and report absent outlines', async () => {
  const ir = await compileFootprint(definePhysicalFootprint({key: 'odd-stroke', features: [
    {id: 'body', purpose: 'fabrication', at: ['0nm', '0nm'], shape: {kind: 'rect', size: ['4nm', '4nm']}, layers: ['front-fabrication'], stroke: '1nm'},
    {id: 'court', purpose: 'courtyard', at: ['0nm', '0nm'], shape: {kind: 'rect', size: ['7nm', '7nm']}, layers: ['front-courtyard'], stroke: '1nm'},
  ]}), options);
  expect(status(await validateFootprintManufacturing(ir, {...tinyProfile, minCourtyardClearance: '1nm'}, options), 'courtyard-clearance').status).toBe('passed');
  expect(status(await validateFootprintManufacturing(ir, {...tinyProfile, minCourtyardClearance: '2nm'}, options), 'courtyard-clearance').status).toBe('failed');
  const header = await compileFootprint(<GridPinHeader />, options);
  expect(status(await validateFootprintManufacturing(header, inspectionProfile, options), 'courtyard-clearance').status).toBe('skipped');
});

test('malformed profiles and incomplete or corrupted physical definitions fail explicitly', async () => {
  const ir = await passive();
  for (const patch of [{minCopperFeature: '0mm'}, {minCopperSpacing: '-1nm'}, {minMaskWeb: '0.1nm'}, {minDrillDiameter: '1px'},
    {schemaVersion: 2}, {minCopperSpacing: '9007199254740992nm'}, {unexpected: '1mm'}, {key: '  '}]) {
    await expect(validateFootprintManufacturing(ir, {...inspectionProfile, ...patch} as ManufacturingProfileInput, options))
      .rejects.toMatchObject({diagnostic: {code: 'PCBMFG001'}});
  }
  await expect(validateFootprintManufacturing(ir, {} as ManufacturingProfileInput, options))
    .rejects.toMatchObject({diagnostic: {code: 'PCBMFG001'}});
  const duplicate = {...ir, features: [...ir.features, ir.features[0]!]};
  await expect(validateFootprintManufacturing(duplicate, inspectionProfile, options)).rejects.toThrow('unique');
  await expect(validateFootprintManufacturing({...ir, features: []}, inspectionProfile, options)).rejects.toThrow('requires physical features');
  await expect(validateFootprintManufacturing({...ir, bounds: {min2: [0, 0], max2: [1, 1]}}, inspectionProfile, options)).rejects.toThrow('bounds');
  const missingDrill = await compileFootprint(definePhysicalFootprint({key: 'test:hole', features: [
    {id: 'H', purpose: 'non-plated-hole', at: ['0nm', '0nm'], shape: {kind: 'circle', diameter: '8nm'}, drill: {diameter: '8nm', plated: false}},
  ]}), options);
  const bad = {...missingDrill, features: missingDrill.features.map(f => ({...f, drill: null}))};
  await expect(validateFootprintManufacturing(bad, tinyProfile, options)).rejects.toThrow('hole requires drill geometry');
  for (const patch of [{shape: {kind: 'rect', size: [0, 700000]}}, {layers: ['front-silkscreen']}, {layers: []}]) {
    const badFeature = {...ir, features: [{...ir.features[0], ...patch}, ...ir.features.slice(1)]};
    await expect(validateFootprintManufacturing(badFeature as PhysicalFootprint, inspectionProfile, options))
      .rejects.toMatchObject({diagnostic: {code: 'PCBFP001', entity: ir.key + '/1'}});
  }
});

test('board profile enforces checked rules, preserves its normalized policy and reports unresolved footprints', async () => {
  const declaration = await compileFootprint(<ManufacturingPassive />, options);
  const board = (profile: ManufacturingProfileInput, footprint: typeof declaration | string = declaration) =>
    <Board outline={rect(0, 0, 20, 20)} layers={testLayers} manufacturingProfile={profile}>
      <Part id={part('C1')} footprint={footprint} connect={{1: net('GND')}} />
    </Board>;
  const simple = await compileFootprint(definePhysicalFootprint({key: 'board-pad', features: [
    {id: '1', purpose: 'pad', at: ['0mm', '0mm'], shape: {kind: 'rect', size: ['0.6mm', '0.7mm']}, layers: ['front-copper', 'front-mask', 'front-paste']},
  ]}), options);
  const policy = {...inspectionProfile, minMaskExpansion: '0mm' as const};
  const result = await compile(board(policy, simple), options);
  expect(result.ir.board.manufacturingProfile).toMatchObject({key: policy.key, units: 'nm', minCopperFeature: 150000});
  expect(JSON.parse(JSON.stringify(result.ir)).board.manufacturingProfile).toEqual(result.ir.board.manufacturingProfile);
  expect(result.manufacturingReports['board-pad']?.conformsToCheckedRules).toBe(true);
  expect(result.diagnostics.some(d => d.code === 'PCBMFG003')).toBe(true);
  try {
    await compile(board({...policy, minCopperFeature: '1mm'}, simple), options);
    throw new Error('expected manufacturing failure');
  } catch (error) {
    expect(error).toBeInstanceOf(PcbCompileError);
    expect((error as PcbCompileError).diagnostic.code).toBe('PCBMFG002');
    expect((error as PcbCompileError).diagnostics.some(d => d.code === 'PCBMFG003')).toBe(true);
  }
  const unresolved = await compile(board(policy, 'not-loaded'), options);
  expect(unresolved.manufacturingReports).toEqual({});
  expect(unresolved.diagnostics.some(d => d.message.includes('manufacturing checks were skipped'))).toBe(true);
});

test('basic example is a required end-to-end check with physical geometry and explicit manufacturing reports', async () => {
  const process = Bun.spawn(['bun', 'run', 'examples/basic.tsx'], {cwd: options.cwd, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  expect(code, stderr || stdout).toBe(0);
  const result = JSON.parse(stdout) as Awaited<ReturnType<typeof compile>>;
  expect(result.ir.schemaVersion).toBe(2);
  expect(Object.keys(result.manufacturingReports)).toHaveLength(3);
  expect(Object.values(result.ir.footprintDefinitions).every(f => f.physical !== null)).toBe(true);
  expect(result.ir.parts.every(p => Object.keys(p.physicalFeatures).length > 0)).toBe(true);
  expect(Object.values(result.manufacturingReports).every(r => r.conformsToCheckedRules && !r.complete)).toBe(true);
  expect(result.diagnostics.every(d => d.severity === 'warning')).toBe(true);
});
