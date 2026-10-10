import { expect, test } from "bun:test";
import {
	Board,
	compile,
	DifferentialPair,
	Keepout,
	Module,
	net,
	Part,
	PcbCompileError,
	pad,
	part,
	Route,
	RouteThrough,
	rect,
	Zone,
} from "../index.ts";
import { assertDefined, testLayers } from "./fixtures.ts";

const positive = net("P");
const negative = net("N");
const first = part("U1");
const second = part("U2");
const options = {
	cwd: `${import.meta.dir}/../../../..`,
	hideWarnings: true,
	baseRevision: 10,
};

function design(reverse: boolean, width: number) {
	const corridors = [
		<RouteThrough key="entry" region={rect(1, 1, width, 2)} />,
		<RouteThrough key="exit" region={rect(5, 1, 2, 2)} />,
	];
	const declarations = [
		<Part
			key="first"
			id={first}
			footprint="TEST"
			connect={{ P: positive, N: negative }}
		/>,
		<Part
			key="second"
			id={second}
			footprint="TEST"
			connect={{ P: positive, N: negative }}
		/>,
		<Route
			key="supply-route"
			net={positive}
			from={pad(first, "P")}
			to={pad(second, "P")}
			width={width}
		>
			{reverse ? [...corridors].reverse() : corridors}
		</Route>,
		<DifferentialPair
			key="data-pair"
			positive={positive}
			negative={negative}
			from={[pad(first, "P"), pad(first, "N")]}
			to={[pad(second, "P"), pad(second, "N")]}
		/>,
		<Zone
			key="plane"
			net={negative}
			layers={[
				testLayers.stackup
					.entries[0] as import("../layers/index.ts").CopperLayer,
			]}
			boundary="board"
			clearance={width}
		/>,
		<Keepout
			key="edge-clearance"
			region={rect(1, 1, width, 2)}
			disallow={["vias"]}
		/>,
	];
	return (
		<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
			{reverse ? declarations.reverse() : declarations}
		</Board>
	);
}

test("JSX without constraint IDs compiles to stable IR identities and normalized references", async () => {
	const firstResult = await compile(design(false, 2), options);
	const secondResult = await compile(design(true, 3), options);
	const before = firstResult.ir;
	const after = secondResult.ir;
	expect(after.schemaVersion).toBe(3);
	expect(after.revision).toBe(11);
	expect(after.board).toEqual(before.board);
	expect(after.routeConstraints[0]?.id).toBe(before.routeConstraints[0]?.id);
	expect(after.routeConstraints[0]?.through).toEqual(
		[...assertDefined(before.routeConstraints[0]).through].reverse(),
	);
	expect(after.differentialPairs[0]?.id).toBe(before.differentialPairs[0]?.id);
	expect(after.zones[0]?.id).toBe(before.zones[0]?.id);
	expect(after.keepouts[0]?.id).toBe(before.keepouts[0]?.id);
	expect(after.zones[0]?.layers).toEqual(["copper/1"]);
	expect(after.zones[0]?.boundary).toBe(after.board.outline);
	expect(
		after.regions[assertDefined(after.keepouts[0]).region]?.geometry.width,
	).toBe(3);
	for (const [id, region] of Object.entries(after.regions))
		expect(region.id).toBe(id);
	expect(JSON.stringify(after)).not.toContain("sourceKey");
	expect(secondResult.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
		["PCBIR024", "PCBIR041"],
	);
});

test("invalid references fail through the TypeScript compiler bridge", async () => {
	try {
		await compile(
			<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
				<Route net={positive} from={pad(first, "P")} to={pad(second, "P")} />
			</Board>,
			options,
		);
		throw new Error("expected compilation to fail");
	} catch (error) {
		expect(error).toBeInstanceOf(PcbCompileError);
		expect((error as PcbCompileError).diagnostic.code).toBe("PCBIR002");
	}
});

function repeatedDesign(changed: boolean) {
	const names = changed ? ["inserted", "second", "first"] : ["first", "second"];
	const waypoints = changed ? ["exit", "middle", "entry"] : ["entry", "exit"];
	const declarations = names.flatMap((name) => [
		<Route
			key={`route-${name}`}
			net={positive}
			from={pad(first, "P")}
			to={pad(second, "P")}
		>
			{waypoints.map((key) => (
				<RouteThrough key={key} region={rect(1, 1, changed ? 3 : 2, 2)} />
			))}
		</Route>,
		<DifferentialPair
			key={`pair-${name}`}
			positive={positive}
			negative={negative}
			from={[pad(first, "P"), pad(first, "N")]}
			to={[pad(second, "P"), pad(second, "N")]}
		>
			{waypoints.map((key) => (
				<RouteThrough key={key} region={rect(1, 1, changed ? 3 : 2, 2)} />
			))}
		</DifferentialPair>,
		<Zone
			key={`zone-${name}`}
			net={negative}
			layers={testLayers.stackup.entries.filter(
				(layer) => layer.kind === "copper",
			)}
			boundary={rect(1, 1, changed ? 3 : 2, 2)}
			clearance={changed ? 0.3 : 0.2}
		/>,
		<Keepout
			key={`keepout-${name}`}
			region={rect(1, 1, changed ? 3 : 2, 2)}
			disallow={["vias"]}
		/>,
	]);
	return (
		<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
			<Part
				id={first}
				footprint="TEST"
				connect={{ P: positive, N: negative }}
			/>
			<Part
				id={second}
				footprint="TEST"
				connect={{ P: positive, N: negative }}
			/>
			<Module name="left">{declarations}</Module>
			<Module name="right">{declarations}</Module>
		</Board>
	);
}

