import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import React from "react";
import { Capacitor1210Footprint } from "../footprints/passives.tsx";
import { passivePins } from "./shared.ts";

const footprint = await renderFootprintDeclarations(
	React.createElement(Capacitor1210Footprint),
);
export const BulkCapacitor = definePart(
	{
		manufacturer: "Murata Manufacturing",
		mpn: "GRM32ER71H106KA12L",
		package: "1210 / 3225 metric, 10 uF, 50 V, X7R",
		datasheet: {
			url: "https://www.murata.com/en-global/products/productdetail?partno=GRM32ER71H106KA12%23",
			document: "GRM32ER71H106KA12",
		},
		pinoutCoverage: "complete",
		pins: passivePins,
	},
	{ footprint, pinMap: { 1: "1", 2: "2" } },
);
