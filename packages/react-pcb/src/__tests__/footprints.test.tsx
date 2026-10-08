import {expect, test} from 'bun:test';
import React from 'react';
import {compile, copperLayer, defineFootprint, defineLayerSet, definePart, defineStackup, part, net, Board, pasteLayer, rect, solderMaskLayer, PcbCompileError} from '../index.ts';
import {testLayers} from './fixtures.ts';

const footprint = defineFootprint({key: 'TEST-SMD', pads: [
  {id: '1', at: [-0.5, 0], shape: 'rect', size: [0.5, 0.6], layers: ['copper/1', 'solder-mask/front', 'paste/front']},
  {id: '2', at: [0.5, 0], shape: 'rect', size: [0.5, 0.6], layers: ['copper/1', 'solder-mask/front', 'paste/front']},
]});
const Device = definePart({manufacturer: 'Test', mpn: 'TEST', package: 'Example',
  datasheet: {url: 'https://example.com', document: 'Test'}, pinoutCoverage: 'complete',
  pins: {GND: {electricalType: 'passive', required: true}},
}, {footprint, pinMap: {GND: ['1', '2']}});

test('compiles reusable footprints and many-pad pin bindings end to end', async () => {
  const result = await compile(<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
    <Device id={part('J1')} at={[2, 3]} rotation={90} side="back" connect={{GND: net('GND')}} />
    <Device id={part('J2')} connect={{GND: net('GND')}} />
  </Board>, {cwd: import.meta.dir + '/../../../..'});
  const componentKey = 'part:["Test","TEST"]';
  expect(result.ir).toMatchObject({componentDefinitions: {[componentKey]: {pins: {GND: {electricalType: 'passive'}}}},
    footprintDefinitions: {'TEST-SMD': {resolved: true, pads: footprint.pads.map(pad => ({...pad, rotation: 0, drill: null}))}},
    parts: [{component: componentKey, footprint: 'TEST-SMD', pinMap: {GND: ['1', '2']}, padLayers: {'1': ['copper/2', 'paste/back', 'solder-mask/back'], '2': ['copper/2', 'paste/back', 'solder-mask/back']}, at: [2, 3], rotation: 90, side: 'back'},
      {component: componentKey, footprint: 'TEST-SMD'}]});
  expect(result.diagnostics).toEqual([]);
});

test('rejects a binding to a nonexistent physical pad through the compiler bridge', async () => {
  const BadDevice = definePart({manufacturer: 'Test', mpn: 'BAD', package: 'Example',
    datasheet: {url: 'https://example.com', document: 'Test'}, pinoutCoverage: 'partial',
    pins: {GND: {electricalType: 'passive'}},
  }, {footprint, pinMap: {GND: 'missing'}});
  try {
    await compile(<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
      <BadDevice id={part('J1')} connect={{GND: net('GND')}} />
    </Board>, {cwd: import.meta.dir + '/../../../..'});
    throw new Error('expected compilation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(PcbCompileError);
    expect((error as PcbCompileError).diagnostic.code).toBe('PCBIR026');
  }
});

test('accepts layer instances and serializes their assigned IDs', () => {
  const copper = copperLayer({thickness: 0.035});
  const mask = solderMaskLayer({side: 'front'});
  const paste = pasteLayer({side: 'front'});
  const defined = defineFootprint({key: 'LAYER-REFS', pads: [
    {id: '1', at: [0, 0], shape: 'rect', size: [1, 1], layers: [copper, mask, paste, {kind: 'all-copper'}]},
  ]});
  defineLayerSet({
    stackup: defineStackup([copper]),
    technical: [mask, paste],
  });
  expect(JSON.parse(JSON.stringify(defined.pads[0]?.layers))).toEqual([
    'copper/1', 'solder-mask/front', 'paste/front', {kind: 'all-copper'},
  ]);
  expect(defined.pads[0]?.layers[1]).toMatchObject({kind: 'solder-mask', side: 'front'});
  expect(() => defineFootprint({key: 'DUP', pads: [
    {id: '1', at: [0, 0], shape: 'rect', size: [1, 1], layers: [copper, copper]},
  ]})).toThrow('pad layers must be unique');
});

test('validates and snapshots footprint geometry', () => {
  expect(() => defineFootprint({key: 'BAD', pads: [{...footprint.pads[0]!, size: [0, 1]}]})).toThrow('pad size');
  expect(() => defineFootprint({key: 'BAD', pads: [footprint.pads[0]!, footprint.pads[0]!]})).toThrow('duplicate');
  expect(Object.isFrozen(footprint.pads[0]?.at)).toBe(true);
});
