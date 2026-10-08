import {expect, test} from 'bun:test';
import React from 'react';
import {Board, Part, compile, compileFootprint, defineFootprint, definePhysicalFootprint, migrateFootprint, footprintLayer, part, net, rect} from '../index.ts';
import {testLayers} from './fixtures.ts';

const options = {cwd: import.meta.dir + '/../../../..', hideWarnings: true};
const definition = definePhysicalFootprint({key: 'physical:test', features: [
  {id: '1', purpose: 'pad', at: ['-0.5mm', '0.2mm'], shape: {kind: 'rounded-rect', size: ['0.6mm', '0.7mm'], radius: '0.1mm'},
    layers: [footprintLayer.frontCopper, footprintLayer.frontMask, footprintLayer.frontPaste]},
  {id: '2', purpose: 'pad', at: ['0.5mm', '0.2mm'], shape: {kind: 'rect', size: ['0.6mm', '0.7mm']}, layers: [footprintLayer.frontCopper]},
  {id: 'mount', purpose: 'non-plated-hole', at: ['0mm', '2mm'], shape: {kind: 'circle', diameter: '0.8mm'}, drill: {diameter: '0.8mm', plated: false}},
]});

test('independent physical compilation and per-part placement retain exact geometry', async () => {
  const standalone = await compileFootprint(definition, options);
  expect(standalone.units).toBe('nm');
  expect(standalone.features[0]?.at).toEqual([-500000,200000]);
  expect(standalone.features[0]?.shape).toEqual({kind: 'rounded-rect', size: [600000,700000], radius: 100000});
  const ground = net('GND');
  const result = await compile(<Board outline={rect(0,0,20,20)} layers={testLayers}>
    <Part id={part('J1')} footprint={standalone} at={[10,10]} rotation={90} connect={{1:ground}} />
    <Part id={part('J2')} footprint={definition} at={[10,10]} rotation={90} side="back" connect={{1:ground}} />
  </Board>, options);
  expect(result.ir.footprintDefinitions['physical:test']?.physical).toEqual(standalone);
  expect(result.ir.parts[0]?.physicalFeatures['1']?.geometry.at).toEqual([9800000,9500000]);
  expect(result.ir.parts[1]?.physicalFeatures['1']?.geometry.at).toEqual([9800000,10500000]);
  expect(result.ir.parts[1]?.padLayers['1']).toEqual(['copper/2','paste/back','solder-mask/back']);
  expect(result.ir.parts[1]?.physicalFeatures['mount']?.layers).toEqual([]);
  expect(result.diagnostics).toEqual([]);
});

test('sub-nanometre inputs and duplicate identities reject through the Rust bridge', async () => {
  const invalid = definePhysicalFootprint({key: 'invalid', features: [
    {id:'1', purpose:'pad', at:['0.1nm','0mm'], shape:{kind:'circle',diameter:'1mm'},layers:['front-copper']},
  ]});
  await expect(compileFootprint(invalid, options)).rejects.toThrow('finer than one nanometre');
  await expect(compileFootprint({...definition, features:[definition.features[0]!, definition.features[0]!]}, options)).rejects.toThrow('unique');
});

test('legacy migration requires layer meaning and preserves feature identities', async () => {
  const legacy = defineFootprint({key: 'legacy:pad', pads: [
    {id:'P', at:[0,0], size:[10,20], shape:'rect', layers:['external-top']},
  ]});
  await expect(migrateFootprint(legacy,'mil',{},options)).rejects.toThrow('explicit semantic role required');
  const migrated = await migrateFootprint(legacy,'mil',{'external-top':'front-copper'},options);
  expect(migrated.features[0]?.id).toBe('P');
  expect(migrated.features[0]?.shape).toEqual({kind:'rect',size:[254000,508000]});
  const result = await compile(<Board outline={rect(0,0,1000,1000)} units="mil" layers={testLayers}>
    <Part id={part('J1')} at={[100,200]} footprint={migrated} connect={{P:net('GND')}} />
  </Board>,options);
  expect(result.ir.parts[0]?.physicalFeatures['P']?.geometry.at).toEqual([2540000,5080000]);
});
