import {expect, test} from 'bun:test';

import {copperLayer, dielectricLayer, solderMaskLayer} from '../layers/index.ts';
import {net, pad, part, point, rect} from '../model/index.ts';

test('rejects invalid geometry before rendering', () => {
  expect(() => point(Number.NaN, 0)).toThrow('point x must be finite');
  expect(() => rect(0, 0, 0, 10)).toThrow('rectangle width must be positive');
  expect(() => rect(0, 0, 10, -1)).toThrow('rectangle height must be positive');
});

test('rejects empty connectivity identifiers', () => {
  expect(() => net('   ')).toThrow('net name must be a non-empty name');
  expect(() => part('')).toThrow('part reference must be a non-empty name');
  expect(() => pad(part('U1'), '')).toThrow('pin name must be a non-empty name');
});

test('rejects non-finite and negative layer properties', () => {
  expect(() => copperLayer({thickness: Number.NaN})).toThrow('copper thickness must be positive');
  expect(() => dielectricLayer({
    material: 'FR-4', thickness: 1, epsilonR: 4.2, lossTangent: Number.NaN,
  })).toThrow('dielectric lossTangent must not be negative');
  expect(() => solderMaskLayer({side: 'front', expansion: -0.1})).toThrow(
    'solder mask expansion must not be negative',
  );
});
