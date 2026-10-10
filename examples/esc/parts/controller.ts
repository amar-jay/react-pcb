import {defineFootprint, definePart} from '@react-pcb/core';
import {smd} from '../layers.ts';
import {datasheet} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:qfn-20-partial',
  pads: [
    {id: '1', at: [-2.0, 1.5], shape: 'rect', size: [0.7, 0.25], layers: smd},
    {id: '2', at: [-2.0, 0.5], shape: 'rect', size: [0.7, 0.25], layers: smd},
    {id: '3', at: [-2.0, -0.5], shape: 'rect', size: [0.7, 0.25], layers: smd},
    {id: '4', at: [-2.0, -1.5], shape: 'rect', size: [0.7, 0.25], layers: smd},
    {id: '11', at: [2.0, -1.5], shape: 'rect', size: [0.7, 0.25], layers: smd},
    {id: '12', at: [2.0, -0.5], shape: 'rect', size: [0.7, 0.25], layers: smd},
    {id: '19', at: [0, 2.0], shape: 'rect', size: [0.25, 0.7], layers: smd},
    {id: '20', at: [0, -2.0], shape: 'rect', size: [0.25, 0.7], layers: smd},
  ],
});

export const Controller = definePart({
  manufacturer: 'Generic',
  mpn: 'ESC-MCU',
  package: 'QFN-20',
  datasheet: datasheet('mcu'),
  pinoutCoverage: 'partial',
  pins: {
    VDD: {electricalType: 'power-input', required: true},
    VSS: {electricalType: 'power-input', required: true},
    PWM_H: {electricalType: 'output', required: true},
    PWM_L: {electricalType: 'output', required: true},
    SENSE_P: {electricalType: 'input', required: true},
    SENSE_N: {electricalType: 'input', required: true},
    PHASE: {electricalType: 'input'},
  },
}, {
  footprint,
  pinMap: {VDD: '1', VSS: '20', PWM_H: '2', PWM_L: '3', SENSE_P: '11', SENSE_N: '12', PHASE: '19'},
});
