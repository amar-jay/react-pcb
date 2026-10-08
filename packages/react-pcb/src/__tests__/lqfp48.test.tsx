import {expect, test} from 'bun:test';
import React from 'react';
import {Board, compile, compileFootprint, defineLayerSet, footprintSvg, mechanicalLayer, net, part, rect, silkscreenLayer} from '../index.ts';
import {LQFP48Footprint, LQFP48_FOOTPRINT_KEY} from '../../../../examples/footprints/LQFP48.tsx';
import {STM32G0B1CBT6} from '../../../../examples/parts/STM32G0B1CBT6.ts';
import {testLayers} from './fixtures.ts';

const options = {cwd: import.meta.dir + '/../../../..', hideWarnings: true};
const layers = defineLayerSet({stackup: testLayers.stackup, technical: [
  ...testLayers.technical,
  ...(['front', 'back'] as const).flatMap(side => [silkscreenLayer({side}),
    mechanicalLayer({purpose: 'fabrication', side}), mechanicalLayer({purpose: 'courtyard', side})]),
]});

test('LQFP48 follows ST Figure 44 dimensions and counterclockwise pin numbering', async () => {
  const ir = await compileFootprint(<LQFP48Footprint />, options);
  expect(ir.key).toBe(LQFP48_FOOTPRINT_KEY);
  const pads = ir.features.filter(f => f.purpose === 'pad');
  expect(pads).toHaveLength(48);
  expect(new Set(pads.map(p => p.id)).size).toBe(48);
  // Independent side sequences from the component-side drawing, in nm.
  const positions = [-2750000, -2250000, -1750000, -1250000, -750000, -250000,
    250000, 750000, 1250000, 1750000, 2250000, 2750000];
  for (const [start, centers, size] of [
    [1, positions.map(y => [-4250000, y]), [1200000, 300000]],
    [13, positions.map(x => [x, 4250000]), [300000, 1200000]],
    [25, positions.toReversed().map(y => [4250000, y]), [1200000, 300000]],
    [37, positions.toReversed().map(x => [x, -4250000]), [300000, 1200000]],
  ] as const) {
    centers.forEach((at, index) => expect(pads.find(p => p.id === String(start + index))).toMatchObject({
      at, shape: {kind: 'rect', size}, rotation: 0, drill: null,
      layers: ['front-copper', 'front-mask', 'front-paste'],
    }));
  }
  expect(ir.features.find(f => f.id === 'body')?.shape).toEqual({kind: 'rect', size: [7000000, 7000000]});
  expect(ir.features.find(f => f.id === 'pin-1-silkscreen')?.at).toEqual([-4250000, -3450000]);
  expect(ir.bounds).toEqual({min2: [-10250000, -10250000], max2: [10250000, 10250000]});
  expect(ir.features.every(f => f.drill === null)).toBe(true);
  const svg = await footprintSvg(ir, options);
  expect(await footprintSvg(await compileFootprint(<LQFP48Footprint />, options), options)).toBe(svg);
});

test('STM32 pin bindings and footprint realization work on both board sides', async () => {
  const connect = {'VDD/VDDA': net('VDD'), 'VSS/VSSA': net('GND'), PA11: net('D-'), PA12: net('D+')};
  const result = await compile(<Board layers={layers} outline={rect(0, 0, 30, 30)}>
    <STM32G0B1CBT6 id={part('U1')} at={[10, 10]} rotation={90} connect={connect} />
    <STM32G0B1CBT6 id={part('U2')} at={[20, 10]} rotation={90} side="back" connect={connect} />
  </Board>, options);
  expect(result.diagnostics).toEqual([]);
  expect(Object.keys(result.ir.footprintDefinitions)).toEqual([LQFP48_FOOTPRINT_KEY]);
  expect(result.ir.footprintDefinitions[LQFP48_FOOTPRINT_KEY]?.pads).toHaveLength(48);
  const [front, back] = result.ir.parts;
  expect(front?.pinMap).toEqual({'VDD/VDDA': ['6'], 'VSS/VSSA': ['7'], PA11: ['33'], PA12: ['34']});
  expect(front?.physicalFeatures['1']?.geometry.at).toEqual([12750000, 5750000]);
  expect(back?.physicalFeatures['1']?.geometry.at).toEqual([22750000, 14250000]);
  expect(back?.padLayers['1']).toEqual(['copper/2', 'paste/back', 'solder-mask/back']);
  expect(Object.keys(front!.physicalFeatures).length).toBeGreaterThan(48);
});
