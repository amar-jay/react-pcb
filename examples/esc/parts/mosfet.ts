import React from 'react';
import {definePart, renderFootprintDeclarations} from '@react-pcb/core';
import {LFPAK56Footprint} from '../footprints/LFPAK56.tsx';

const footprint = await renderFootprintDeclarations(React.createElement(LFPAK56Footprint));
export const Mosfet = definePart({
  manufacturer: 'Nexperia', mpn: 'PSMN2R8-40YSB', package: 'LFPAK56 / SOT669',
  datasheet: {url: 'https://assets.nexperia.com/documents/data-sheet/PSMN2R8-40YSB.pdf',
    document: 'PSMN2R8-40YSB', revision: '13 February 2024', page: 2},
  pinoutCoverage: 'complete',
  pins: {G: {electricalType: 'input', required: true},
    S: {electricalType: 'passive', required: true}, D: {electricalType: 'passive', required: true}},
}, {footprint, pinMap: {G: '4', S: ['1', '2', '3'], D: ['mb-upper', 'mb-lower']}});
