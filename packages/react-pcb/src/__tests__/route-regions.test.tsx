import { expect, test } from "bun:test";
import type { ReactNode } from "react";
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
	PcbCompileError,
	pad,
	part,
	Route,
	RouteThrough,
	rect,
	validateBoardManufacturing,
} from "../index.ts";
import { assertDefined, testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const policy: ManufacturingProfileInput = {
	schemaVersion: 1,
	key: "route-regions",
	minCopperFeature: "1nm",
	minCopperSpacing: "1nm",
	minDrillDiameter: "1nm",
	minAnnularRing: "0nm",
};
const positive = net("signal", "net/P");
const negative = net("signal", "net/N"); // Same name never means the same net.
const source = part("U1");
const target = part("U2");
const copper = testLayers.stackup.entries.filter(
	(layer) => layer.kind === "copper",
);
const defaultVisits = <RouteThrough key="visit" region={rect(2, 2, 2, 2)} />;
function RoutingBoard({
	pair = false,
	visits = defaultVisits,
	rules,
	manufacturingProfile,
}: {
	pair?: boolean;
	visits?: ReactNode;
	rules?: ReactNode;
	manufacturingProfile?: ManufacturingProfileInput;
}) {
	return (
		<Board
			outline={rect(0, 0, 10, 10)}
			layers={testLayers}
			manufacturingProfile={manufacturingProfile}
		>
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
					width={100}
					gap={100}
				>
					{visits}
				</DifferentialPair>
			) : (
				<Route
					net={positive}
					from={pad(source, "P")}
					to={pad(target, "P")}
					width={100}
				>
					{visits}
				</Route>
			)}
			{rules}
		</Board>
	);
}
function routingDiagnostics(diagnostics: { code: string }[]) {
	return diagnostics.filter(
		(d) => d.code === "PCBIR042" || d.code === "PCBIR043",
	);
}
async function failure(node: ReactNode) {
	try {
		await compile(node, options);
	} catch (error) {
		if (error instanceof PcbCompileError) return error;
		throw error;
	}
	throw new Error("Expected blocked route to fail");
}

test("blocked ordinary and differential waypoints reject regardless of profile while retaining coverage", async () => {
	for (const pair of [false, true])
		for (const manufacturingProfile of [undefined, policy]) {
			const error = await failure(
				<RoutingBoard
					pair={pair}
					manufacturingProfile={manufacturingProfile}
					rules={<Keepout region={rect(1, 1, 4, 4)} disallow={["tracks"]} />}
				/>,
			);
			expect(error.diagnostic).toMatchObject({
				code: "PCBIR042",
				message: expect.stringContaining("waypoint 1"),
			});
			const all = [error.diagnostic, ...error.diagnostics];
			expect(all.filter((d) => d.code === "PCBIR042")).toHaveLength(
				pair ? 2 : 1,
			);
			expect(all.filter((d) => d.code === "PCBIR043")).toHaveLength(1);
			expect(all.some((d) => d.code === "PCBIR041")).toBe(true);
			expect(
				all.some((d) => d.code === "PCBIR034" && d.entity === "net/P"),
			).toBe(false);
		}
});

test("joint coverage proves blockage; exact boundary contact, seams and partial coverage remain candidates", async () => {
	for (const overlap of [false, true]) {
		const node = (
			<RoutingBoard
				rules={
					<>
						<Keepout
							key="left"
							region={rect(1, 1, 2, 4)}
							disallow={["tracks"]}
						/>
						<Keepout
							key="right"
							region={rect(overlap ? 2.5 : 3, 1, 2.5, 4)}
							disallow={["copper"]}
						/>
					</>
				}
			/>
		);
		if (overlap) expect((await failure(node)).diagnostic.code).toBe("PCBIR042");
		else
			expect(
				routingDiagnostics((await compile(node, options)).diagnostics),
			).toHaveLength(1);
	}
	for (const area of [rect(2, 2, 2, 2), rect(3, 1, 2, 4), rect(4, 2, 2, 2)]) {
		await compile(
			<RoutingBoard
				pair
				rules={<Keepout region={area} disallow={["tracks"]} />}
			/>,
			options,
		);
	}
});

test("scope and stable net exceptions leave eligible layers and check each pair leg independently", async () => {
	const front = assertDefined(copper[0]);
	await compile(
		<RoutingBoard
			pair
			rules={
				<Keepout
					region={rect(1, 1, 4, 4)}
					disallow={["tracks"]}
					copperLayers={[front]}
				/>
			}
		/>,
		options,
	);
	await compile(
		<RoutingBoard
			rules={
				<Keepout
					region={rect(1, 1, 4, 4)}
					disallow={["tracks"]}
					except={[positive]}
				/>
			}
		/>,
		options,
	);
	for (const exempt of [positive, negative]) {
		const error = await failure(
			<RoutingBoard
				pair
				rules={
					<Keepout
						region={rect(1, 1, 4, 4)}
						disallow={["tracks"]}
						except={[exempt]}
					/>
				}
			/>,
		);
		expect(error.diagnostic.message).toContain(
			`net ${exempt === positive ? "net/N" : "net/P"}`,
		);
		expect(
			[error.diagnostic, ...error.diagnostics].filter(
				(d) => d.code === "PCBIR042",
			),
		).toHaveLength(1);
	}
	await compile(
		<RoutingBoard
			pair
			rules={
				<Keepout region={rect(1, 1, 4, 4)} disallow={["components", "vias"]} />
			}
		/>,
		options,
	);
});

