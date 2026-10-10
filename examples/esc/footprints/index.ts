import { LQFP48Footprint } from "../../basic/footprints/LQFP48.tsx";
import {
	Capacitor0402Footprint,
	Capacitor1210Footprint,
	Shunt2512Footprint,
} from "./passives.tsx";
import { SOIC8Footprint } from "./SOIC8.tsx";
import { LFPAK56Footprint } from "./LFPAK56.tsx";
import { PhaseTerminalFootprint, XT30UPBFootprint } from "./terminals.tsx";
import type { ManufacturingProfileInput } from "@react-pcb/core";

export {
	LQFP48Footprint,
	Capacitor0402Footprint,
	Capacitor1210Footprint,
	Shunt2512Footprint,
	SOIC8Footprint,
	LFPAK56Footprint,
	PhaseTerminalFootprint,
	XT30UPBFootprint,
};

export const escFootprints = [
	["lqfp48", LQFP48Footprint],
	["soic8", SOIC8Footprint],
	["lfpak56", LFPAK56Footprint],
	["capacitor-0402", Capacitor0402Footprint],
	["capacitor-1210", Capacitor1210Footprint],
	["shunt-2512", Shunt2512Footprint],
	["xt30upb", XT30UPBFootprint],
	["phase-terminal", PhaseTerminalFootprint],
] as const;

// Example inspection thresholds, not a fabricator specification.
export const escInspectionProfile: ManufacturingProfileInput = {
	schemaVersion: 1,
	key: "esc:inspection",
	minCopperFeature: "0.15mm",
	minCopperSpacing: "0.15mm",
	minDrillDiameter: "0.3mm",
	minAnnularRing: "0.15mm",
	minMaskExpansion: "0.05mm",
	minMaskWeb: "0.1mm",
	minPasteFeature: "0.1mm",
	minCourtyardClearance: "0.2mm",
};

export function footprintProfile(name: string): ManufacturingProfileInput {
	if (name === "lqfp48")
		return {
			...escInspectionProfile,
			key: "esc:lqfp48-nominal-mask",
			minMaskExpansion: "0mm",
		};
	// The standalone validator has no pinMap/net context: the drain seam and
	// merged drain aperture need zero spacing/web thresholds. Board checks use
	// established net IDs and still enforce 0.15 mm between different nets.
	if (name === "lfpak56")
		return {
			...escInspectionProfile,
			key: "esc:lfpak56-abutting-drain",
			minCopperSpacing: "0mm",
			minMaskWeb: "0mm",
		};
	return escInspectionProfile;
}
