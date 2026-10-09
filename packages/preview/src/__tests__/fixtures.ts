import {copperLayer, defineLayerSet, defineStackup, dielectricLayer, solderMaskLayer, pasteLayer} from '@react-pcb/core';

export const testLayers = defineLayerSet({
  stackup: defineStackup([
    copperLayer({id: 'copper/1', thickness: 0.035}),
    dielectricLayer({id: 'dielectric/1', material: 'FR-4', thickness: 1.5, epsilonR: 4.2}),
    copperLayer({id: 'copper/2', thickness: 0.035}),
  ]),
  technical: [
    solderMaskLayer({id: 'solder-mask/front', side: 'front'}),
    solderMaskLayer({id: 'solder-mask/back', side: 'back'}),
    pasteLayer({id: 'paste/front', side: 'front'}),
    pasteLayer({id: 'paste/back', side: 'back'}),
  ],
});
