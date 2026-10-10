import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import React from "react";
import { Shunt2512Footprint } from "../footprints/passives.tsx";
import { passivePins } from "./shared.ts";

const footprint = await renderFootprintDeclarations(
	React.createElement(Shunt2512Footprint),
);
export const Shunt = definePart(
	{
		manufacturer: "Vishay Dale",
		mpn: "WSL2512R0100FEA",
		package: "2512, 10 mOhm, two-terminal",
		datasheet: {
			url: "https://www.vishay.com/docs/30100/wsl.pdf",
			document: "30100",
			revision: "23-Nov-2023",
			page: 2,
		},
		pinoutCoverage: "complete",
		pins: passivePins,
	},
	{ footprint, pinMap: { 1: "1", 2: "2" } },
);
