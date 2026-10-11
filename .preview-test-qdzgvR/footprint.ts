import { definePhysicalFootprint } from "@react-pcb/core";
export const footprint = definePhysicalFootprint({
	key: "preview:passive",
	features: [
		{
			id: "1",
			purpose: "pad",
			at: ["0mm", "0mm"],
			shape: { kind: "rect", size: ["1mm", "1mm"] },
			layers: ["front-copper"],
		},
	],
});
