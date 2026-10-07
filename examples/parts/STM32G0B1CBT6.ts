import {definePart} from '@react-pcb/core';

export const STM32G0B1CBT6 = definePart({
  manufacturer: 'STMicroelectronics',
  mpn: 'STM32G0B1CBT6',
  package: 'LQFP48 7x7 mm',
  footprint: 'LQFP-48_7x7mm_P0.5mm',
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
    'VDD/VDDA': {pad: '6', electricalType: 'power-input', required: true},
    'VSS/VSSA': {pad: '7', electricalType: 'power-input', required: true},
    PA11: {pad: '33', electricalType: 'bidirectional', functions: ['GPIO', 'USB_DM']},
    PA12: {pad: '34', electricalType: 'bidirectional', functions: ['GPIO', 'USB_DP']},
  },
});
