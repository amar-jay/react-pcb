import {definePart} from '@react-pcb/core';

export const USB4105GFA = definePart({
  manufacturer: 'Global Connector Technology',
  mpn: 'USB4105-GF-A',
  package: 'USB Type-C receptacle, 16 contacts, top-mount',
  footprint: 'USB-C_Receptacle_GCT_USB4105',
  datasheet: {
    url: 'https://gct.co/files/drawings/usb4105.pdf',
    document: 'USB4105 product drawing',
    revision: 'B4',
    page: 1,
  },
  pinoutCoverage: 'complete',
  pins: {
    GND: {
      pad: ['A1', 'A12', 'B1', 'B12'],
      electricalType: 'passive',
      required: true,
    },
    VBUS: {
      pad: ['A4', 'A9', 'B4', 'B9'],
      electricalType: 'passive',
      required: true,
    },
    CC1: {pad: 'A5', electricalType: 'passive', required: true},
    CC2: {pad: 'B5', electricalType: 'passive', required: true},
    DPlus: {
      pad: ['A6', 'B6'],
      electricalType: 'passive',
      functions: ['USB_D+'],
    },
    DMinus: {
      pad: ['A7', 'B7'],
      electricalType: 'passive',
      functions: ['USB_D-'],
    },
    SBU1: {pad: 'A8', electricalType: 'passive'},
    SBU2: {pad: 'B8', electricalType: 'passive'},
    Shield: {pad: 'SHELL', electricalType: 'passive'},
  },
});
