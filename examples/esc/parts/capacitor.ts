import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import React from "react";
import { Capacitor0402Footprint } from "../footprints/passives.tsx";
import { passivePins } from "./shared.ts";

const footprint = await renderFootprintDeclarations(
	React.createElement(Capacitor0402Footprint),
);
export const Capacitor = definePart(
	{
		manufacturer: "Murata Manufacturing",
		mpn: "GRM155R71H104KE14D",
		package: "0402 / 1005 metric, 100 nF, 50 V, X7R",
		datasheet: {
			url: "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM155R71H104KE14-01A.pdf",
			document: "GRM155R71H104KE14-01A",
			page: 27,
		},
		pinoutCoverage: "complete",
		pins: passivePins,
	},
	{ footprint, pinMap: { 1: "1", 2: "2" } },
);
