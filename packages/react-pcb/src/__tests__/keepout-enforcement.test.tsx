import { expect, test } from "bun:test";
import Basic from "../../../../examples/basic/board.tsx";
import {
	Board,
	boardSvg,
	compile,
	defineLayerSet,
	definePhysicalFootprint,
	Keepout,
	mechanicalLayer,
	net,
	Part,
	part,
	rect,
	validateBoardManufacturing,
	type BoardIr,
	type FeatureInput,
	type ManufacturingProfileInput,
} from "../index.ts";
import { testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const layers = defineLayerSet({
	...testLayers,
	technical: [
		...testLayers.technical,
		mechanicalLayer({ id: "reserved:a", purpose: "courtyard", side: "front" }),
		mechanicalLayer({ id: "reserved:b", purpose: "courtyard", side: "back" }),
	],
});
const copper = layers.stackup.entries.filter(
	(layer) => layer.kind === "copper",
);
const policy: ManufacturingProfileInput = {
	schemaVersion: 1,
	key: "keepout-test",
	minCopperFeature: "1nm",
	minCopperSpacing: "1nm",
	minDrillDiameter: "1nm",
	minAnnularRing: "0nm",
};
const signal = net("signal");
const land: FeatureInput = {
	id: "land",
	purpose: "pad",
	at: ["0mm", "0mm"],
	shape: { kind: "rect", size: ["2mm", "2mm"] },
	layers: ["front-copper"],
};
const reservation: FeatureInput = {
	id: "reserve",
	purpose: "courtyard",
	at: ["2mm", "0mm"],
	shape: { kind: "rect", size: ["2mm", "2mm"] },
	layers: ["front-courtyard"],
};
const footprint = definePhysicalFootprint({
	key: "keepout-land",
	features: [land, reservation],
});
const placed = (
	<Part
		id={part("U1")}
		footprint={footprint}
		at={[5, 5]}
		pinMap={{ P: "land" }}
		connect={{ P: signal }}
	/>
);
const coverage = (diagnostics: { code: string }[]) =>
	diagnostics.filter((d) => d.code === "PCBIR041");

test("keepout copper overlap blocks JSX builds independently of manufacturing profiles; contact passes", async () => {
	for (const manufacturingProfile of [undefined, policy]) {
		await expect(
			compile(
				<Board
					outline={rect(0, 0, 10, 10)}
					layers={layers}
					manufacturingProfile={manufacturingProfile}
				>
					{placed}
					<Keepout region={rect(5, 5, 1, 1)} disallow={["copper"]} />
				</Board>,
				options,
			),
		).rejects.toMatchObject({
			diagnostic: {
				code: "PCBIR040",
				entity: expect.any(String),
				message: expect.stringContaining("land of part U1"),
			},
		});
		const result = await compile(
			<Board
				outline={rect(0, 0, 10, 10)}
				layers={layers}
				manufacturingProfile={manufacturingProfile}
			>
				{placed}
				<Keepout
					region={rect(6, 4, 1, 2)}
					disallow={["copper", "tracks", "vias"]}
				/>
			</Board>,
			options,
		);
		expect(coverage(result.diagnostics)).toHaveLength(3);
		if (result.boardManufacturingReport) {
			expect(
				result.boardManufacturingReport.checks.find(
					(c) => c.id === "constraint-keepouts",
				),
			).toMatchObject({ status: "partial", skipped: 3 });
		}
	}
});

test("selected courtyard sides and concrete copper layers follow back-side reflection and rotation", async () => {
	const back = (
		<Part
			id={part("U1")}
			footprint={footprint}
			at={[5, 5]}
			side="back"
			rotation={90}
			pinMap={{ P: "land" }}
			connect={{ P: signal }}
		/>
	);
	for (const side of ["front", "back"] as const) {
		const run = compile(
			<Board outline={rect(0, 0, 10, 10)} layers={layers}>
				{back}
				<Keepout
					region={rect(4.5, 2.5, 1, 1)}
					disallow={["components"]}
					componentSides={[side]}
				/>
			</Board>,
			options,
		);
		if (side === "back")
			await expect(run).rejects.toMatchObject({
				diagnostic: {
					code: "PCBIR040",
					message: expect.stringContaining("back side"),
				},
			});
		else expect(coverage((await run).diagnostics)).toHaveLength(0);
	}
	for (const [index, layer] of copper.entries()) {
		const run = compile(
			<Board outline={rect(0, 0, 10, 10)} layers={layers}>
				{back}
				<Keepout
					region={rect(5, 5, 1, 1)}
					disallow={["copper"]}
					copperLayers={[layer]}
				/>
			</Board>,
			options,
		);
		if (index === copper.length - 1)
			await expect(run).rejects.toMatchObject({
				diagnostic: {
					code: "PCBIR040",
					message: expect.stringContaining(layer.id),
				},
			});
		else await run;
	}
});

test("net exceptions exempt bound pads while unknown-net copper and reservations remain restricted", async () => {
	const rule = (
		<Keepout
			region={rect(4, 4, 4, 2)}
			disallow={["copper"]}
			except={[signal]}
		/>
	);
	await compile(
		<Board outline={rect(0, 0, 10, 10)} layers={layers}>
			{placed}
			{rule}
		</Board>,
		options,
	);
	const unknown = definePhysicalFootprint({
		key: "unknown-copper",
		features: [land, { ...land, id: "raw", purpose: "copper" }],
	});
	await expect(
		compile(
			<Board outline={rect(0, 0, 10, 10)} layers={layers}>
				<Part
					id={part("U1")}
					footprint={unknown}
					at={[5, 5]}
					pinMap={{ P: "land" }}
					connect={{ P: signal }}
				/>
				{rule}
			</Board>,
			options,
		),
	).rejects.toMatchObject({
		diagnostic: { code: "PCBIR040", message: expect.stringContaining("raw") },
	});
	await expect(
		compile(
			<Board outline={rect(0, 0, 10, 10)} layers={layers}>
				{placed}
				<Keepout
					region={rect(4, 4, 4, 2)}
					disallow={["copper", "components"]}
					except={[signal]}
				/>
			</Board>,
			options,
		),
	).rejects.toMatchObject({
		diagnostic: {
			code: "PCBIR040",
			message: expect.stringContaining("reserve"),
		},
	});
});

test("missing geometry and reservations yield coverage findings without inferring bodies from pads", async () => {
	const noReservation = definePhysicalFootprint({
		key: "pad-only",
		features: [land],
	});
	const result = await compile(
		<Board outline={rect(0, 0, 10, 10)} layers={layers}>
			<Part
				id={part("pad-only")}
				footprint={noReservation}
				at={[5, 5]}
				connect={{}}
			/>
			<Part id={part("unplaced")} footprint={footprint} connect={{}} />
			<Part
				id={part("unresolved")}
				footprint="unresolved"
				at={[5, 5]}
				connect={{}}
			/>
			<Keepout region={rect(0, 0, 10, 10)} disallow={["components"]} />
		</Board>,
		options,
	);
	expect(coverage(result.diagnostics)).toHaveLength(3);
	const report = await validateBoardManufacturing(result.ir, policy, options);
	expect(
		report.checks.find((c) => c.id === "constraint-keepouts"),
	).toMatchObject({
		status: "skipped",
		evaluated: 0,
		skipped: 3,
		diagnostics: coverage(result.diagnostics),
	});
});

test("serialized keepout violations reach CLI-backed validation and projection with canonical IDs", async () => {
	const { ir } = await compile(
		<Board outline={rect(0, 0, 10, 10)} layers={layers}>
			{placed}
			<Keepout region={rect(6, 4, 1, 2)} disallow={["copper"]} />
		</Board>,
		options,
	);
	let modified: BoardIr = structuredClone(ir);
	const keepout = modified.keepouts[0];
	if (!keepout) throw new Error("Missing keepout");
	const region = modified.regions[keepout.region];
	if (!region) throw new Error("Missing region");
	modified = {
		...modified,
		regions: {
			...modified.regions,
			[keepout.region]: { ...region, geometry: { ...region.geometry, x: 5 } },
		},
	};
	const before = JSON.stringify(modified);
	const report = await validateBoardManufacturing(modified, policy, options);
	expect(report.conformsToCheckedRules).toBe(false);
	expect(
		report.checks.find((c) => c.id === "constraint-keepouts"),
	).toMatchObject({
		status: "failed",
		diagnostics: expect.arrayContaining([
			expect.objectContaining({ code: "PCBIR040", entity: keepout.id }),
		]),
	});
	await expect(boardSvg(modified, options)).rejects.toMatchObject({
		diagnostic: { code: "PCBIR040", entity: keepout.id },
	});
	expect(JSON.stringify(modified)).toBe(before);
});

test("basic board edge keepout allows contact while its original width reports USB land violations", async () => {
	const result = await compile(<Basic />, options);
	const keepout = result.ir.keepouts[0];
	if (!keepout) throw new Error("Missing keepout");
	const region = result.ir.regions[keepout.region];
	if (!region) throw new Error("Missing region");
	expect(region.geometry.width).toBe(0.745);
	expect(
		result.boardManufacturingReport?.checks.find(
			(c) => c.id === "constraint-keepouts",
		),
	).toMatchObject({ status: "partial", skipped: 3 });
	const original: BoardIr = {
		...result.ir,
		regions: {
			...result.ir.regions,
			[keepout.region]: {
				...region,
				geometry: { ...region.geometry, width: 8 },
			},
		},
	};
	const report = await validateBoardManufacturing(original, policy, options);
	const check = report.checks.find((c) => c.id === "constraint-keepouts");
	expect(check?.status).toBe("failed");
	expect(check?.diagnostics.filter((d) => d.code === "PCBIR040")).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				entity: keepout.id,
				message: expect.stringContaining("A1/B12 of part usb-controller/J1"),
			}),
		]),
	);
});
