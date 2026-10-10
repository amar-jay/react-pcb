import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import React from "react";
import { XT30UPBFootprint } from "../footprints/terminals.tsx";

const footprint = await renderFootprintDeclarations(
	React.createElement(XT30UPBFootprint),
);
export const Battery = definePart(
	{
		manufacturer: "AMASS",
		mpn: "XT30UPB-M",
		package: "Vertical PCB connector, 5 mm pitch",
		datasheet: {
			url: "https://www.tme.eu/en/Document/4acc913878197f8c2e30d4b8cdc47230/XT30UPB%20SPEC.pdf",
			document: "XT30UPB SPEC (geometry cross-check: official KiCad library)",
		},
		pinoutCoverage: "complete",
		pins: {
			"+": { electricalType: "power-input", required: true },
			"-": { electricalType: "power-input", required: true },
		},
	},
	{ footprint, pinMap: { "-": "1", "+": "2" } },
);
