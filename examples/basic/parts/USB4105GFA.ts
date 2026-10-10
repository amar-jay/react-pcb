import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import React from "react";
import { USB4105Footprint } from "../footprints/USB4105.tsx";

const footprint = await renderFootprintDeclarations(
	React.createElement(USB4105Footprint),
);

export const USB4105GFA = definePart(
	{
		manufacturer: "Global Connector Technology",
		mpn: "USB4105-GF-A",
		package: "USB Type-C receptacle, 16 contacts, top-mount",
		datasheet: {
			url: "https://gct.co/files/drawings/usb4105.pdf",
			document: "USB4105 product drawing",
			revision: "B4",
			page: 1,
		},
		pinoutCoverage: "complete",
		pins: {
			GND: {
				electricalType: "passive",
				required: true,
			},
			VBUS: {
				electricalType: "passive",
				required: true,
			},
			CC1: { electricalType: "passive", required: true },
			CC2: { electricalType: "passive", required: true },
			DPlus: {
				electricalType: "passive",
				functions: ["USB_D+"],
			},
			DMinus: {
				electricalType: "passive",
				functions: ["USB_D-"],
			},
			SBU1: { electricalType: "passive" },
			SBU2: { electricalType: "passive" },
			Shield: { electricalType: "passive" },
		},
	},
	{
		footprint,
		pinMap: {
			GND: ["A1/B12", "B1/A12"],
			VBUS: ["A4/B9", "B4/A9"],
			CC1: "A5",
			CC2: "B5",
			DPlus: ["A6", "B6"],
			DMinus: ["A7", "B7"],
			SBU1: "A8",
			SBU2: "B8",
			Shield: ["SHELL1", "SHELL2", "SHELL3", "SHELL4"],
		},
	},
);
