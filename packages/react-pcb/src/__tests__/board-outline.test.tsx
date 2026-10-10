import { expect, test } from "bun:test";
import { cloneElement, type ReactNode } from "react";
import Esc from "../../../../examples/esc/board.tsx";
import {
	Board,
	type BoardProps,
	boardSvg,
	compile,
	defineLayerSet,
	definePhysicalFootprint,
	mechanicalLayer,
	Part,
	PcbCompileError,
	part,
	rect,
	silkscreenLayer,
	validateBoardManufacturing,
} from "../index.ts";
import { testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const layers = defineLayerSet({
	...testLayers,
	technical: [
		...testLayers.technical,
		...(["front", "back"] as const).flatMap((side) => [
			mechanicalLayer({ purpose: "fabrication", side }),
			mechanicalLayer({ purpose: "courtyard", side }),
			silkscreenLayer({ side }),
		]),
	],
});
const pad = definePhysicalFootprint({
	key: "outline:pad",
	features: [
		{
			id: "P",
			purpose: "pad",
			at: ["0mm", "0mm"],
			shape: { kind: "rect", size: ["2mm", "2mm"] },
			layers: ["front-copper"],
		},
	],
});

async function failure(element: ReactNode): Promise<PcbCompileError> {
	try {
		await compile(element, options);
	} catch (error) {
		expect(error).toBeInstanceOf(PcbCompileError);
		if (error instanceof PcbCompileError) return error;
		throw error;
	}
	throw new Error("Expected the board to fail compilation");
}

test("board containment permits exact edge contact and rejects one-nanometre overflow on all edges without a profile", async () => {
	const board = (at: readonly [number, number]) => (
		<Board outline={rect(0, 0, 4, 4)} layers={layers}>
			<Part id={part("P1")} footprint={pad} at={at} connect={{}} />
		</Board>
	);
	for (const at of [
		[1, 1],
		[3, 1],
		[1, 3],
		[3, 3],
	] as const) {
		expect((await compile(board(at), options)).diagnostics).toEqual([]);
	}
	for (const at of [
		[0.999999, 2],
		[3.000001, 2],
		[2, 0.999999],
		[2, 3.000001],
	] as const) {
		expect((await failure(board(at))).diagnostic).toMatchObject({
			code: "PCBIR031",
			entity: "P1",
			message: expect.stringContaining("features: P"),
		});
	}
});

test("odd feature sizes retain half-nanometre edges rather than rounding them inside", async () => {
	const odd = definePhysicalFootprint({
		key: "outline:odd",
		features: [
			{
				id: "P",
				purpose: "pad",
				at: ["0nm", "0nm"],
				shape: { kind: "circle", diameter: "3nm" },
				layers: ["front-copper"],
			},
		],
	});
	const board = (x: number) => (
		<Board outline={rect(0, 0, 0.000005, 0.000005)} layers={layers}>
			<Part id={part("P1")} footprint={odd} at={[x, 0.000002]} connect={{}} />
		</Board>
	);
	await compile(board(0.000002), options);
	expect((await failure(board(0.000001))).diagnostic.code).toBe("PCBIR031");
});

test("containment respects nonzero outline origins and mm, mil, and inch units", async () => {
	const land = definePhysicalFootprint({
		key: "outline:one-mil",
		features: [
			{
				id: "P",
				purpose: "pad",
				at: ["0nm", "0nm"],
				shape: { kind: "rect", size: ["1mil", "1mil"] },
				layers: ["front-copper"],
			},
		],
	});
	for (const [units, outline, at, outside] of [
		[
			"mm",
			rect(0.254, -0.254, 0.1016, 0.1016),
			[0.2667, -0.2413],
			[0.266699, -0.2413],
		],
		["mil", rect(10, -10, 4, 4), [10.5, -9.5], [10, -9.5]],
		["in", rect(0.01, -0.01, 0.004, 0.004), [0.0105, -0.0095], [0.01, -0.0095]],
	] as const) {
		const board = (position: readonly [number, number]) => (
			<Board outline={outline} units={units} layers={layers}>
				<Part id={part("P1")} footprint={land} at={position} connect={{}} />
			</Board>
		);
		await compile(board(at), options);
		expect((await failure(board(outside))).diagnostic.code).toBe("PCBIR031");
	}
});

test("containment uses rotated and reflected world geometry, not part centers", async () => {
	const offset = definePhysicalFootprint({
		key: "outline:offset",
		features: [
			{
				id: "P",
				purpose: "pad",
				at: ["1mm", "0mm"],
				shape: { kind: "rect", size: ["2mm", "4mm"] },
				layers: ["front-copper"],
			},
		],
	});
	const board = (side: "front" | "back", y: number) => (
		<Board outline={rect(0, 0, 4, 4)} layers={layers}>
			<Part
				id={part("P1")}
				footprint={offset}
				at={[2, y]}
				side={side}
				rotation={90}
				connect={{}}
			/>
		</Board>
	);
	await compile(board("front", 1), options);
	await compile(board("back", 3), options);
	expect((await failure(board("back", 1))).diagnostic.code).toBe("PCBIR031");
});

test("fabrication bodies and aperture/drill bounds are checked while courtyard and silk are not treated as bodies", async () => {
	const footprint = definePhysicalFootprint({
		key: "outline:body",
		features: [
			{
				id: "P",
				purpose: "pad",
				at: ["0mm", "0mm"],
				shape: { kind: "rect", size: ["0.2mm", "0.2mm"] },
				layers: ["front-copper"],
			},
			{
				id: "body",
				purpose: "fabrication",
				at: ["0mm", "0mm"],
				shape: { kind: "rect", size: ["2mm", "2mm"] },
				layers: ["front-fabrication"],
				stroke: "1nm",
			},
			{
				id: "court",
				purpose: "courtyard",
				at: ["0mm", "0mm"],
				shape: { kind: "rect", size: ["10mm", "10mm"] },
				layers: ["front-courtyard"],
			},
			{
				id: "silk",
				purpose: "silkscreen",
				at: ["0mm", "0mm"],
				shape: { kind: "rect", size: ["10mm", "10mm"] },
				layers: ["front-silkscreen"],
			},
		],
	});
	const board = (x: number) => (
		<Board outline={rect(0, 0, 4, 4)} layers={layers}>
			<Part id={part("P1")} footprint={footprint} at={[x, 2]} connect={{}} />
		</Board>
	);
	await compile(board(2), options);
	expect((await failure(board(1))).diagnostic.message).toContain(
		"features: body",
	);
	for (const feature of [
		{
			id: "mask",
			purpose: "mask-opening",
			at: ["0mm", "0mm"],
			shape: { kind: "circle", diameter: "2mm" },
			layers: ["front-mask"],
		},
		{
			id: "paste",
			purpose: "paste-opening",
			at: ["0mm", "0mm"],
			shape: { kind: "circle", diameter: "2mm" },
			layers: ["front-paste"],
		},
		{
			id: "hole",
			purpose: "non-plated-hole",
			at: ["0mm", "0mm"],
			shape: { kind: "circle", diameter: "2mm" },
			drill: { diameter: "2mm", plated: false },
		},
	] as const) {
		const fp = definePhysicalFootprint({
			key: `outline:${feature.id}`,
			features: [feature],
		});
		const error = await failure(
			<Board outline={rect(0, 0, 4, 4)} layers={layers}>
				<Part id={part("P1")} footprint={fp} at={[0.5, 2]} connect={{}} />
			</Board>,
		);
		expect(error.diagnostic.message).toContain(`features: ${feature.id}`);
	}
});

test("all overflowing parts are diagnosed deterministically and earlier unresolved warnings are retained", async () => {
	const a = (
		<Part key="A" id={part("A")} footprint={pad} at={[0, 0]} connect={{}} />
	);
	const b = (
		<Part key="B" id={part("B")} footprint={pad} at={[4, 4]} connect={{}} />
	);
	const board = (children: ReactNode) => (
		<Board outline={rect(0, 0, 4, 4)} layers={layers}>
			<Part id={part("library")} footprint="unresolved" connect={{}} />
			<Part id={part("unplaced")} footprint={pad} connect={{}} />
			{children}
		</Board>
	);
	const first = await failure(board([a, b]));
	const reordered = await failure(board([b, a]));
	expect([first.diagnostic, ...first.diagnostics]).toEqual([
		reordered.diagnostic,
		...reordered.diagnostics,
	]);
	expect(
		[first.diagnostic, ...first.diagnostics]
			.filter((d) => d.code === "PCBIR031")
			.map((d) => d.entity),
	).toEqual(["A", "B"]);
	expect(first.diagnostics.some((d) => d.code === "PCBIR024")).toBe(true);
});

test("projection and standalone board validation reject canonical IR whose outline was shrunk", async () => {
	const { ir } = await compile(
		<Board outline={rect(0, 0, 4, 4)} layers={layers}>
			<Part id={part("P1")} footprint={pad} at={[2, 2]} connect={{}} />
		</Board>,
		options,
	);
	const outline = ir.regions[ir.board.outline];
	if (!outline) throw new Error("Board outline fixture is missing");
	const shrunk = {
		...ir,
		regions: {
			...ir.regions,
			[ir.board.outline]: {
				...outline,
				geometry: { ...outline.geometry, width: 1 },
			},
		},
	};
	await expect(boardSvg(shrunk, options)).rejects.toMatchObject({
		diagnostic: { code: "PCBIR031" },
	});
	await expect(
		validateBoardManufacturing(
			shrunk,
			{
				schemaVersion: 1,
				key: "outline:process",
				minCopperFeature: "1nm",
				minCopperSpacing: "0nm",
				minDrillDiameter: "1nm",
				minAnnularRing: "0nm",
			},
			options,
		),
	).rejects.toMatchObject({ diagnostic: { code: "PCBIR031" } });
});

test("the complete ESC arrangement rejects a 10 by 36 mm outline without a profile", async () => {
	function NarrowEsc() {
		return cloneElement<BoardProps>(Esc(), { outline: rect(0, 0, 10, 36) });
	}
	const error = await failure(<NarrowEsc />);
	const findings = [error.diagnostic, ...error.diagnostics].filter(
		(d) => d.code === "PCBIR031",
	);
	expect(findings).toHaveLength(16);
	expect(findings.map((d) => d.entity)).toContain("control/U2");
	expect(findings.map((d) => d.entity)).toContain("power/J1");
	expect(findings.every((d) => d.help?.includes("enlarge the outline"))).toBe(
		true,
	);
});
