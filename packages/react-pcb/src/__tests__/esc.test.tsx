import { expect, test } from "bun:test";
import { Esc } from "../../../../examples/esc/board.tsx";
import {
	Capacitor0402Footprint,
	Capacitor1210Footprint,
	escFootprints,
	escInspectionProfile,
	footprintProfile,
	LFPAK56Footprint,
	PhaseTerminalFootprint,
	Shunt2512Footprint,
	SOIC8Footprint,
	XT30UPBFootprint,
} from "../../../../examples/esc/footprints/index.ts";
import { boardLayers } from "../../../../examples/esc/layers.ts";
import { Battery, Mosfet } from "../../../../examples/esc/parts/index.ts";
import {
	Board,
	compile,
	compileFootprint,
	footprintSvg,
	net,
	type PhysicalFootprint,
	part,
	rect,
	validateBoardManufacturing,
	validateFootprintManufacturing,
} from "../index.ts";
import { assertDefined } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const pads = (ir: PhysicalFootprint) =>
	ir.features
		.filter((f) => f.purpose === "pad")
		.sort((a, b) => a.id.localeCompare(b.id));
const feature = (ir: PhysicalFootprint, id: string) =>
	assertDefined(ir.features.find((f) => f.id === id));

// Expected coordinates below are independent transcriptions of the drawings,
// rather than imports of implementation constants or layout calculations.
test("ESC SOIC8 follows IR2101 page 13 and component-side numbering", async () => {
	const ir = await compileFootprint(<SOIC8Footprint />, options);
	expect(pads(ir).map((p) => [p.id, p.at])).toEqual([
		["1", [-2340000, -1905000]],
		["2", [-2340000, -635000]],
		["3", [-2340000, 635000]],
		["4", [-2340000, 1905000]],
		["5", [2340000, 1905000]],
		["6", [2340000, 635000]],
		["7", [2340000, -635000]],
		["8", [2340000, -1905000]],
	]);
	for (const p of pads(ir)) {
		expect(p.shape).toEqual({ kind: "rect", size: [1780000, 720000] });
		expect(p.layers).toEqual(["front-copper"]);
		expect(p.drill).toBeNull();
	}
	expect(feature(ir, "mask-1").shape).toEqual({
		kind: "rect",
		size: [1880000, 820000],
	});
	expect(feature(ir, "paste-1").shape).toEqual({
		kind: "rect",
		size: [1680000, 620000],
	});
});

test("LFPAK56 includes every source/gate terminal, exact T-shaped drain and stencil windows", async () => {
	const ir = await compileFootprint(<LFPAK56Footprint />, options);
	expect(pads(ir).map((p) => [p.id, p.at, p.shape])).toEqual([
		["1", [-1905000, 2725000], { kind: "rect", size: [700000, 1150000] }],
		["2", [-635000, 2725000], { kind: "rect", size: [700000, 1150000] }],
		["3", [635000, 2725000], { kind: "rect", size: [700000, 1150000] }],
		["4", [1905000, 2725000], { kind: "rect", size: [700000, 1150000] }],
		["mb-lower", [0, -450000], { kind: "rect", size: [4200000, 3100000] }],
		["mb-upper", [0, -2750000], { kind: "rect", size: [4700000, 1500000] }],
	]);
	expect(ir.features.filter((f) => f.id.startsWith("paste-mb-"))).toHaveLength(
		13,
	);
	for (const [index, x] of [-1905000, -635000, 635000, 1905000].entries()) {
		expect(feature(ir, `paste-mb-top-${index + 1}`)).toMatchObject({
			at: [x, -3000000],
			shape: { kind: "rect", size: [600000, 900000] },
		});
	}
	for (const [column, x] of [-1150000, 0, 1150000].entries()) {
		for (const [row, y] of [-1150000, -300000, 550000].entries()) {
			expect(feature(ir, `paste-mb-${column + 1}-${row + 1}`)).toMatchObject({
				at: [x, y],
				shape: { kind: "rect", size: [900000, 600000] },
			});
		}
	}
	// Copper union area: 20.07 mm², exact seam at y=-2 mm. Separate
	// source/gate lands have 0.57 mm gaps and clear the drain by 1.05 mm.
	expect(feature(ir, "mask-mb").shape).toEqual({
		kind: "rect",
		size: [4850000, 4750000],
	});
	expect(feature(ir, "paste-4").shape).toEqual({
		kind: "rect",
		size: [600000, 1050000],
	});
});

test("passive lands follow selected Murata ranges and resistance-specific Vishay row", async () => {
	for (const [Component, at, size, body] of [
		[Capacitor0402Footprint, 400000, [400000, 500000], [1000000, 500000]],
		[Capacitor1210Footprint, 1650000, [1100000, 2200000], [3200000, 2500000]],
		[Shunt2512Footprint, 2855000, [1650000, 3680000], [6350000, 3180000]],
	] as const) {
		const ir = await compileFootprint(<Component />, options);
		expect(pads(ir).map((p) => [p.id, p.at, p.shape])).toEqual([
			["1", [-at, 0], { kind: "rect", size }],
			["2", [at, 0], { kind: "rect", size }],
		]);
		expect(feature(ir, "body").shape).toEqual({ kind: "rect", size: body });
	}
});

