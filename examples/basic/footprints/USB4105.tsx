import React from "react";
import {
	Footprint,
	Graphic,
	Hole,
	Pad,
	type FootprintStyle,
} from "@react-pcb/core";

export const USB4105_FOOTPRINT_KEY = "USB-C_Receptacle_GCT_USB4105";

// GCT USB4105 drawing B4 (18 December 2023), sheet 1, component-side PCB view.
// Cross-checked with KiCad's USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal.
// Origin: shell body center. +y points toward the mating opening / PCB edge.
// Values below are integer micrometres; full provenance and coordinate tables:
// docs/footprints/USB4105.md.
function box(
	x: number,
	y: number,
	width: number,
	height: number,
): FootprintStyle {
	return {
		position: "absolute",
		width: `${width}um`,
		height: `${height}um`,
		left: `${x - width / 2 + 5320}um`,
		top: `${y - height / 2 + 4760}um`,
	};
}

// Four pairs of contacts share four physical lands. Emit each land only once.
const contacts = [
	["A1/B12", -3200, 600],
	["A4/B9", -2400, 600],
	["B8", -1750, 300],
	["A5", -1250, 300],
	["B7", -750, 300],
	["A6", -250, 300],
	["A7", 250, 300],
	["B6", 750, 300],
	["A8", 1250, 300],
	["B5", 1750, 300],
	["B4/A9", 2400, 600],
	["B1/A12", 3200, 600],
] as const;
const shell = [
	["SHELL1", -4320, -3105, 2100, 1700],
	["SHELL2", 4320, -3105, 2100, 1700],
	["SHELL3", -4320, 1075, 1800, 1400],
	["SHELL4", 4320, 1075, 1800, 1400],
] as const;

/** Manufacturer land pattern, with separately identified slots and locating holes. */
export function USB4105Footprint() {
	return (
		<Footprint
			name={USB4105_FOOTPRINT_KEY}
			style={{
				width: "10.64mm",
				height: "8.94mm",
				left: "-5.32mm",
				top: "-4.76mm",
			}}
		>
			{contacts.map(([name, x, width]) => (
				<Pad
					key={name}
					name={name}
					style={box(x, -3680, width, 1150)}
					layers={["front-copper", "front-mask", "front-paste"]}
				/>
			))}
			{shell.map(([name, x, y, height, slotHeight]) => (
				<Pad
					key={name}
					name={name}
					shape="oval"
					style={box(x, y, 1000, height)}
					layers={["all-copper", "all-mask", "front-paste"]}
					drill={{
						diameter: "0.6mm",
						slot: ["0.6mm", `${slotHeight}um`],
						plated: true,
					}}
				/>
			))}
			<Hole
				name="locating-left"
				plated={false}
				style={box(-2890, -2605, 650, 650)}
			/>
			<Hole
				name="locating-right"
				plated={false}
				style={box(2890, -2605, 650, 650)}
			/>
			<Graphic
				name="body"
				purpose="fabrication"
				layers={["front-fabrication"]}
				style={box(0, 0, 8940, 7350)}
				stroke="0.1mm"
			/>
			<Graphic
				name="courtyard"
				purpose="courtyard"
				layers={["front-courtyard"]}
				style={box(0, -290, 10640, 8940)}
				stroke="0.05mm"
			/>
			<Graphic
				name="silkscreen-left"
				purpose="silkscreen"
				layers={["front-silkscreen"]}
				style={box(-4670, -950, 120, 1700)}
			/>
			<Graphic
				name="silkscreen-right"
				purpose="silkscreen"
				layers={["front-silkscreen"]}
				style={box(4670, -950, 120, 1700)}
			/>
			<Graphic
				name="pcb-edge-reference"
				purpose="fabrication"
				layers={["front-fabrication"]}
				style={box(0, 3675, 10000, 100)}
			/>
		</Footprint>
	);
}
