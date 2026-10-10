import type { SceneLayer } from "./scene.ts";

export const layerPresets = [
	{
		id: "front",
		label: "Front",
		description:
			"Front copper, technical layers and part references, with drills",
	},
	{
		id: "back",
		label: "Back",
		description:
			"Back copper, technical layers and part references, with drills",
	},
	{
		id: "copper",
		label: "Copper only",
		description: "All copper layers, without technical layers or overlays",
	},
	{
		id: "fabrication",
		label: "Fabrication",
		description: "Fabrication and courtyard layers, drills and part references",
	},
	{
		id: "all",
		label: "All layers",
		description: "Every available layer and overlay",
	},
] as const;
export type LayerPresetId = (typeof layerPresets)[number]["id"];

export function presetVisibility(
	layers: SceneLayer[],
	preset: LayerPresetId,
): Record<string, boolean> {
	return Object.fromEntries(
		layers.map((layer) => {
			const referenceOverlay =
				layer.overlay && ["drills", "references"].includes(layer.id);
			const visible =
				preset === "all" ||
				(preset === "copper"
					? layer.category === "copper"
					: preset === "fabrication"
						? referenceOverlay ||
							(layer.category === "technical" &&
								layer.kind === "mechanical" &&
								["fabrication", "courtyard"].includes(layer.purpose ?? ""))
						: (referenceOverlay && (!layer.side || layer.side === preset)) ||
							((layer.category === "copper" ||
								layer.category === "technical") &&
								(layer.side === preset ||
									layer.allSides === true ||
									(layer.category === "technical" && layer.side === null))));
			return [layer.key, visible];
		}),
	);
}

export function matchingLayerPreset(
	layers: SceneLayer[],
	visibility: Record<string, boolean>,
): LayerPresetId | "custom" {
	if (!layers.length) return "custom";
	return (
		layerPresets.find((preset) => {
			const expected = presetVisibility(layers, preset.id);
			return layers.every(
				(layer) =>
					(visibility[layer.key] ?? layer.visible) === expected[layer.key],
			);
		})?.id ?? "custom"
	);
}
