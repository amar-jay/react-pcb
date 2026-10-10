import { expect, test } from "bun:test";
import {
	matchingLayerPreset,
	presetVisibility,
} from "../frontend/lib/layer-presets.ts";
import type { SceneLayer } from "../frontend/lib/scene.ts";
const layer = (
	id: string,
	category: SceneLayer["category"],
	kind: string,
	side: SceneLayer["side"] = null,
	purpose?: string,
): SceneLayer => ({
	id,
	key: `${category === "overlay" ? "overlay" : "layer"}:${id}`,
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
	layer("drawing-a", "technical", "mechanical", "front", "fabrication"),
	layer("drawing-b", "technical", "mechanical", "back", "fabrication"),
	layer("assembly", "technical", "mechanical", "front", "assembly"),
	layer("courtyard", "technical", "mechanical", "front", "courtyard"),
	layer("refs", "technical", "silkscreen", "front"),
	layer("references", "overlay", "references"),
	layer("drills", "overlay", "drills"),
	layer("constraints", "overlay", "constraints"),
];
const shown = (preset: Parameters<typeof presetVisibility>[1]) =>
	Object.entries(presetVisibility(layers, preset))
		.filter(([, visible]) => visible)
		.map(([key]) => key);
test("front/back presets use side metadata and include readable reference overlays", () => {
	expect(shown("front")).toEqual([
		"layer:outer-a",
		"layer:legend-a",
		"layer:refs",
		"overlay:references",
		"overlay:drills",
	]);
	expect(shown("back")).toEqual([
		"layer:outer-b",
		"layer:legend-b",
		"overlay:references",
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
		"overlay:references",
		"overlay:drills",
	]);
	expect(shown("all")).toEqual(layers.map((layer) => layer.key));
});
test("manual visibility changes are detected without letting stale or colliding keys affect presets", () => {
	const front = presetVisibility(layers, "front");
	expect(matchingLayerPreset(layers, front)).toBe("front");
	expect(matchingLayerPreset(layers, { ...front, "layer:mask-a": true })).toBe(
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
test("presets include newly added layers and never invent unavailable sides", () => {
	const added = layer("new-inner", "copper", "copper");
	expect(presetVisibility([...layers, added], "copper")[added.key]).toBe(true);
	expect(presetVisibility([layers[0]!], "back")).toEqual({
		"layer:outer-a": false,
	});
	expect(presetVisibility([], "all")).toEqual({});
	expect(matchingLayerPreset([], {})).toBe("custom");
});
