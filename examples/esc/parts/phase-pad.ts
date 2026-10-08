import {defineFootprint, definePart} from '@react-pcb/core';
import {throughHole} from '../layers.ts';
import {datasheet} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:phase-pad',
  pads: [
    {id: 'P', at: [0, 0], shape: 'circle', size: [3.4, 3.4], layers: throughHole, drill: {diameter: 1.8, plated: true}},
  ],
});

export const PhasePad = definePart({
  manufacturer: 'Generic',
  mpn: 'PHASE-PAD',
  package: 'motor pad',
  datasheet: datasheet('phase'),
  pinoutCoverage: 'complete',
  pins: {P: {electricalType: 'passive', required: true}},
}, {footprint, pinMap: {P: 'P'}});
