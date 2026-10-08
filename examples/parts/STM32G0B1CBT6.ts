import React from 'react';
import {definePart, renderFootprintDeclarations} from '@react-pcb/core';
import {LQFP48Footprint} from '../footprints/LQFP48.tsx';

const footprint = await renderFootprintDeclarations(React.createElement(LQFP48Footprint));

export const STM32G0B1CBT6 = definePart({
  manufacturer: 'STMicroelectronics',
  mpn: 'STM32G0B1CBT6',
  package: 'LQFP48 7x7 mm',
  datasheet: {
    url: 'https://www.st.com/resource/en/datasheet/stm32g0b1cb.pdf',
    document: 'DS13560',
    revision: '6',
    page: 38,
  },
  // This example records only the pins used by the board. A production part
  // library entry should use "complete" and include every package pad.
  pinoutCoverage: 'partial',
  pins: {
    'VDD/VDDA': {electricalType: 'power-input', required: true},
    'VSS/VSSA': {electricalType: 'power-input', required: true},
    PA11: {electricalType: 'bidirectional', functions: ['GPIO', 'USB_DM']},
    PA12: {electricalType: 'bidirectional', functions: ['GPIO', 'USB_DP']},
  },
}, {
  footprint,
  pinMap: {
    'VDD/VDDA': '6',
    'VSS/VSSA': '7',
    'PA11': '33',
    'PA12': '34',
  },
});
