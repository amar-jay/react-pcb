import {defineFootprint, definePart} from '@react-pcb/core';
import {smd} from '../layers.ts';
import {datasheet} from './shared.ts';

const footprint = defineFootprint({
  key: 'esc:lfpak56',
  pads: [
    {id: 'G', at: [-2.2, 1.2], shape: 'rect', size: [0.7, 0.6], layers: smd},
    {id: 'S', at: [-2.2, -1.2], shape: 'rect', size: [0.7, 0.6], layers: smd},
    {id: 'D', at: [0.8, 0], shape: 'rect', size: [2.4, 3.4], layers: smd},
  ],
});

export const Mosfet = definePart({
  manufacturer: 'Generic',
  mpn: 'NMOS-LFPAK56',
  package: 'LFPAK56',
  datasheet: datasheet('nmos'),
  pinoutCoverage: 'partial',
  pins: {
    G: {electricalType: 'input', required: true},
    D: {electricalType: 'passive', required: true},
    S: {electricalType: 'passive', required: true},
  },
}, {footprint, pinMap: {G: 'G', D: 'D', S: 'S'}});
