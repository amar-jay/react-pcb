import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import React from "react";
import { SOIC8Footprint } from "../footprints/SOIC8.tsx";

const footprint = await renderFootprintDeclarations(
	React.createElement(SOIC8Footprint),
);
export const GateDriver = definePart(
	{
		manufacturer: "Infineon Technologies",
		mpn: "IR2101STRPBF",
		package: "SOIC-8 narrow",
		datasheet: {
			url: "https://www.infineon.com/assets/row/public/documents/24/49/infineon-ir2101-ds-en.pdf",
			document: "PD60043",
			revision: "O",
			page: 5,
		},
		pinoutCoverage: "complete",
		pins: {
			VCC: {
				electricalType: "power-input",
				required: true,
				functions: ["10–20 V gate supply"],
			},
			HIN: { electricalType: "input", required: true },
			LIN: { electricalType: "input", required: true },
			COM: { electricalType: "power-input", required: true },
			LO: { electricalType: "output", required: true },
			VS: { electricalType: "passive", required: true },
			HO: { electricalType: "output", required: true },
			VB: { electricalType: "power-input", required: true },
		},
	},
	{
		footprint,
		pinMap: {
			VCC: "1",
			HIN: "2",
			LIN: "3",
			COM: "4",
			LO: "5",
			VS: "6",
			HO: "7",
			VB: "8",
		},
	},
);
