import {defineFootprint, definePart} from '@react-pcb/core';
import {throughHole} from '../layers.ts';
import {datasheet} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:xt30',
  pads: [
    {id: '+', at: [-2.5, 0], shape: 'oval', size: [2.2, 3.2], layers: throughHole, drill: {diameter: 1.6, plated: true}},
    {id: '-', at: [2.5, 0], shape: 'oval', size: [2.2, 3.2], layers: throughHole, drill: {diameter: 1.6, plated: true}},
  ],
});

export const Battery = definePart({
  manufacturer: 'Generic',
  mpn: 'XT30',
  package: 'XT30',
  datasheet: datasheet('xt30'),
  pinoutCoverage: 'complete',
  pins: {
    '+': {electricalType: 'power-input', required: true},
    '-': {electricalType: 'power-input', required: true},
  },
}, {footprint, pinMap: {'+': '+', '-': '-'}});
