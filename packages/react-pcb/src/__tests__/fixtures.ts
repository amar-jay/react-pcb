import {copperLayer, defineLayerSet, defineStackup, dielectricLayer} from '../layers/index.ts';

export const testLayers = defineLayerSet({
  stackup: defineStackup([
    copperLayer({thickness: 0.035}),
    dielectricLayer({material: 'FR-4', thickness: 1.5, epsilonR: 4.2}),
    copperLayer({thickness: 0.035}),
  ]),
});
