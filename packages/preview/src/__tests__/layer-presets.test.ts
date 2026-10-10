import { expect, test } from "bun:test";
import {
	matchingLayerPreset,
	presetVisibility,
} from "../frontend/lib/layer-presets.ts";
import type { SceneLayer } from "../frontend/lib/scene.ts";
import { assertDefined } from "./fixtures.ts";

const layer = (
	id: string,
	category: SceneLayer["category"],
	kind: string,
	side: SceneLayer["side"] = null,
	purpose?: string,
): SceneLayer => ({
	id,
	key: `${category === "overlay" ? "overlay" : "layer"}:${id}${category === "overlay" && id === "references" && side ? `:${side}` : ""}`,
	category,
	kind,
	side,
	purpose,
	name: "Display name",
	color: "#fff",
	overlay: category === "overlay",
	visible: false,
	group: "Display group",
	detail: "",
});
const layers = [
	layer("outer-a", "copper", "copper", "front"),
	layer("middle", "copper", "copper"),
	layer("outer-b", "copper", "copper", "back"),
	layer("legend-a", "technical", "silkscreen", "front"),
	layer("legend-b", "technical", "silkscreen", "back"),
	layer("mask-a", "technical", "solder-mask", "front"),
	layer("mask-b", "technical", "solder-mask", "back"),
	layer("paste-a", "technical", "paste", "front"),
	layer("paste-b", "technical", "paste", "back"),
	layer("drawing-a", "technical", "mechanical", "front", "fabrication"),
	layer("drawing-b", "technical", "mechanical", "back", "fabrication"),
	layer("assembly", "technical", "mechanical", "front", "assembly"),
	layer("assembly-b", "technical", "mechanical", "back", "assembly"),
	layer("courtyard", "technical", "mechanical", "front", "courtyard"),
	layer("courtyard-b", "technical", "mechanical", "back", "courtyard"),
	layer("refs", "technical", "silkscreen", "front"),
	layer("references", "overlay", "references", "front"),
	layer("references", "overlay", "references", "back"),
	layer("drills", "overlay", "drills"),
	layer("constraints", "overlay", "constraints"),
];
const shown = (preset: Parameters<typeof presetVisibility>[1]) =>
	Object.entries(presetVisibility(layers, preset))
		.filter(([, visible]) => visible)
		.map(([key]) => key);
test("front/back presets show every technical type and references on the selected side", () => {
	expect(shown("front")).toEqual([
		"layer:outer-a",
		"layer:legend-a",
		"layer:mask-a",
		"layer:paste-a",
		"layer:drawing-a",
		"layer:assembly",
		"layer:courtyard",
		"layer:refs",
		"overlay:references:front",
		"overlay:drills",
	]);
	expect(shown("back")).toEqual([
		"layer:outer-b",
		"layer:legend-b",
		"layer:mask-b",
		"layer:paste-b",
		"layer:drawing-b",
		"layer:assembly-b",
		"layer:courtyard-b",
		"overlay:references:back",
		"overlay:drills",
	]);
});
test("copper and fabrication presets use physical types instead of display names or IDs", () => {
	expect(shown("copper")).toEqual([
		"layer:outer-a",
		"layer:middle",
		"layer:outer-b",
	]);
	expect(shown("fabrication")).toEqual([
		"layer:drawing-a",
		"layer:drawing-b",
		"layer:courtyard",
		"layer:courtyard-b",
		"overlay:references:front",
		"overlay:references:back",
		"overlay:drills",
	]);
	expect(shown("all")).toEqual(layers.map((layer) => layer.key));
});
test("manual visibility changes are detected without letting stale or colliding keys affect presets", () => {
	const front = presetVisibility(layers, "front");
	expect(matchingLayerPreset(layers, front)).toBe("front");
	expect(matchingLayerPreset(layers, { ...front, "layer:mask-a": false })).toBe(
		"custom",
	);
	expect(matchingLayerPreset(layers, { ...front, "layer:deleted": true })).toBe(
		"front",
	);
	const collision = [
		layer("drills", "copper", "copper"),
		layer("drills", "overlay", "drills"),
	];
	expect(presetVisibility(collision, "copper")).toEqual({
		"layer:drills": true,
		"overlay:drills": false,
	});
});
test("front/back include shared technical layers without enabling inner copper", () => {
	const shared = layer("shared", "technical", "mechanical", null, "assembly");
	const allMask = {
		...layer("all-mask", "technical", "solder-mask"),
		allSides: true,
	};
	for (const preset of ["front", "back"] as const) {
		expect(
			presetVisibility([...layers, shared, allMask], preset),
		).toMatchObject({
			"layer:shared": true,
			"layer:all-mask": true,
			"layer:middle": false,
			"overlay:constraints": false,
		});
	}
});
test("presets include newly added layers and never invent unavailable sides", () => {
	const added = layer("new-inner", "copper", "copper");
	expect(presetVisibility([...layers, added], "copper")[added.key]).toBe(true);
	expect(presetVisibility([assertDefined(layers[0])], "back")).toEqual({
		"layer:outer-a": false,
	});
	expect(presetVisibility([], "all")).toEqual({});
	expect(matchingLayerPreset([], {})).toBe("custom");
});