test("narrow disjoint ordered visits keep graph intent and report unverified traversal without inventing traces", async () => {
	for (const pair of [false, true]) {
		const result = await compile(
			<RoutingBoard
				pair={pair}
				manufacturingProfile={policy}
				visits={
					<>
						<RouteThrough key="first" region={rect(1, 1, 0.000001, 0.000001)} />
						<RouteThrough key="last" region={rect(8, 8, 1, 1)} />
					</>
				}
				rules={<Keepout region={rect(4, 0, 1, 10)} disallow={["tracks"]} />}
			/>,
			options,
		);
		const owner = assertDefined(
			pair ? result.ir.differentialPairs[0] : result.ir.routeConstraints[0],
		);
		expect(
			owner.through.map((id) => result.ir.regions[id]?.geometry.x),
		).toEqual([1, 8]);
		const warnings = result.diagnostics.filter((d) => d.code === "PCBIR043");
		expect(warnings).toHaveLength(1);
		for (const category of [
			"traversal",
			"ordering",
			"width/gap",
			"transitions",
			"remaining path feasibility",
		])
			expect(warnings[0]?.message).toContain(category);
		expect(
			result.diagnostics.filter(
				(d) => d.code === "PCBIR034" && d.entity === positive.id,
			),
		).toEqual([]);
		expect(
			result.boardManufacturingReport?.checks.find(
				(c) => c.id === "constraint-routes",
			),
		).toMatchObject({
			status: "partial",
			evaluated: pair ? 4 : 2,
			skipped: 1,
			diagnostics: warnings,
		});
		expect(
			(await boardSvg(result.ir, options)).diagnostics.filter(
				(d) => d.code === "PCBIR043",
			),
		).toEqual(warnings);
	}
	const result = await compile(<RoutingBoard visits={null} />, options);
	expect(
		(await validateBoardManufacturing(result.ir, policy, options)).checks.find(
			(c) => c.id === "constraint-routes",
		),
	).toMatchObject({ status: "skipped", evaluated: 0, skipped: 1 });
});

test("serialized CLI-backed consumers enforce blocked visits and preserve ordered references and immutable data", async () => {
	const result = await compile(
		<RoutingBoard
			pair
			rules={<Keepout region={rect(5, 1, 2, 4)} disallow={["tracks"]} />}
		/>,
		options,
	);
	const keepout = assertDefined(result.ir.keepouts[0]);
	const region = assertDefined(result.ir.regions[keepout.region]);
	const owner = assertDefined(result.ir.differentialPairs[0]);
	const modified: BoardIr = {
		...result.ir,
		regions: {
			...result.ir.regions,
			[keepout.region]: {
				...region,
				geometry: { ...region.geometry, x: 1, width: 4 },
			},
		},
		differentialPairs: [
			{ ...owner, through: [...owner.through, ...owner.through] },
		],
	};
	const before = JSON.stringify(modified);
	const report = await validateBoardManufacturing(modified, policy, options);
	expect(report.conformsToCheckedRules).toBe(false);
	const check = assertDefined(
		report.checks.find((c) => c.id === "constraint-routes"),
	);
	expect(check).toMatchObject({ status: "failed", evaluated: 4, skipped: 1 });
	expect(check.diagnostics.filter((d) => d.code === "PCBIR042")).toHaveLength(
		4,
	);
	await expect(boardSvg(modified, options)).rejects.toMatchObject({
		diagnostic: { code: "PCBIR042", entity: owner.id },
	});
	expect(JSON.stringify(modified)).toBe(before);
});

test("empty and blocked visits retain region warnings, keepout coverage and routing coverage together", async () => {
	for (const pair of [false, true]) {
		const error = await failure(
			<RoutingBoard
				pair={pair}
				manufacturingProfile={policy}
				visits={
					<>
						<RouteThrough key="empty" region={rect(10, 1, 2, 2)} />
						<RouteThrough key="blocked" region={rect(2, 2, 2, 2)} />
					</>
				}
				rules={
					<>
						<Keepout
							key="block"
							region={rect(1, 1, 4, 4)}
							disallow={["tracks"]}
						/>
						<Keepout
							key="outside"
							region={rect(20, 0, 2, 2)}
							disallow={["vias"]}
						/>
					</>
				}
			/>,
		);
		expect(error.diagnostic.code).toBe("PCBIR039");
		for (const code of ["PCBIR039", "PCBIR041", "PCBIR042", "PCBIR043"])
			expect(error.diagnostics.some((d) => d.code === code)).toBe(true);
	}
});
