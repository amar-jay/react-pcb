import {
	copperLayer,
	defineLayerSet,
	defineStackup,
	dielectricLayer,
	mechanicalLayer,
	pasteLayer,
	silkscreenLayer,
	solderMaskLayer,
} from "@react-pcb/core";

export const frontCopper = copperLayer({ thickness: 0.035, usage: "signal" });
export const groundPlane = copperLayer({ thickness: 0.035, usage: "plane" });
export const batteryPlane = copperLayer({ thickness: 0.035, usage: "plane" });
export const backCopper = copperLayer({ thickness: 0.035, usage: "signal" });

export const frontMask = solderMaskLayer({ side: "front", expansion: 0.05 });
export const backMask = solderMaskLayer({ side: "back", expansion: 0.05 });
export const frontPaste = pasteLayer({ side: "front" });
export const backPaste = pasteLayer({ side: "back" });

export const boardLayers = defineLayerSet({
	stackup: defineStackup([
		frontCopper,
		dielectricLayer({
			material: "FR-4",
			thickness: 0.2,
			epsilonR: 4.3,
			lossTangent: 0.02,
		}),
		groundPlane,
		dielectricLayer({
			material: "FR-4",
			thickness: 0.8,
			epsilonR: 4.3,
			lossTangent: 0.02,
		}),
		batteryPlane,
		dielectricLayer({
			material: "FR-4",
			thickness: 0.2,
			epsilonR: 4.3,
			lossTangent: 0.02,
		}),
		backCopper,
	]),
	technical: [
		frontMask,
		backMask,
		frontPaste,
		backPaste,
		silkscreenLayer({ side: "front", color: "white" }),
		silkscreenLayer({ side: "back", color: "white" }),
		mechanicalLayer({ purpose: "courtyard", side: "front" }),
		mechanicalLayer({ purpose: "assembly", side: "front" }),
		mechanicalLayer({ purpose: "courtyard", side: "back" }),
		mechanicalLayer({ purpose: "fabrication", side: "front" }),
		mechanicalLayer({ purpose: "fabrication", side: "back" }),
	],
});
