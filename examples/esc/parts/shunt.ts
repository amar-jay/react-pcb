import {defineFootprint, definePart} from '@react-pcb/core';
import {smd} from '../layers.ts';
import {datasheet, passivePins} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:2512',
  pads: [
    {id: '1', at: [-1.6, 0], shape: 'rect', size: [1.2, 3.2], layers: smd},
    {id: '2', at: [1.6, 0], shape: 'rect', size: [1.2, 3.2], layers: smd},
  ],
});

export const Shunt = definePart({
  manufacturer: 'Generic',
  mpn: 'SHUNT-2512',
  package: '2512',
  datasheet: datasheet('shunt'),
  pinoutCoverage: 'complete',
  pins: passivePins,
}, {footprint, pinMap: {1: '1', 2: '2'}});
