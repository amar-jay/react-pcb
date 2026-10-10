import { type LayerPresetId, layerPresets } from "./layer-presets.ts";
import type { BoardView } from "./scene-presentation.ts";

export type BoardPreferences = {
	version: 1;
	view: BoardView;
	preset: LayerPresetId | null;
	visibility: Record<string, boolean>;
};
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function boardPreferencesKey(entry: string) {
	return `react-pcb:board-preferences:v1:${encodeURIComponent(entry)}`;
}
export function defaultBoardPreferences(): BoardPreferences {
	return { version: 1, view: "board", preset: null, visibility: {} };
}
export function parseBoardPreferences(value: unknown): BoardPreferences {
	const fallback = defaultBoardPreferences();
	if (!value || typeof value !== "object" || Array.isArray(value))
		return fallback;
	const data = value as Record<string, unknown>;
	if (data.version !== 1) return fallback;
	return {
		version: 1,
		view: data.view === "analysis" ? "analysis" : "board",
		preset:
			layerPresets.find((preset) => preset.id === data.preset)?.id ?? null,
		visibility:
			data.visibility &&
			typeof data.visibility === "object" &&
			!Array.isArray(data.visibility)
				? Object.fromEntries(
						Object.entries(data.visibility).filter(
							([key, visible]) =>
								(key.startsWith("layer:") || key.startsWith("overlay:")) &&
								typeof visible === "boolean",
						),
					)
				: {},
	};
}
export function readBoardPreferences(
	entry: string,
	storage?: PreferenceStorage,
): BoardPreferences {
	if (!entry) return defaultBoardPreferences();
	try {
		const raw = (storage ?? localStorage).getItem(boardPreferencesKey(entry));
		return raw
			? parseBoardPreferences(JSON.parse(raw))
			: defaultBoardPreferences();
	} catch {
		return defaultBoardPreferences();
	}
}
export function writeBoardPreferences(
	entry: string,
	preferences: BoardPreferences,
	storage?: PreferenceStorage,
) {
	if (!entry) return;
	try {
		(storage ?? localStorage).setItem(
			boardPreferencesKey(entry),
			JSON.stringify(preferences),
		);
	} catch {
		// Disabled or full storage must not prevent changing the board view.
	}
}
