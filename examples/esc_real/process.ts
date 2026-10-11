import type { ManufacturingProfileInput } from "@react-pcb/core";

// Project acceptance limits, not a claim of a fabricator's approved stackup.
// NSMD lands use +0.05mm mask expansion. TI DDA has a manufacturer-specified
// SMD exposed pad, so a single global minimum mask expansion is inappropriate.
// Its mask and the NSMD apertures are checked separately in esc-real.test.tsx.
export const manufacturingProfile: ManufacturingProfileInput = {
	schemaVersion: 1,
	key: "esc-real:prototype-process-v1",
	minCopperFeature: "0.15mm",
	minCopperSpacing: "0.15mm",
	minDrillDiameter: "0.3mm",
	minAnnularRing: "0.15mm",
	minMaskWeb: "0.1mm",
	minPasteFeature: "0.1mm",
	minCourtyardClearance: "0.2mm",
};
