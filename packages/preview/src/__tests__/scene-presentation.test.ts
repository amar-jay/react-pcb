import { expect, test } from "bun:test";
import { DOMParser } from "linkedom";
import { buildBoardPreview } from "../build.ts";
import { presetVisibility } from "../frontend/lib/layer-presets.ts";
import { type SceneLayer, sceneLayers } from "../frontend/lib/scene.ts";
import {
	analysisLayerColor,
	applyScenePresentation,
	exportBoardSvg,
} from "../frontend/lib/scene-presentation.ts";
import { assertDefined } from "./fixtures.ts";

test("front/back presets filter actual ESC references in canvas and exports", async () => {
	const build = await buildBoardPreview(
		`${import.meta.dir}/../../../../examples/esc/index.tsx`,
	);
	expect(build.error).toBeNull();
	const markup = assertDefined(build.projection).svg;
	const parse = () =>
		new DOMParser().parseFromString(
			markup,
			"image/svg+xml",
		) as unknown as Document;
	const document = parse();
	const svg = document.documentElement as unknown as SVGSVGElement;
	const layers = sceneLayers(markup, assertDefined(build.result).ir, document);
	const referenceIds = (root: Element, visibleOnly = false) =>
		[...root.querySelectorAll<SVGGElement>('g[data-overlay="references"]')]
			.filter((group) => !visibleOnly || group.style.display !== "none")
			.flatMap((group) =>
				[...group.querySelectorAll("text")].map((text) =>
					text.getAttribute("data-part-id"),
				),
			)
			.sort();
	const front = [
		"control/C2",
		"control/U2",
		"inverter/J2",
		"inverter/J3",
		"inverter/J4",
		"inverter/QAH",
		"inverter/QAL",
		"inverter/QBH",
		"inverter/QBL",
		"inverter/QCH",
		"inverter/QCL",
		"power/C1",
		"power/J1",
		"power/R1",
	];
	const back = ["drive/C3", "drive/C4", "drive/U1"];
	expect(
		layers
			.filter((layer) => layer.id === "references")
			.map((layer) => layer.key),
	).toEqual(["overlay:references:front", "overlay:references:back"]);
	for (const view of ["board", "analysis"] as const) {
		applyScenePresentation(svg, layers, {}, { view, theme: "light" });
		expect(referenceIds(svg, true)).toEqual(front);
		for (const preset of [
			"front",
			"back",
			"all",
			"copper",
			"fabrication",
		] as const) {
			const visibility = presetVisibility(layers, preset);
			const expected =
				preset === "front"
					? front
					: preset === "back"
						? back
						: preset === "copper"
							? []
							: [...front, ...back].sort();
			applyScenePresentation(svg, layers, visibility, { view, theme: "light" });
			expect(referenceIds(svg, true)).toEqual(expected);
			const exported = parse();
			exportBoardSvg(
				markup,
				layers,
				visibility,
				{ view, theme: "light" },
				exported,
			);
			expect(referenceIds(exported.documentElement)).toEqual(expected);
		}
	}
	applyScenePresentation(
		svg,
		layers,
		{
			...presetVisibility(layers, "all"),
			"overlay:references:front": false,
		},
		{ view: "analysis", theme: "dark" },
	);
	expect(referenceIds(svg, true)).toEqual(back);
});

