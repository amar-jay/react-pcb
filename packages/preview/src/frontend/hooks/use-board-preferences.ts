import { useEffect, useMemo, useState } from "react";
import {
	readBoardPreferences,
	writeBoardPreferences,
} from "../lib/board-preferences.ts";
import {
	matchingLayerPreset,
	presetVisibility,
	type LayerPresetId,
} from "../lib/layer-presets.ts";
import type { SceneLayer } from "../lib/scene.ts";
import type { BoardView } from "../lib/scene-presentation.ts";

export function useBoardPreferences(entry: string, layers: SceneLayer[]) {
	const [state, setState] = useState(() => ({
		entry,
		preferences: readBoardPreferences(entry),
	}));
	// Restore during render so a changed entry cannot overwrite another board's settings.
	if (state.entry !== entry)
		setState({ entry, preferences: readBoardPreferences(entry) });
	const preferences = state.preferences;
	const visibility = useMemo(
		() =>
			preferences.preset
				? presetVisibility(layers, preferences.preset)
				: preferences.visibility,
		[layers, preferences],
	);
	useEffect(() => {
		if (state.entry === entry) writeBoardPreferences(entry, state.preferences);
	}, [entry, state]);
	return {
		boardView: preferences.view,
		visibility,
		preset: preferences.preset ?? matchingLayerPreset(layers, visibility),
		setBoardView: (view: BoardView) =>
			setState((previous) => ({
				...previous,
				preferences: { ...previous.preferences, view },
			})),
		applyPreset: (preset: LayerPresetId) =>
			setState((previous) => ({
				...previous,
				preferences: { ...previous.preferences, preset, visibility: {} },
			})),
		toggleLayer: (key: string, visible: boolean) =>
			setState((previous) => ({
				...previous,
				preferences: {
					...previous.preferences,
					preset: null,
					visibility: {
						...(previous.preferences.preset
							? presetVisibility(layers, previous.preferences.preset)
							: previous.preferences.visibility),
						[key]: visible,
					},
				},
			})),
	};
}
