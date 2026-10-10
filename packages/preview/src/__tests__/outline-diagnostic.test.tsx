import { expect, test } from "bun:test";
import type {
	CompilerDiagnostic,
	OutlineDiagnosticGeometry,
} from "@react-pcb/core";
import { DOMParser } from "linkedom";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasDiagnostic } from "../frontend/components/canvas-diagnostic.tsx";
import { DiagnosticList } from "../frontend/components/diagnostics-panel.tsx";
import {
	diagnosticBoardSvg,
	focusOutlineFinding,
	outlineFocusView,
	overflowLabel,
	overflowSegments,
} from "../frontend/lib/outline-diagnostic.ts";

const geometry: OutlineDiagnosticGeometry = {
	kind: "board-outline",
	boardBounds: { min2: [0, 0], max2: [70_000_000, 72_000_000] },
	features: [
		{
			geometry: {
				id: "P",
				purpose: "pad",
				at: [34_000_000, 33_200_000],
				shape: { kind: "rect", size: [3_000_000, 3_000_000] },
				rotation: 0,
				layers: ["front-copper"],
				drill: null,
				stroke: null,
			},
			bounds: {
				min2: [65_000_000, 63_400_000],
				max2: [71_000_000, 69_400_000],
			},
			overflow2: [0, 0, 1_000_000, 0],
		},
		{
			geometry: {
				id: "mask",
				purpose: "mask-opening",
				at: [34_000_000, 33_200_000],
				shape: {
					kind: "rounded-rect",
					size: [3_500_000, 3_500_000],
					radius: 100_000,
				},
				rotation: 90,
				layers: ["front-mask"],
				drill: null,
				stroke: null,
			},
			bounds: {
				min2: [64_500_000, 62_900_000],
				max2: [71_500_000, 69_900_000],
			},
			overflow2: [0, 0, 1_500_000, 0],
		},
	],
};
const finding: CompilerDiagnostic = {
	code: "PCBIR031",
	severity: "error",
	entity: "inverter/J4",
	message: "Part extends outside the board outline",
	geometry,
};
const mask = geometry.features[1];
if (!mask) throw new Error("Missing mask fixture");

test("outline finding selects the mask and derives an exact edge measurement from failed geometry", () => {
	expect(focusOutlineFinding(finding)?.featureId).toBe("mask");
	expect(overflowSegments(geometry, mask)).toEqual([
		{
			edge: "right",
			start: { x: 35, y: 33.2 },
			end: { x: 35.75, y: 33.2 },
			label: "0.75 mm",
		},
	]);
	expect(overflowLabel(1)).toBe("0.0000005 mm");
	expect(overflowLabel(2_000_000)).toBe("1 mm");
	expect(focusOutlineFinding({ ...finding, geometry: undefined })).toBeNull();
	expect(focusOutlineFinding({ ...finding, code: "PCBIR026" })).toBeNull();
});

test("focus contains both the feature and crossed edge, including a feature completely outside the board", () => {
	for (const aspect of [0.5, 1, 2.5]) {
		const [x, y, width, height] = outlineFocusView(geometry, mask, aspect);
		expect(width / height).toBeCloseTo(aspect);
		expect(x).toBeLessThan(32.25);
		expect(x + width).toBeGreaterThan(35.75);
		expect(y).toBeLessThan(31.45);
		expect(y + height).toBeGreaterThan(34.95);
	}
	const outside: OutlineDiagnosticGeometry["features"][number] = {
		...mask,
		bounds: { min2: [80_000_000, 62_900_000], max2: [87_000_000, 69_900_000] },
		overflow2: [0, 0, 17_000_000, 0],
	};
	const [x, , width] = outlineFocusView(geometry, outside, 1);
	expect(x).toBeLessThan(35);
	expect(x + width).toBeGreaterThan(43.5);
});

test("diagnostic overlay draws world geometry independently of retained board layers and labels its provenance", () => {
	const focus = focusOutlineFinding(finding);
	if (!focus) throw new Error("Missing diagnostic focus");
	const html = renderToStaticMarkup(
		<CanvasDiagnostic
			focus={focus}
			geometry={geometry}
			feature={mask}
			viewport={{
				transform: { a: 20, b: 0, c: 0, d: 20, e: -600, f: -600 },
				width: 1000,
				height: 700,
			}}
			retained
			onFeature={() => {}}
			onDismiss={() => {}}
		/>,
	);
	const document = new DOMParser().parseFromString(html, "text/html");
	expect(
		document
			.querySelector('[data-diagnostic-feature="mask"]')
			?.getAttribute("transform"),
	).toBe("translate(34 33.2) rotate(90)");
	expect(
		document
			.querySelector('[data-diagnostic-feature="mask"] rect')
			?.getAttribute("width"),
	).toBe("3.5");
	expect(
		document
			.querySelector('[data-diagnostic-feature="mask"] rect')
			?.getAttribute("rx"),
	).toBe("0.1");
	expect(html).toContain("0.75 mm past right edge");
	expect(html).toContain(
		"Latest failed placement over the last successful board.",
	);
	const initialScene = diagnosticBoardSvg(geometry);
	expect(initialScene).toContain('width="35" height="36"');
	expect(initialScene).toContain("Failed placement board outline");
});

test("only outline findings with current structured geometry offer the clickable code", () => {
	const html = renderToStaticMarkup(
		<DiagnosticList
			findings={[
				finding,
				{ ...finding, geometry: undefined, entity: "old/J4" },
			]}
			onFinding={() => {}}
		/>,
	);
	const document = new DOMParser().parseFromString(html, "text/html");
	expect(document.querySelectorAll("button")).toHaveLength(1);
	expect(document.querySelector("button")?.getAttribute("aria-label")).toBe(
		"PCBIR031: show inverter/J4 on board",
	);
});