test("vertical XT30 and board-owned motor terminal have plated drills, both-side masks, and no paste", async () => {
	const connector = await compileFootprint(<XT30UPBFootprint />, options);
	expect(pads(connector).map((p) => [p.id, p.at, p.shape, p.drill])).toEqual([
		[
			"1",
			[-2500000, 0],
			{ kind: "rect", size: [3000000, 3000000] },
			{ diameter: 1800000, plated: true },
		],
		[
			"2",
			[2500000, 0],
			{ kind: "circle", diameter: 3000000 },
			{ diameter: 1800000, plated: true },
		],
	]);
	const terminal = await compileFootprint(<PhaseTerminalFootprint />, options);
	expect(pads(terminal)).toHaveLength(1);
	expect(feature(terminal, "P")).toMatchObject({
		at: [0, 0],
		shape: { kind: "circle", diameter: 3400000 },
		layers: ["all-copper"],
		drill: { diameter: 1800000, plated: true },
	});
	for (const ir of [connector, terminal]) {
		expect(
			ir.features.some((f) => f.layers.some((l) => l.includes("paste"))),
		).toBe(false);
		expect(
			ir.features
				.filter((f) => f.purpose === "mask-opening")
				.every((f) => f.layers.includes("all-mask")),
		).toBe(true);
	}
});

test("every ESC footprint round-trips, renders deterministically and passes its declared inspection rules", async () => {
	for (const [name, Component] of escFootprints) {
		const ir = await compileFootprint(<Component />, options);
		const roundtrip = JSON.parse(JSON.stringify(ir)) as PhysicalFootprint;
		expect(roundtrip).toEqual(ir);
		expect(new Set(ir.features.map((f) => f.id)).size).toBe(ir.features.length);
		expect(await footprintSvg(roundtrip, options)).toBe(
			await footprintSvg(ir, options),
		);
		expect(
			await validateFootprintManufacturing(ir, footprintProfile(name), options),
		).toMatchObject({ conformsToCheckedRules: true, complete: false });
	}
});

test("ESC uses real part bindings, all 48 MCU lands and collision-free placed geometry", async () => {
	const result = await compile(<Esc />, options);
	expect(result.diagnostics).toEqual([]);
	expect(result.ir.parts).toHaveLength(17);
	expect(Object.values(result.ir.footprintDefinitions)).toHaveLength(8);
	expect(
		Object.values(result.ir.footprintDefinitions).every(
			(f) => f.resolved && f.physical,
		),
	).toBe(true);
	expect(
		result.ir.footprintDefinitions["LQFP-48_7x7mm_P0.5mm"]?.pads,
	).toHaveLength(48);
	const driver = assertDefined(
		result.ir.parts.find((p) => p.id === "drive/U1"),
	);
	expect(driver.pinMap).toEqual({
		VCC: ["1"],
		HIN: ["2"],
		LIN: ["3"],
		COM: ["4"],
		LO: ["5"],
		VS: ["6"],
		HO: ["7"],
		VB: ["8"],
	});
	const mcu = assertDefined(result.ir.parts.find((p) => p.id === "control/U2"));
	expect(mcu.pinMap).toMatchObject({
		PA8: ["28"],
		PB13: ["25"],
		PA0: ["11"],
		PA1: ["12"],
		PA2: ["13"],
		VBAT: ["4"],
		"VREF+": ["5"],
		"VDD/VDDA": ["6"],
		"VSS/VSSA": ["7"],
		VSS: ["30"],
		VDDIO2: ["31"],
	});
	expect(mcu.connections.PA2).toBeUndefined(); // No unconditioned phase voltage on an ADC.
	const battery = assertDefined(
		result.ir.parts.find((p) => p.id === "power/J1"),
	);
	expect(battery.pinMap).toEqual({ "+": ["2"], "-": ["1"] });
	for (const component of Object.values(result.ir.componentDefinitions)) {
		expect(component.manufacturer).not.toBe("Generic");
		expect(component.datasheet?.url ?? "").not.toContain("example.com");
	}
	expect(
		await validateBoardManufacturing(result.ir, escInspectionProfile, options),
	).toMatchObject({ conformsToCheckedRules: true, complete: false });
});

test("MOSFET many-pad binding and technical layers survive mirrored back-side rotation", async () => {
	const connect = { G: net("GATE"), S: net("SOURCE"), D: net("DRAIN") };
	const result = await compile(
		<Board layers={boardLayers} outline={rect(0, 0, 40, 30)}>
			<Mosfet id={part("Q1")} at={[10, 10]} rotation={90} connect={connect} />
			<Mosfet
				id={part("Q2")}
				at={[25, 10]}
				rotation={90}
				side="back"
				connect={connect}
			/>
			<Battery
				id={part("J1")}
				at={[6, 24]}
				connect={{ "+": net("BAT+"), "-": net("BAT-") }}
			/>
		</Board>,
		options,
	);
	const [front, back, battery] = result.ir.parts;
	expect(front?.pinMap).toEqual({
		G: ["4"],
		S: ["1", "2", "3"],
		D: ["mb-upper", "mb-lower"],
	});
	expect(back?.pinMap).toEqual(front?.pinMap);
	expect(front?.physicalFeatures["4"]?.geometry.at).toEqual([
		7275000, 11905000,
	]);
	expect(back?.physicalFeatures["4"]?.geometry.at).toEqual([22275000, 8095000]);
	expect(back?.padLayers["4"]).toEqual(["copper/4"]);
	expect(back?.physicalFeatures["paste-4"]?.layers).toEqual(["paste/back"]);
	expect(back?.physicalFeatures.body?.layers).toEqual([
		"mechanical/fabrication/back",
	]);
	expect(battery?.padLayers["1"]).toEqual([
		"copper/1",
		"copper/2",
		"copper/3",
		"copper/4",
	]);
});

test("importing the ESC preview entry has no CLI output or forced process exit", () => {
	const process = Bun.spawnSync(
		["bun", "-e", "await import('./examples/esc/index.tsx')"],
		{ cwd: options.cwd },
	);
	expect(process.exitCode).toBe(0);
	expect(process.stdout.toString()).toBe("");
	expect(process.stderr.toString()).toBe("");
});
