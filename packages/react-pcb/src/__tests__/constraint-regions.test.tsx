import { expect, test } from "bun:test";
import {
	Board,
	type BoardIr,
	boardSvg,
	compile,
	DifferentialPair,
	Keepout,
	type ManufacturingProfileInput,
	net,
	Part,
	pad,
	part,
	Route,
	RouteThrough,
	rect,
	upgradeBoardIr,
	validateBoardManufacturing,
	Zone,
} from "../index.ts";
import { testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const policy: ManufacturingProfileInput = {
	schemaVersion: 1,
	key: "region-test",
	minCopperFeature: "1nm",
	minCopperSpacing: "1nm",
	minDrillDiameter: "1nm",
	minAnnularRing: "0nm",
};
const positive = net("P");
const negative = net("N");
const source = part("U1");
const target = part("U2");
const copper = testLayers.stackup.entries.filter(
	(layer) => layer.kind === "copper",
);

function RegionBoard({ x = 1, pair = false }: { x?: number; pair?: boolean }) {
	const waypoint = <RouteThrough region={rect(x, 1, 2, 2)} />;
	return (
		<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
			<Part
				id={source}
				footprint="TEST"
				connect={{ P: positive, N: negative }}
			/>
			<Part
				id={target}
				footprint="TEST"
				connect={{ P: positive, N: negative }}
			/>
			{pair ? (
				<DifferentialPair
					positive={positive}
					negative={negative}
					from={[pad(source, "P"), pad(source, "N")]}
					to={[pad(target, "P"), pad(target, "N")]}
				>
					{waypoint}
				</DifferentialPair>
			) : (
				<Route net={positive} from={pad(source, "P")} to={pad(target, "P")}>
					{waypoint}
				</Route>
			)}
			<Zone net={negative} layers={copper} boundary={rect(12, 1, 2, 2)} />
			<Keepout region={rect(10, 1, 2, 2)} disallow={["vias"]} />
		</Board>
	);
}

test("JSX regions reject sub-nm precision and overflow during compilation, including unrendered zones", async () => {
	for (const x of [0.0000001, 1e30, 9_007_199_254]) {
		const region = rect(x, 1, 10, 2);
		for (const declaration of [
			<Keepout key="keepout" region={region} disallow={["vias"]} />,
			<Zone key="zone" net={negative} layers={copper} boundary={region} />,
		]) {
			await expect(
				compile(
					<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
						{declaration}
					</Board>,
					options,
				),
			).rejects.toMatchObject({ diagnostic: { code: "PCBIR037" } });
		}
	}
	await expect(
		compile(<RegionBoard x={0.0000001} />, options),
	).rejects.toMatchObject({ diagnostic: { code: "PCBIR037" } });
});

test("mm, mil and inch region projections agree without changing declared coordinates", async () => {
	const projections = [];
	for (const [units, step] of [
		["mm", 0.0254],
		["mil", 1],
		["in", 0.001],
	] as const) {
		const result = await compile(
			<Board
				outline={rect(0, 0, step * 100, step * 100)}
				units={units}
				layers={testLayers}
			>
				<Keepout
					region={rect(-step, step, step * 2, step)}
					disallow={["vias"]}
				/>
			</Board>,
			options,
		);
		expect(
			Object.values(result.ir.regions).some(
				(region) => region.geometry.x === -step,
			),
		).toBe(true);
		projections.push((await boardSvg(result.ir, options)).svg);
	}
	expect(projections[0]).toBe(projections[1]);
	expect(projections[1]).toBe(projections[2]);
});

test("off-board boundaries warn in compiler, projection and standalone validation; both waypoint types fail", async () => {
	for (const pair of [false, true]) {
		const result = await compile(<RegionBoard x={9} pair={pair} />, options);
		const before = JSON.stringify(result.ir);
		const warnings = result.diagnostics.filter(
			(diagnostic) => diagnostic.code === "PCBIR039",
		);
		expect(warnings).toHaveLength(2);
		expect(warnings.every((warning) => warning.severity === "warning")).toBe(
			true,
		);
		const projection = await boardSvg(result.ir, options);
		expect(
			projection.diagnostics.filter(
				(diagnostic) => diagnostic.code === "PCBIR039",
			),
		).toEqual(warnings);
		const report = await validateBoardManufacturing(result.ir, policy, options);
		expect(
			report.checks.find((check) => check.id === "constraint-regions")
				?.diagnostics,
		).toEqual(warnings);
		expect(await upgradeBoardIr(result.ir, options)).toEqual(result.ir);
		expect(JSON.stringify(result.ir)).toBe(before);
		for (const x of [10, 12]) {
			await expect(
				compile(<RegionBoard x={x} pair={pair} />, options),
			).rejects.toMatchObject({ diagnostic: { code: "PCBIR039" } });
		}
	}
});

test("malformed serialized regions and references reject consistently across CLI-backed consumers", async () => {
	const { ir } = await compile(<RegionBoard />, options);
	const mutations: [string, (value: ReturnType<typeof JSON.parse>) => void][] =
		[
			[
				"PCBIR038",
				(value) => {
					value.regions[value.board.outline].id = "wrong";
				},
			],
			[
				"PCBIR038",
				(value) => {
					value.zones[0].boundary = "missing";
				},
			],
			[
				"PCBIR038",
				(value) => {
					value.routeConstraints[0].through = [value.keepouts[0].id];
				},
			],
			[
				"PCBIR038",
				(value) => {
					value.zones[0].net = "missing";
				},
			],
			[
				"PCBIR038",
				(value) => {
					value.keepouts[0].except = ["missing"];
				},
			],
			[
				"PCBIR038",
				(value) => {
					value.zones[0].layers = ["solder-mask/front"];
				},
			],
			[
				"PCBIR038",
				(value) => {
					value.keepouts[0].id = value.zones[0].id;
				},
			],
			[
				"PCBIR037",
				(value) => {
					value.regions[value.zones[0].boundary].geometry.width = 0.0000001;
				},
			],
			[
				"PCBIR039",
				(value) => {
					value.regions[value.routeConstraints[0].through[0]].geometry.x = 10;
				},
			],
		];
	for (const [code, mutate] of mutations) {
		const value = structuredClone(ir);
		mutate(value);
		for (const consume of [
			(board: BoardIr) => boardSvg(board, options),
			(board: BoardIr) => validateBoardManufacturing(board, policy, options),
			(board: BoardIr) => upgradeBoardIr(board, options),
		]) {
			await expect(consume(value)).rejects.toMatchObject({
				diagnostic: { code },
			});
		}
	}
});