test("repeated keyed JSX declarations retain IDs across insertion, reordering and geometry edits in local owners", async () => {
	const before = (await compile(repeatedDesign(false), options)).ir;
	const after = (await compile(repeatedDesign(true), options)).ir;
	for (const [oldConstraints, newConstraints] of [
		[before.routeConstraints, after.routeConstraints],
		[before.differentialPairs, after.differentialPairs],
		[before.zones, after.zones],
		[before.keepouts, after.keepouts],
	] as const) {
		expect(oldConstraints).toHaveLength(4);
		expect(
			new Set(oldConstraints.map((constraint) => constraint.id)).size,
		).toBe(4);
		for (const old of oldConstraints)
			expect(
				newConstraints.some((constraint) => constraint.id === old.id),
			).toBe(true);
	}
	for (const [oldRoutes, newRoutes] of [
		[before.routeConstraints, after.routeConstraints],
		[before.differentialPairs, after.differentialPairs],
	] as const) {
		for (const old of oldRoutes) {
			const next = assertDefined(
				newRoutes.find((constraint) => constraint.id === old.id),
			);
			expect(next.through[0]).toBe(old.through[1]);
			expect(next.through[2]).toBe(old.through[0]);
		}
	}
	for (const id of Object.keys(before.regions))
		expect(after.regions[id]?.id).toBe(id);
	expect(JSON.stringify(after)).not.toContain("sourceKey");
});

test("unkeyed JSX collisions identify declaration type and module or routing owner", async () => {
	const board = (children: import("react").ReactNode) => (
		<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
			<Part id={first} footprint="TEST" connect={{ P: positive }} />
			<Part id={second} footprint="TEST" connect={{ P: positive }} />
			<Module name="control">{children}</Module>
		</Board>
	);
	const cases = [
		[
			"Keepout",
			<>
				<Keepout region={rect(1, 1, 2, 2)} disallow={["vias"]} />
				<Keepout region={rect(5, 1, 2, 2)} disallow={["vias"]} />
			</>,
		],
		[
			"Zone",
			<>
				<Zone
					net={negative}
					layers={testLayers.stackup.entries.filter(
						(layer) => layer.kind === "copper",
					)}
					boundary={rect(1, 1, 2, 2)}
				/>
				<Zone
					net={negative}
					layers={testLayers.stackup.entries.filter(
						(layer) => layer.kind === "copper",
					)}
					boundary={rect(5, 1, 2, 2)}
				/>
			</>,
		],
		[
			"RouteThrough",
			<Route
				key="waypoint-owner"
				net={positive}
				from={pad(first, "P")}
				to={pad(second, "P")}
			>
				<RouteThrough region={rect(1, 1, 2, 2)} />
				<RouteThrough region={rect(5, 1, 2, 2)} />
			</Route>,
		],
	] as const;
	for (const [name, children] of cases) {
		await expect(compile(board(children), options)).rejects.toMatchObject({
			diagnostic: {
				code: "PCBIR029",
				message: expect.stringContaining(
					name === "RouteThrough"
						? "RouteThrough in routing constraint route/"
						: `${name} in module "control"`,
				),
				help: expect.stringContaining(`<${name} key="`),
			},
		});
	}
});

test("identical and edited JSX declarations with conflicting keys report identity errors", async () => {
	for (const edited of [false, true]) {
		const declarations = [
			<Keepout key="same" region={rect(1, 1, 2, 2)} disallow={["vias"]} />,
			<Keepout
				key="same"
				region={rect(edited ? 5 : 1, 1, 2, 2)}
				disallow={["vias"]}
			/>,
		];
		await expect(
			compile(
				<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
					{declarations}
				</Board>,
				options,
			),
		).rejects.toMatchObject({
			diagnostic: {
				code: "PCBIR029",
				message: expect.stringContaining(
					"conflicting frontend identity key: Keepout in board board/1",
				),
				help: expect.stringContaining("distinct, stable key"),
			},
		});
	}
});

test("a keyed circuit wrapper does not distinguish its unkeyed repeated keepouts", async () => {
	function Circuit() {
		return (
			<>
				<Keepout region={rect(1, 1, 2, 2)} disallow={["vias"]} />
				<Keepout region={rect(5, 1, 2, 2)} disallow={["vias"]} />
			</>
		);
	}
	await expect(
		compile(
			<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
				<Circuit key="circuit" />
			</Board>,
			options,
		),
	).rejects.toMatchObject({
		diagnostic: {
			code: "PCBIR029",
			message: expect.stringContaining(
				"ambiguous declaration identity: Keepout",
			),
		},
	});
});
