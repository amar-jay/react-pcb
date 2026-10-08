import {defineFootprint, definePart} from '@react-pcb/core';
import {smd} from '../layers.ts';
import {datasheet, passivePins} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:1210',
  pads: [
    {id: '1', at: [-1.6, 0], shape: 'rect', size: [1.0, 1.4], layers: smd},
    {id: '2', at: [1.6, 0], shape: 'rect', size: [1.0, 1.4], layers: smd},
  ],
});

export const BulkCapacitor = definePart({
  manufacturer: 'Generic',
  mpn: 'CAP-1210',
  package: '1210',
  datasheet: datasheet('cap-1210'),
  pinoutCoverage: 'complete',
  pins: passivePins,
}, {footprint, pinMap: {1: '1', 2: '2'}});