const layer = (
	kind: string,
	side: SceneLayer["side"] = null,
	purpose?: string,
): SceneLayer => ({
	key: "layer:stable",
	id: "stable",
	name: "Display name",
	color: "#fff",
	category: kind === "copper" ? "copper" : "technical",
	overlay: false,
	visible: true,
	kind,
	side,
	purpose,
	group: "",
	detail: "",
});
const luminance = (hex: string) => {
	const rgb = [1, 3, 5]
		.map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
		.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
	return (
		0.2126 * assertDefined(rgb[0]) +
		0.7152 * assertDefined(rgb[1]) +
		0.0722 * assertDefined(rgb[2])
	);
};
test("analysis feature colors contrast with the substrate in both themes", () => {
	const features = [
		layer("copper", "front"),
		layer("copper", "back"),
		layer("copper"),
		layer("silkscreen"),
		layer("mechanical", "front", "fabrication"),
		layer("mechanical", "back", "courtyard"),
	];
	for (const dark of [false, true]) {
		const background = luminance(dark ? "#172033" : "#ffffff");
		for (const feature of features) {
			const color = luminance(analysisLayerColor(feature, dark));
			const ratio =
				(Math.max(color, background) + 0.05) /
				(Math.min(color, background) + 0.05);
			expect(ratio).toBeGreaterThanOrEqual(4.5);
		}
		expect(analysisLayerColor(assertDefined(features[0]), dark)).not.toBe(
			analysisLayerColor(assertDefined(features[1]), dark),
		);
	}
});
test("reference labels remain readable and colors follow physical metadata rather than IDs", () => {
	const reference = {
		...layer("references"),
		id: "references",
		key: "overlay:references",
		overlay: true,
		category: "overlay" as const,
	};
	expect(analysisLayerColor(reference, false)).toBe("#0f172a");
	expect(analysisLayerColor(reference, true)).toBe("#f1f5f9");
	const original = layer("mechanical", "front", "fabrication");
	expect(
		analysisLayerColor(
			{ ...original, id: "renamed", name: "Another name" },
			false,
		),
	).toBe(analysisLayerColor(original, false));
});

test("fabrication, courtyard and constraint colors are distinct in both analysis themes", () => {
	const constraints = {
		...layer("constraints"),
		id: "constraints",
		key: "overlay:constraints",
		overlay: true,
		category: "overlay" as const,
	};
	for (const dark of [false, true]) {
		const colors = [
			layer("mechanical", "front", "fabrication"),
			layer("mechanical", "front", "courtyard"),
			constraints,
		].map((feature) => analysisLayerColor(feature, dark));
		expect(new Set(colors).size).toBe(3);
		const color = luminance(analysisLayerColor(constraints, dark));
		const background = luminance(dark ? "#172033" : "#ffffff");
		expect(
			(Math.max(color, background) + 0.05) /
				(Math.min(color, background) + 0.05),
		).toBeGreaterThanOrEqual(4.5);
	}
});

test("canvas and SVG export draw mask/paste boundaries without filling over copper in every view and theme", () => {
	const layers = ["copper", "solder-mask", "paste"].map((kind) => ({
		...layer(kind, "front"),
		id: kind,
		key: `layer:${kind}`,
		color: "#68aa98",
	}));
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/>
    ${layers.map((layer) => `<g data-layer-id="${layer.id}"><rect data-feature-id="shape" x="3" y="3" width="4" height="4" stroke="none"/></g>`).join("")}</svg>`;
	const document = new DOMParser().parseFromString(
		markup,
		"image/svg+xml",
	) as unknown as Document;
	const svg = document.documentElement as unknown as SVGSVGElement;
	for (const view of ["analysis", "board"] as const) {
		for (const theme of ["dark", "light"] as const) {
			applyScenePresentation(svg, layers, {}, { view, theme });
			for (const kind of ["solder-mask", "paste"]) {
				const group = assertDefined(
					svg.querySelector<SVGGElement>(`g[data-layer-id="${kind}"]`),
				);
				const feature = assertDefined(
					group.querySelector<SVGElement>("[data-feature-id]"),
				);
				expect(group.style.fill).toBe("none");
				expect(group.style.opacity).toBe("");
				expect(feature.style.fill).toBe("none");
				expect(feature.style.stroke).not.toBe("none");
				expect(feature.style.vectorEffect).toBe("non-scaling-stroke");
				expect(feature.style.strokeDasharray).toBe(
					kind === "paste" ? "3px 2px" : "",
				);
				expect(feature.getAttribute("stroke")).toBe("none");
				expect(feature.getAttribute("width")).toBe("4");
				expect(feature.getAttribute("height")).toBe("4");
			}
			const parsed = new DOMParser().parseFromString(
				markup,
				"image/svg+xml",
			) as unknown as Document;
			const exported = exportBoardSvg(
				markup,
				layers,
				{},
				{ view, theme },
				parsed,
			);
			expect(exported).toContain("fill:none");
			expect(exported).toContain("stroke-dasharray:3px 2px");
			expect(exported).toContain('data-layer-id="copper"');
		}
	}
});
