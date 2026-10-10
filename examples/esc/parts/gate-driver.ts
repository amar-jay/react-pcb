import {defineFootprint, definePart} from '@react-pcb/core';
import {smd} from '../layers.ts';
import {datasheet} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:soic-8',
  pads: [
    {id: '1', at: [-2.7, 1.905], shape: 'rect', size: [1.5, 0.6], layers: smd},
    {id: '2', at: [-2.7, 0.635], shape: 'rect', size: [1.5, 0.6], layers: smd},
    {id: '3', at: [-2.7, -0.635], shape: 'rect', size: [1.5, 0.6], layers: smd},
    {id: '4', at: [-2.7, -1.905], shape: 'rect', size: [1.5, 0.6], layers: smd},
    {id: '5', at: [2.7, -1.905], shape: 'rect', size: [1.5, 0.6], layers: smd},
    {id: '6', at: [2.7, -0.635], shape: 'rect', size: [1.5, 0.6], layers: smd},
    {id: '7', at: [2.7, 0.635], shape: 'rect', size: [1.5, 0.6], layers: smd},
    {id: '8', at: [2.7, 1.905], shape: 'rect', size: [1.5, 0.6], layers: smd},
  ],
});

export const GateDriver = definePart({
  manufacturer: 'Generic',
  mpn: 'HALF-BRIDGE-DRIVER',
  package: 'SOIC-8',
  datasheet: datasheet('driver'),
  pinoutCoverage: 'partial',
  pins: {
    HIN: {electricalType: 'input', required: true, functions: ['high-side input']},
    LIN: {electricalType: 'input', required: true, functions: ['low-side input']},
    HO: {electricalType: 'output', required: true},
    LO: {electricalType: 'output', required: true},
    VB: {electricalType: 'power-input', required: true},
    VS: {electricalType: 'passive', required: true},
    VCC: {electricalType: 'power-input', required: true},
    GND: {electricalType: 'power-input', required: true},
  },
}, {
  footprint,
  pinMap: {HIN: '1', LIN: '2', VCC: '3', GND: '4', LO: '5', VS: '6', HO: '7', VB: '8'},
});
