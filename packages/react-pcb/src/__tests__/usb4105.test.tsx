import { expect, test } from "bun:test";
import React from "react";
import {
	Board,
	compile,
	compileFootprint,
	defineLayerSet,
	footprintSvg,
	mechanicalLayer,
	net,
	part,
	rect,
	silkscreenLayer,
	type PhysicalFootprint,
} from "../index.ts";
import {
	USB4105Footprint,
	USB4105_FOOTPRINT_KEY,
} from "../../../../examples/basic/footprints/USB4105.tsx";
import { USB4105GFA } from "../../../../examples/parts/USB4105GFA.ts";
import { testLayers } from "./fixtures.ts";

const options = { cwd: import.meta.dir + "/../../../..", hideWarnings: true };
const layers = defineLayerSet({
	stackup: testLayers.stackup,
	technical: [
		...testLayers.technical,
		...(["front", "back"] as const).flatMap((side) => [
			silkscreenLayer({ side }),
			mechanicalLayer({ purpose: "fabrication", side }),
			mechanicalLayer({ purpose: "courtyard", side }),
		]),
	],
});

// Independently transcribed from GCT B4 sheet 1's component-side recommended PCB layout.
// Listed by physical contact order, in integer nm, not imported from implementation tables.
const lands = [
	["A1/B12", -3200000, 600000],
	["A4/B9", -2400000, 600000],
	["B8", -1750000, 300000],
	["A5", -1250000, 300000],
	["B7", -750000, 300000],
	["A6", -250000, 300000],
	["A7", 250000, 300000],
	["B6", 750000, 300000],
	["A8", 1250000, 300000],
	["B5", 1750000, 300000],
	["B4/A9", 2400000, 600000],
	["B1/A12", 3200000, 600000],
] as const;

test("USB4105 matches manufacturer land dimensions, locating holes, and slotted stakes", async () => {
	const ir = await compileFootprint(<USB4105Footprint />, options);
	expect(ir.key).toBe(USB4105_FOOTPRINT_KEY);
	expect(ir.schemaVersion).toBe(2);
	const byId = Object.fromEntries(ir.features.map((f) => [f.id, f]));
	const pads = ir.features.filter((f) => f.purpose === "pad");
	expect(pads).toHaveLength(16); // 12 signal/power lands plus four shell stakes.
	for (const [id, x, width] of lands) {
		expect(byId[id]).toMatchObject({
			at: [x, -3680000],
			shape: { kind: "rect", size: [width, 1150000] },
			rotation: 0,
			layers: ["front-copper", "front-mask", "front-paste"],
			drill: null,
		});
	}
	for (const [id, x, y, height, length] of [
		["SHELL1", -4320000, -3105000, 2100000, 1700000],
		["SHELL2", 4320000, -3105000, 2100000, 1700000],
		["SHELL3", -4320000, 1075000, 1800000, 1400000],
		["SHELL4", 4320000, 1075000, 1800000, 1400000],
	] as const) {
		expect(byId[id]).toMatchObject({
			at: [x, y],
			shape: { kind: "oval", size: [1000000, height] },
			drill: { diameter: 600000, slot: [600000, length], plated: true },
			layers: ["all-copper", "all-mask", "front-paste"],
		});
		expect((height - length) / 2).toBe(200000); // 0.20 mm annular width, both axes.
	}
	expect(byId["locating-left"]).toMatchObject({
		at: [-2890000, -2605000],
		shape: { kind: "circle", diameter: 650000 },
		purpose: "non-plated-hole",
		drill: { diameter: 650000, plated: false },
		layers: [],
	});
	expect(byId["locating-right"]?.at).toEqual([2890000, -2605000]);
	expect(byId.body).toMatchObject({
		at: [0, 0],
		shape: { kind: "rect", size: [8940000, 7350000] },
	});
	expect(byId["pcb-edge-reference"]?.at).toEqual([0, 3675000]);
	expect(ir.bounds).toEqual({
		min2: [-10690000, -9570000],
		max2: [10690000, 8410000],
	});
	expect(JSON.parse(JSON.stringify(ir)) as PhysicalFootprint).toEqual(ir);
	const svg = await footprintSvg(ir, options);
	expect(svg).toContain('width="10.69mm" height="8.99mm"');
	expect(svg.match(/data-drill-shape="slot"/g)).toHaveLength(4);
	expect(svg).toContain(
		'x="-600000" y="-1700000" width="1200000" height="3400000" rx="600000" ry="600000"',
	);
	expect(
		await footprintSvg(
			await compileFootprint(<USB4105Footprint />, options),
			options,
		),
	).toBe(svg);
});

test("all contacts bind to unique physical lands and shell pads on both board sides", async () => {
	const ground = net("GND");
	const vbus = net("VBUS");
	const connect = {
		GND: ground,
		VBUS: vbus,
		CC1: net("CC1"),
		CC2: net("CC2"),
		DPlus: net("D+"),
		DMinus: net("D-"),
		SBU1: net("SBU1"),
		SBU2: net("SBU2"),
		Shield: ground,
	};
	const result = await compile(
		<Board layers={layers} outline={rect(0, 0, 30, 30)}>
			<USB4105GFA
				id={part("J1")}
				at={[10, 10]}
				rotation={90}
				connect={connect}
			/>
			<USB4105GFA
				id={part("J2")}
				at={[20, 10]}
				rotation={90}
				side="back"
				connect={connect}
			/>
		</Board>,
		options,
	);
	expect(result.diagnostics).toEqual([]);
	expect(Object.keys(result.ir.footprintDefinitions)).toEqual([
		USB4105_FOOTPRINT_KEY,
	]);
	const [front, back] = result.ir.parts;
	expect(front?.pinMap.GND).toEqual(["A1/B12", "B1/A12"]);
	expect(front?.pinMap.VBUS).toEqual(["A4/B9", "B4/A9"]);
	expect(front?.pinMap.Shield).toEqual([
		"SHELL1",
		"SHELL2",
		"SHELL3",
		"SHELL4",
	]);
	const mapped = Object.values(front!.pinMap).flat();
	expect(mapped).toHaveLength(16);
	expect(new Set(mapped).size).toBe(16);
	expect(front?.physicalFeatures["A6"]?.geometry.at).toEqual([
		13680000, 9750000,
	]);
	expect(back?.physicalFeatures["A6"]?.geometry.at).toEqual([
		23680000, 10250000,
	]);
	expect(front?.physicalFeatures.SHELL1?.geometry).toMatchObject({
		at: [13105000, 5680000],
		rotation: 90,
		drill: { diameter: 600000, slot: [600000, 1700000], plated: true },
	});
	expect(back?.physicalFeatures.SHELL1?.geometry).toMatchObject({
		at: [23105000, 14320000],
		rotation: 90,
	});
	expect(back?.padLayers.A6).toEqual([
		"copper/2",
		"paste/back",
		"solder-mask/back",
	]);
	expect(back?.padLayers.SHELL1).toEqual([
		"copper/1",
		"copper/2",
		"paste/back",
		"solder-mask/back",
		"solder-mask/front",
	]);
	expect(
		result.ir.footprintDefinitions[USB4105_FOOTPRINT_KEY]?.pads.find(
			(p) => p.id === "SHELL1",
		)?.drill,
	).toEqual({ diameter: 0.6, slot: [0.6, 1.7], plated: true });
	const ir = result.ir.footprintDefinitions[USB4105_FOOTPRINT_KEY]!.physical!;
	expect(ir.features.find((f) => f.id === "SHELL1")?.rotation).toBe(0);
});
