import {expect, test} from 'bun:test';
import {compileFootprint, definePhysicalFootprint, footprintSvg} from '../index.ts';

const options = {cwd: import.meta.dir + '/../../../..'};
const declaration = definePhysicalFootprint({key: 'test:<&"', features: [
  {id: 'pad<&"', purpose: 'pad', at: ['-1nm', '2nm'], shape: {kind: 'rounded-rect', size: ['3nm', '5nm'], radius: '1nm'}, rotation: 90, layers: ['front-copper', 'front-mask'], drill: {diameter: '1nm', plated: true}},
  {id: 'hole', purpose: 'non-plated-hole', at: ['10nm', '0nm'], shape: {kind: 'circle', diameter: '3nm'}, drill: {diameter: '3nm', plated: false}},
]});

test('standalone compilation and projection are byte stable and preserve exact geometry', async () => {
  const ir = await compileFootprint(declaration, options);
  expect(JSON.stringify(await compileFootprint(declaration, options))).toBe(JSON.stringify(ir));
  const before = JSON.stringify(ir);
  const svg = await footprintSvg(ir, options);
  expect(await footprintSvg(ir, options)).toBe(svg);
  expect(await footprintSvg({...ir, features: [...ir.features].reverse().map(f => ({...f, layers: [...f.layers].reverse()}))}, options)).toBe(svg);
  expect(JSON.stringify(ir)).toBe(before);
  expect(ir.bounds).toEqual({min2: [-7, -3], max2: [23, 7]});
  expect(svg).toContain('width="0.000015mm" height="0.000005mm" viewBox="-7 -3 30 10"');
  expect(svg).toContain('data-footprint-key="test:&lt;&amp;&quot;"');
  expect(svg).toContain('<rect x="-3" y="-5" width="6" height="10" rx="2" ry="2"');
  expect(svg).toContain('transform="translate(-2 4) rotate(90)"');
  expect(svg.match(/data-feature-id="pad&lt;&amp;&quot;"/g)).toHaveLength(3);
  expect(svg).toContain('data-layer="front-mask"');
  expect(svg).toContain('data-plated="false" cx="20" cy="0" r="3"');
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
});

test('projection rejects corrupted canonical geometry and invalid XML identity characters', async () => {
  const ir = await compileFootprint(declaration, options);
  await expect(footprintSvg({...ir, bounds: {min2: [0, 0], max2: [1, 1]}}, options)).rejects.toThrow('bounds');
  await expect(footprintSvg({...ir, key: 'bad\u0000'}, options)).rejects.toThrow('valid XML');
});
