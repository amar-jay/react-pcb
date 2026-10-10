import { beforeAll, expect, test } from "bun:test";
import {
	Board,
	type BoardIr,
	boardSvg,
	type CompilerDiagnostic,
	compile,
	DifferentialPair,
	Keepout,
	net,
	Part,
	PcbCompileError,
	pad,
	part,
	Route,
	RouteThrough,
	rect,
	Zone,
} from "@react-pcb/core";
import { DOMParser } from "linkedom";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasConstraintDiagnostic } from "../frontend/components/canvas-constraint-diagnostic.tsx";
import { ConstraintInspector } from "../frontend/components/constraint-inspector.tsx";
import { DiagnosticList } from "../frontend/components/diagnostics-panel.tsx";
import { parseBoardPreferences } from "../frontend/lib/board-preferences.ts";
import {
	boardFitView,
	constraintEntries,
	constraintFocusView,
	constraintGeometry,
	highlightConstraintRegions,
	regionSelection,
	sameConstraintRegion,
} from "../frontend/lib/constraint-scene.ts";
import { presetVisibility } from "../frontend/lib/layer-presets.ts";
import { diagnosticBoardSvg } from "../frontend/lib/outline-diagnostic.ts";
import { sceneLayers } from "../frontend/lib/scene.ts";
import {
	applyScenePresentation,
	exportBoardSvg,
} from "../frontend/lib/scene-presentation.ts";
import { assertDefined, testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const p = net("Signal <P>", "positive"),
	n = net("Signal <P>", "negative");
const a = part("U1"),
	b = part("U2");
const copper = testLayers.stackup.entries.filter(
	(layer) => layer.kind === "copper",
);
function Fixture({
	blocked = false,
	outside = false,
}: {
	blocked?: boolean;
	outside?: boolean;
}) {
	return (
		<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
			<Part id={a} footprint="TEST" connect={{ P: p, N: n }} />
			<Part id={b} footprint="TEST" connect={{ P: p, N: n }} />
			<Route net={p} from={pad(a, "P")} to={pad(b, "P")} width={0.2}>
				<RouteThrough key="first" region={rect(outside ? 30 : 1, 1, 2, 2)} />
				<RouteThrough key="second" region={rect(4, 4, 2, 2)} />
			</Route>
			<DifferentialPair
				positive={p}
				negative={n}
				from={[pad(a, "P"), pad(a, "N")]}
				to={[pad(b, "P"), pad(b, "N")]}
				width={0.2}
				gap={0.15}
			>
				<RouteThrough region={rect(7, 7, 2, 2)} />
			</DifferentialPair>
			<Keepout
				region={rect(blocked ? 0 : 11, 0, 5, 5)}
				disallow={["tracks", "components"]}
				componentSides={["back"]}
				except={[n]}
			/>
			<Zone
				net={n}
				layers={copper}
				boundary={rect(-12, -3, 30, 20)}
				clearance={0.3}
			/>
		</Board>
	);
}
let ir: BoardIr, markup: string;
beforeAll(async () => {
	const built = await compile(<Fixture />, options);
	const route = assertDefined(built.ir.routeConstraints[0]);
	const first = assertDefined(route.through[0]);
	const region = assertDefined(built.ir.regions[first]);
	const regions = { ...built.ir.regions };
	delete regions[first];
	regions["shared<&region"] = { ...region, id: "shared<&region" };
	ir = {
		...built.ir,
		regions,
		routeConstraints: [
			{
				...route,
				id: "owner<&route",
				through: [
					"shared<&region",
					assertDefined(route.through[1]),
					"shared<&region",
				],
			},
		],
		zones: [{ ...assertDefined(built.ir.zones[0]), id: "owner<&zone" }],
	};
	markup = (await boardSvg(ir, options)).svg;
});
function parse(svg = markup) {
	return new DOMParser().parseFromString(
		svg,
		"text/html",
	) as unknown as Document;
}
function root(document: Document) {
	return document.documentElement as unknown as SVGSVGElement;
}

test("all intent overlays project stable ownership, descriptive names, ordered repeated visits and full scene bounds", () => {
	const before = JSON.stringify(ir);
	const document = parse();
	const svg = root(document);
	const layers = sceneLayers(markup, ir, document);
	expect(
		layers
			.filter((layer) => ["keepouts", "zones", "waypoints"].includes(layer.id))
			.map((layer) => [layer.id, layer.visible]),
	).toEqual([
		["zones", true],
		["keepouts", true],
		["waypoints", true],
	]);
	expect(svg.getAttribute("viewBox")).toBe("-13 -4 32 22");
	expect(boardFitView(svg)).toEqual([-1, -1, 12, 12]);
	const repeated = [
		...svg.querySelectorAll('[data-region-id="shared<&region"]'),
	];
	expect(repeated.map((item) => regionSelection(item))).toEqual([
		{ constraintId: "owner<&route", regionId: "shared<&region", waypoint: 1 },
		{ constraintId: "owner<&route", regionId: "shared<&region", waypoint: 3 },
	]);
	expect(repeated[0]?.getAttribute("data-label")).toContain(
		"Signal <P>: U1.P → U2.P",
	);
	expect(
		svg
			.querySelector('[data-constraint-type="differential-pair"]')
			?.getAttribute("data-net-ids"),
	).toBe('["positive","negative"]');
	expect(markup).toContain("Signal &lt;P&gt;");
	expect(JSON.stringify(ir)).toBe(before);
});

test("shared region references keep independent owners and net highlighting follows IDs even with equal names", async () => {
	const route = assertDefined(ir.routeConstraints[0]);
	const shared: BoardIr = {
		...ir,
		zones: [
			{
				...assertDefined(ir.zones[0]),
				boundary: assertDefined(route.through[0]),
			},
		],
	};
	const svg = root(parse((await boardSvg(shared, options)).svg));
	const entries = constraintEntries(shared);
	const selected = assertDefined(entries.find((item) => item.kind === "route"));
	highlightConstraintRegions(svg, selected, "positive");
	expect(svg.querySelectorAll(".selected")).toHaveLength(3);
	expect(
		svg
			.querySelector('[data-constraint-type="zone"]')
			?.classList.contains("selected"),
	).toBe(false);
	expect(svg.querySelectorAll(".net-match")).toHaveLength(4); // route's three visits plus the pair
	expect(
		svg
			.querySelector('[data-constraint-type="zone"]')
			?.classList.contains("net-match"),
	).toBe(false);
	highlightConstraintRegions(svg, null, "negative");
	expect(svg.querySelectorAll(".selected")).toHaveLength(0);
	expect(svg.querySelectorAll(".net-match")).toHaveLength(2); // pair and zone
	expect(sameConstraintRegion(selected, { ...selected, waypoint: 3 })).toBe(
		false,
	);
});

test("inspector exposes authored geometry, rule intent, scope, exceptions, endpoint ownership and stable IDs", () => {
	const entries = constraintEntries(ir);
	for (const entry of entries) {
		const html = renderToStaticMarkup(
			<ConstraintInspector
				ir={ir}
				selection={entry}
				onSelect={() => {}}
				net=""
				onNet={() => {}}
			/>,
		);
		expect(html).toContain("Stable IDs");
		expect(html).toContain("Authored region");
		expect(html).toContain(
			entry.constraintId.replaceAll("&", "&amp;").replaceAll("<", "&lt;"),
		);
		for (const [label] of entry.details) expect(html).toContain(label);
		if (entry.kind === "route") {
			expect(html).toContain("U1.P");
			expect(html).toContain("U2.P");
			expect(html).toContain(`${entry.waypoint} of 3`);
		}
		if (entry.kind === "zone") {
			expect(html).toContain("0.3 mm");
			expect(html).toContain("unverified");
		}
		if (entry.kind === "keepout") {
			expect(html).toContain("back");
			expect(html).toContain("components, tracks");
			expect(html).toContain("Signal &lt;P&gt;");
		}
	}
});

test("separate overlay visibility and presets agree between canvas and SVG exports in both themes and views", () => {
	for (const view of ["board", "analysis"] as const)
		for (const theme of ["light", "dark"] as const) {
			const document = parse();
			const svg = root(document);
			const layers = sceneLayers(markup, ir, document);
			const before = [...svg.querySelectorAll("[data-region-id]")].map(
				(item) => [
					item.getAttribute("x"),
					item.getAttribute("y"),
					item.getAttribute("width"),
					item.getAttribute("height"),
				],
			);
			const visibility = {
				...presetVisibility(layers, "all"),
				"overlay:zones": false,
			};
			applyScenePresentation(svg, layers, visibility, { view, theme });
			expect(
				svg.querySelector('[data-overlay="zones"]')?.getAttribute("style"),
			).toContain("display:none");
			const colors = new Set<string>();
			for (const overlay of ["keepouts", "waypoints", "zones"]) {
				const group = assertDefined(
					svg.querySelector<SVGGElement>(`[data-overlay="${overlay}"]`),
				);
				const region = assertDefined(group.querySelector<SVGElement>("rect"));
				expect(region.style.fill).toBe("none");
				expect(region.style.vectorEffect).toBe("non-scaling-stroke");
				colors.add(region.style.stroke);
			}
			expect(colors.size).toBe(3);
			expect(
				[...svg.querySelectorAll("[data-region-id]")].map((item) => [
					item.getAttribute("x"),
					item.getAttribute("y"),
					item.getAttribute("width"),
					item.getAttribute("height"),
				]),
			).toEqual(before);
			const exported = root(
				parse(
					exportBoardSvg(markup, layers, visibility, { view, theme }, parse()),
				),
			);
			expect(exported.getAttribute("viewBox")).toBe("-13 -4 32 22");
			expect(exported.getAttribute("width")).toBe("32mm");
			expect(exported.querySelector('[data-overlay="zones"]')).toBeNull();
			expect(
				exported.querySelectorAll('[data-constraint-type="route"]'),
			).toHaveLength(3);
			for (const preset of [
				"front",
				"back",
				"copper",
				"fabrication",
			] as const) {
				const exported = root(
					parse(
						exportBoardSvg(
							markup,
							layers,
							presetVisibility(layers, preset),
							{ view, theme },
							parse(),
						),
					),
				);
				expect(exported.querySelectorAll("[data-constraint-id]")).toHaveLength(
					0,
				);
			}
		}
});

test("legacy shared constraint preferences migrate to separate controls without overriding explicit choices", () => {
	for (const visible of [false, true]) {
		const preferences = parseBoardPreferences({
			version: 1,
			visibility: { "overlay:constraints": visible, "overlay:zones": !visible },
		});
		expect(preferences.visibility).toEqual({
			"overlay:keepouts": visible,
			"overlay:waypoints": visible,
			"overlay:zones": !visible,
		});
		expect(parseBoardPreferences(preferences)).toEqual(preferences);
	}
});

async function failure(node: React.ReactNode) {
	try {
		await compile(node, options);
	} catch (error) {
		if (error instanceof PcbCompileError) return error;
		throw error;
	}
	throw new Error("Expected constraint failure");
}
test("failed-build focusing uses current off-board region geometry while retained scene keeps old coordinates", async () => {
	const error = await failure(<Fixture outside />);
	const geometry = assertDefined(constraintGeometry(error.diagnostic));
	expect(geometry.waypoint).toBe(1);
	expect(geometry.regionBounds.min2).toEqual([60_000_000, 2_000_000]);
	expect(geometry.effectiveBounds).toBeNull();
	const view = constraintFocusView(geometry, 2);
	expect(view[0]).toBeLessThan(30);
	expect(view[0] + view[2]).toBeGreaterThan(32);
	const overlay = renderToStaticMarkup(
		<CanvasConstraintDiagnostic
			finding={error.diagnostic}
			geometry={geometry}
			viewport={{
				transform: { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 },
				width: 800,
				height: 400,
			}}
			retained
			onDismiss={() => {}}
		/>,
	);
	expect(overlay).toContain('x="30"');
	expect(overlay).toContain(
		"Current diagnostic geometry over the last successful board",
	);
	expect(
		root(parse())
			.querySelector('[data-constraint-type="route"]')
			?.getAttribute("x"),
	).toBe("1");
	expect(boardFitView(root(parse(diagnosticBoardSvg(geometry))))).toEqual([
		-1, -1, 12, 12,
	]);
	expect(
		renderToStaticMarkup(
			<DiagnosticList findings={[error.diagnostic]} onFinding={() => {}} />,
		),
	).toContain("show");
	const noGeometry: CompilerDiagnostic = {
		...error.diagnostic,
		geometry: undefined,
	};
	expect(
		renderToStaticMarkup(
			<DiagnosticList findings={[noGeometry]} onFinding={() => {}} />,
		),
	).not.toContain("show");
});

test("blocked-visit focusing retains exact current blocker rectangles and per-net ownership", async () => {
	const error = await failure(<Fixture blocked />);
	const geometry = assertDefined(constraintGeometry(error.diagnostic));
	expect(error.diagnostic.code).toBe("PCBIR042");
	expect(geometry.net).toBe("positive");
	expect(geometry.blockers).toHaveLength(1);
	expect(geometry.blockers[0]?.bounds).toEqual({
		min2: [0, 0],
		max2: [10_000_000, 10_000_000],
	});
	const overlay = renderToStaticMarkup(
		<CanvasConstraintDiagnostic
			finding={error.diagnostic}
			geometry={geometry}
			viewport={{
				transform: { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 },
				width: 800,
				height: 400,
			}}
			retained={false}
			onDismiss={() => {}}
		/>,
	);
	expect(overlay).toContain('data-diagnostic-region="blocker-0"');
	expect(overlay).toContain('width="5"');
});

test("routing owners without waypoints remain inspectable without inventing a region", () => {
	const noVisits: BoardIr = {
		...ir,
		routeConstraints: ir.routeConstraints.map((route) => ({
			...route,
			through: [],
		})),
		differentialPairs: ir.differentialPairs.map((pair) => ({
			...pair,
			through: [],
		})),
	};
	const entries = constraintEntries(noVisits).filter(
		(entry) => entry.kind === "route" || entry.kind === "differential-pair",
	);
	expect(entries).toHaveLength(2);
	for (const entry of entries) {
		expect(entry.regionId).toBeNull();
		expect(entry.waypoint).toBeNull();
		const html = renderToStaticMarkup(
			<ConstraintInspector
				ir={noVisits}
				selection={entry}
				onSelect={() => {}}
				net=""
				onNet={() => {}}
			/>,
		);
		expect(html).toContain("None declared");
		expect(html).toContain("Width intent");
		expect(html).not.toContain("Authored region");
		expect(html).toContain("Stable IDs");
	}
});
