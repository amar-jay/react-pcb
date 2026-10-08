import {defineFootprint, definePart} from '@react-pcb/core';
import {smd} from '../layers.ts';
import {datasheet, passivePins} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:0402',
  pads: [
    {id: '1', at: [-0.5, 0], shape: 'rect', size: [0.5, 0.6], layers: smd},
    {id: '2', at: [0.5, 0], shape: 'rect', size: [0.5, 0.6], layers: smd},
  ],
});

export const Capacitor = definePart({
  manufacturer: 'Generic',
  mpn: 'CAP-PASSIVE',
  package: 'two-terminal',
  datasheet: datasheet('cap'),
  pinoutCoverage: 'complete',
  pins: passivePins,
}, {footprint, pinMap: {1: '1', 2: '2'}});
