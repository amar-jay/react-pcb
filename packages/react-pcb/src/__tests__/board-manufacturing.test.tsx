import { expect, test } from "bun:test";
import { LQFP48Footprint } from "../../../../examples/basic/footprints/LQFP48.tsx";
import { ManufacturingPassive } from "../../../../examples/basic/footprints/manufacturing.tsx";
import {
	Board,
	type BoardManufacturingReport,
	compile,
	copperLayer,
	defineLayerSet,
	definePhysicalFootprint,
	defineStackup,
	type FeatureInput,
	type ManufacturingProfileInput,
	Module,
	mechanicalLayer,
	net,
	Part,
	PcbCompileError,
	part,
	rect,
	renderFootprintDeclarations,
	useNet,
	usePart,
	validateBoardManufacturing,
} from "../index.ts";
import { assertDefined, testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const layers = defineLayerSet({
	...testLayers,
	technical: [
		...testLayers.technical,
		mechanicalLayer({
			id: "reserved/top",
			purpose: "courtyard",
			side: "front",
		}),
		mechanicalLayer({
			id: "reserved/bottom",
			purpose: "courtyard",
			side: "back",
		}),
		mechanicalLayer({
			id: "documentation/top",
			purpose: "fabrication",
			side: "front",
		}),
		mechanicalLayer({
			id: "documentation/bottom",
			purpose: "fabrication",
			side: "back",
		}),
		// Required by the actual MCU declaration.
		{ kind: "silkscreen", id: "legend/top", side: "front", color: "white" },
		{ kind: "silkscreen", id: "legend/bottom", side: "back", color: "white" },
	],
});
const policy: ManufacturingProfileInput = {
	schemaVersion: 1,
	key: "test:board",
	minCopperFeature: "1nm",
	minCopperSpacing: "1nm",
	minDrillDiameter: "1nm",
	minAnnularRing: "0nm",
	minCourtyardClearance: "0nm",
};
const check = (report: BoardManufacturingReport, id: string) =>
	assertDefined(report.checks.find((item) => item.id === id));
function land(
	key = "land",
	role: "front-copper" | "all-copper" = "front-copper",
	courtyard = true,
) {
	return definePhysicalFootprint({
		key,
		features: [
			{
				id: "P",
				purpose: "pad",
				at: ["0nm", "0nm"],
				shape: { kind: "rect", size: ["3nm", "3nm"] },
				layers: [role],
			},
			...(courtyard
				? ([
						{
							id: "reserve",
							purpose: "courtyard",
							at: ["0nm", "0nm"],
							shape: { kind: "rect", size: ["7nm", "7nm"] },
							layers: ["front-courtyard"],
						},
					] as FeatureInput[])
				: []),
		],
	});
}
async function pair({
	distance = 10,
	side = "front",
	footprint = land(),
	profile,
	connections = true,
}: {
	distance?: number;
	side?: "front" | "back";
	footprint?: ReturnType<typeof land>;
	profile?: ManufacturingProfileInput;
	connections?: boolean;
} = {}) {
	return compile(
		<Board
			outline={rect(-1, -1, 2, 2)}
			layers={layers}
			manufacturingProfile={profile}
		>
			<Part
				id={part("A")}
				at={[0, 0]}
				footprint={footprint}
				connect={connections ? { P: net("A") } : {}}
			/>
			<Part
				id={part("B")}
				at={[distance / 1e6, 0]}
				side={side}
				footprint={footprint}
				connect={connections ? { P: net("B") } : {}}
			/>
		</Board>,
		options,
	);
}

test("original C1/U1 placement reports both copper collisions and the inter-part courtyard overlap", async () => {
	const capacitor = await renderFootprintDeclarations(<ManufacturingPassive />);
	const mcu = await renderFootprintDeclarations(<LQFP48Footprint />);
	const element = (
		<Board outline={rect(0, 0, 60, 40)} layers={layers}>
			<Part
				id={part("U1")}
				footprint={mcu}
				at={[30, 20]}
				connect={{ 2: net("GND"), 3: net("GND") }}
			/>
			<Part
				id={part("C1")}
				footprint={capacitor}
				at={[27, 18]}
				connect={{ 1: net("3V3"), 2: net("GND") }}
			/>
		</Board>
	);
	const { ir } = await compile(element, options);
	const original = JSON.stringify(ir);
	const report = await validateBoardManufacturing(
		ir,
		{ ...policy, minCopperSpacing: "0.15mm", minCourtyardClearance: "0.2mm" },
		options,
	);
	expect(report.conformsToCheckedRules).toBe(false);
	expect(report.complete).toBe(false);
	expect(check(report, "board-copper-spacing").status).toBe("failed");
	const failures = check(report, "board-copper-spacing").diagnostics;
	expect(
		failures.some(
			(d) =>
				d.message.includes("part C1") &&
				d.message.includes("feature 2 of part U1"),
		),
	).toBe(true);
	expect(
		failures.some(
			(d) =>
				d.message.includes("part C1") &&
				d.message.includes("feature 3 of part U1"),
		),
	).toBe(true);
	expect(check(report, "inter-part-courtyard").status).toBe("failed");
	expect(
		check(report, "inter-part-courtyard").diagnostics[0]?.message,
	).toContain("front side");
	expect(JSON.stringify(ir)).toBe(original);
});

test("selected board rules reject compilation and retain every collision finding", async () => {
	try {
		await pair({ distance: 2, profile: policy });
		throw new Error("expected rejection");
	} catch (error) {
		expect(error).toBeInstanceOf(PcbCompileError);
		const e = error as PcbCompileError;
		expect(e.diagnostic.code).toBe("PCBMFG002");
		const findings = [...e.diagnostics, e.diagnostic];
		expect(findings.some((d) => d.help?.includes("board-copper-spacing"))).toBe(
			true,
		);
		expect(findings.some((d) => d.help?.includes("inter-part-courtyard"))).toBe(
			true,
		);
		expect(findings.some((d) => d.code === "PCBMFG003")).toBe(true);
	}
	const good = await pair({ profile: policy });
	expect(good.boardManufacturingReport?.conformsToCheckedRules).toBe(true);
	expect(good.boardManufacturingReport?.profile).toEqual(
		good.ir.board.manufacturingProfile,
	);
	expect((await pair()).boardManufacturingReport).toBeNull();
});

test("copper and courtyard boundary equality passes while interior overlap and insufficient gaps fail", async () => {
	const atBoundary = await pair({ distance: 4 });
	expect(
		check(
			await validateBoardManufacturing(atBoundary.ir, policy, options),
			"board-copper-spacing",
		).status,
	).toBe("passed");
	expect(
		check(
			await validateBoardManufacturing(
				(await pair({ distance: 3 })).ir,
				policy,
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("failed");
	const zero = { ...policy, minCopperSpacing: "0nm" } as const;
	expect(
		check(
			await validateBoardManufacturing(
				(await pair({ distance: 3 })).ir,
				zero,
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("passed");
	expect(
		check(
			await validateBoardManufacturing(
				(await pair({ distance: 2 })).ir,
				zero,
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("failed");
	expect(
		check(
			await validateBoardManufacturing(
				(await pair({ distance: 7 })).ir,
				policy,
				options,
			),
			"inter-part-courtyard",
		).status,
	).toBe("passed");
	expect(
		check(
			await validateBoardManufacturing(
				(await pair({ distance: 6 })).ir,
				policy,
				options,
			),
			"inter-part-courtyard",
		).status,
	).toBe("failed");
});

test("different physical copper layers and opposite-side courtyard envelopes do not collide", async () => {
	const report = await validateBoardManufacturing(
		(await pair({ distance: 0, side: "back" })).ir,
		policy,
		options,
	);
	expect(report.conformsToCheckedRules).toBe(true);
	expect(check(report, "board-copper-spacing").status).toBe("not-applicable");
	expect(check(report, "inter-part-courtyard").status).toBe("not-applicable");
	const through = await validateBoardManufacturing(
		(
			await pair({
				distance: 0,
				side: "back",
				footprint: land("through", "all-copper"),
			})
		).ir,
		policy,
		options,
	);
	expect(check(through, "board-copper-spacing").diagnostics).toHaveLength(2);
});

test("only established stable net IDs exempt copper spacing, never courtyards", async () => {
	const fp = land();
	const result = await compile(
		<Board outline={rect(0, 0, 1, 1)} layers={layers}>
			<Part
				id={part("A")}
				at={[0, 0]}
				footprint={fp}
				connect={{ P: net("shared") }}
			/>
			<Part
				id={part("B")}
				at={[0, 0]}
				footprint={fp}
				connect={{ P: net("shared") }}
			/>
		</Board>,
		options,
	);
	const report = await validateBoardManufacturing(result.ir, policy, options);
	expect(check(report, "board-copper-spacing").status).toBe("passed");
	expect(check(report, "inter-part-courtyard").status).toBe("failed");
	expect(
		check(
			await validateBoardManufacturing(
				(await pair({ distance: 0, connections: false })).ir,
				policy,
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("failed");
	function ScopedPart() {
		const id = usePart("P");
		const connected = useNet("same-name");
		return (
			<Part id={id} at={[0, 0]} footprint={fp} connect={{ P: connected }} />
		);
	}
	const isolated = await compile(
		<Board outline={rect(0, 0, 1, 1)} layers={layers}>
			{["one", "two"].map((name) => (
				<Module key={name} name={name}>
					<ScopedPart />
				</Module>
			))}
		</Board>,
		options,
	);
	expect(
		check(
			await validateBoardManufacturing(isolated.ir, policy, options),
			"board-copper-spacing",
		).status,
	).toBe("failed");
});

test("raw copper without pad net bindings remains checked even beside a connected pad", async () => {
	const graphic = definePhysicalFootprint({
		key: "graphic",
		features: [
			{
				id: "G",
				purpose: "copper",
				at: ["0nm", "0nm"],
				shape: { kind: "circle", diameter: "3nm" },
				layers: ["front-copper"],
			},
		],
	});
	const result = await compile(
		<Board outline={rect(0, 0, 1, 1)} layers={layers}>
			<Part
				id={part("A")}
				footprint={land()}
				at={[0, 0]}
				connect={{ P: net("GND") }}
			/>
			<Part id={part("B")} footprint={graphic} at={[0, 0]} connect={{}} />
		</Board>,
		options,
	);
	expect(
		check(
			await validateBoardManufacturing(result.ir, policy, options),
			"board-copper-spacing",
		).status,
	).toBe("failed");
});

test("world rotation, back-side reflection and curved separation use exact geometry", async () => {
	const fp = definePhysicalFootprint({
		key: "curved",
		features: [
			{
				id: "P",
				purpose: "pad",
				at: ["2nm", "0nm"],
				shape: { kind: "oval", size: ["6nm", "2nm"] },
				layers: ["all-copper"],
			},
		],
	});
	const dot = definePhysicalFootprint({
		key: "dot",
		features: [
			{
				id: "P",
				purpose: "pad",
				at: ["0nm", "0nm"],
				shape: { kind: "circle", diameter: "2nm" },
				layers: ["front-copper"],
			},
		],
	});
	// Reflect x=2nm, then rotate 90°: the oval center is (0,-2)nm, core y±2nm.
	// Dot at (3,4)nm has a 3-4-5 core gap and a 2nm total radius: 3nm clearance.
	const result = await compile(
		<Board outline={rect(-1, -1, 2, 2)} layers={layers}>
			<Part
				id={part("A")}
				footprint={fp}
				at={[0, 0]}
				side="back"
				rotation={90}
				connect={{ P: net("A") }}
			/>
			<Part
				id={part("B")}
				footprint={dot}
				at={[0.000003, 0.000004]}
				connect={{ P: net("B") }}
			/>
		</Board>,
		options,
	);
	expect(
		check(
			await validateBoardManufacturing(
				result.ir,
				{ ...policy, minCopperSpacing: "3nm" },
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("passed");
	expect(
		check(
			await validateBoardManufacturing(
				result.ir,
				{ ...policy, minCopperSpacing: "4nm" },
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("failed");
});

test("missing geometry and courtyards produce explicit partial or skipped coverage", async () => {
	const result = await compile(
		<Board outline={rect(0, 0, 1, 1)} layers={layers}>
			<Part
				id={part("A")}
				footprint={land()}
				at={[0, 0]}
				connect={{ P: net("A") }}
			/>
			<Part
				id={part("B")}
				footprint={land("no-courtyard", "front-copper", false)}
				at={[0.00002, 0]}
				connect={{ P: net("B") }}
			/>
			<Part id={part("U")} footprint={land()} connect={{}} />
			<Part id={part("L")} footprint="unresolved" at={[1, 1]} connect={{}} />
		</Board>,
		options,
	);
	const report = await validateBoardManufacturing(result.ir, policy, options);
	expect(check(report, "board-copper-spacing")).toMatchObject({
		status: "partial",
		evaluated: 1,
		skipped: 2,
	});
	expect(check(report, "inter-part-courtyard")).toMatchObject({
		status: "skipped",
		skipped: 3,
	});
	expect(
		check(report, "inter-part-courtyard").diagnostics.some(
			(d) => d.entity === "B" && d.message.includes("no declared courtyard"),
		),
	).toBe(true);
	const { minCourtyardClearance: _, ...withoutCourtyard } = policy;
	expect(
		check(
			await validateBoardManufacturing(result.ir, withoutCourtyard, options),
			"inter-part-courtyard",
		),
	).toMatchObject({ status: "skipped", skipped: 1 });
});

test("single-layer aliases and arbitrary courtyard layer IDs use physical metadata", async () => {
	const single = defineLayerSet({
		stackup: defineStackup([
			copperLayer({ id: "one:metal", thickness: 0.035 }),
		]),
		technical: layers.technical,
	});
	const fp = definePhysicalFootprint({
		key: "aliases",
		features: [
			{
				id: "F",
				purpose: "pad",
				at: ["0nm", "0nm"],
				shape: { kind: "rect", size: ["2nm", "2nm"] },
				layers: ["front-copper"],
			},
			{
				id: "B",
				purpose: "pad",
				at: ["0nm", "0nm"],
				shape: { kind: "rect", size: ["2nm", "2nm"] },
				layers: ["back-copper"],
			},
		],
	});
	const { ir } = await compile(
		<Board outline={rect(0, 0, 1, 1)} layers={single}>
			<Part
				id={part("A")}
				footprint={fp}
				at={[0, 0]}
				connect={{ F: net("F"), B: net("B") }}
			/>
		</Board>,
		options,
	);
	const report = await validateBoardManufacturing(ir, policy, options);
	expect(
		check(report, "board-copper-spacing").diagnostics[0]?.message,
	).toContain("one:metal");
	expect(check(report, "board-copper-spacing").status).toBe("failed");
});

test("reports are deterministic, immutable, unit-aware and reject forged realization or references", async () => {
	const result = await pair({ distance: 2 });
	const before = JSON.stringify(result.ir);
	const a = await validateBoardManufacturing(result.ir, policy, options);
	const reordered = {
		...result.ir,
		parts: [...result.ir.parts].reverse(),
		nets: [...result.ir.nets].reverse(),
		board: {
			...result.ir.board,
			layers: {
				...result.ir.board.layers,
				technical: [...result.ir.board.layers.technical].reverse(),
			},
		},
	};
	expect(await validateBoardManufacturing(reordered, policy, options)).toEqual(
		a,
	);
	expect(JSON.stringify(result.ir)).toBe(before);
	const forged = JSON.parse(before);
	forged.parts[0].physicalFeatures.P.geometry.at[0]++;
	await expect(
		validateBoardManufacturing(forged, policy, options),
	).rejects.toThrow("does not match");
	const missing = JSON.parse(before);
	delete missing.componentDefinitions[missing.parts[0].component];
	await expect(
		validateBoardManufacturing(missing, policy, options),
	).rejects.toThrow("missing component");
	const badNet = JSON.parse(before);
	badNet.parts[0].connections.P = "missing";
	await expect(
		validateBoardManufacturing(badNet, policy, options),
	).rejects.toThrow("missing net");
	await expect(
		validateBoardManufacturing(
			result.ir,
			{ ...policy, minCopperSpacing: "0.1nm" },
			options,
		),
	).rejects.toMatchObject({ diagnostic: { code: "PCBMFG001" } });
	const mil = await compile(
		<Board outline={rect(0, 0, 100, 100)} units="mil" layers={layers}>
			<Part
				id={part("A")}
				footprint={land()}
				at={[1, 1]}
				connect={{ P: net("A") }}
			/>
			<Part
				id={part("B")}
				footprint={land()}
				at={[2, 1]}
				connect={{ P: net("B") }}
			/>
		</Board>,
		options,
	);
	expect(
		check(
			await validateBoardManufacturing(
				mil.ir,
				{ ...policy, minCopperSpacing: "25397nm" },
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("passed");
	expect(
		check(
			await validateBoardManufacturing(
				mil.ir,
				{ ...policy, minCopperSpacing: "25398nm" },
				options,
			),
			"board-copper-spacing",
		).status,
	).toBe("failed");
});

test("curved courtyard reservations use actual shapes and allow multiple outlines within one part", async () => {
	const circular = definePhysicalFootprint({
		key: "round-envelope",
		features: [
			{
				id: "court-1",
				purpose: "courtyard",
				at: ["0nm", "0nm"],
				shape: { kind: "circle", diameter: "4nm" },
				layers: ["front-courtyard"],
			},
			{
				id: "court-2",
				purpose: "courtyard",
				at: ["0nm", "0nm"],
				shape: { kind: "circle", diameter: "2nm" },
				layers: ["front-courtyard"],
			},
		],
	});
	const element = (x: number) => (
		<Board outline={rect(0, 0, 1, 1)} layers={layers}>
			<Part id={part("A")} footprint={circular} at={[0, 0]} connect={{}} />
			<Part
				id={part("B")}
				footprint={circular}
				at={[x / 1e6, 0.000003]}
				connect={{}}
			/>
		</Board>
	);
	expect(
		check(
			await validateBoardManufacturing(
				(await compile(element(3), options)).ir,
				policy,
				options,
			),
			"inter-part-courtyard",
		),
	).toMatchObject({ status: "passed", evaluated: 4 });
	expect(
		check(
			await validateBoardManufacturing(
				(await compile(element(2), options)).ir,
				policy,
				options,
			),
			"inter-part-courtyard",
		).status,
	).toBe("failed");
});
