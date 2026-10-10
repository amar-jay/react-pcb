import type { SceneLayer } from "./scene.ts";

export type BoardView = "board" | "analysis";
export type ScenePresentation = { view: BoardView; theme: string };

export function boardLayerColor(layer: SceneLayer) {
	if (layer.overlay)
		return (
			{ references: "#e8eddb", drills: "#263e34", constraints: "#c4b5fd" }[
				layer.id
			] ?? "#a6adbd"
		);
	if (layer.category === "copper")
		return layer.side === "front" || layer.allSides
			? "#dfae77"
			: layer.side === "back"
				? "#8dace1"
				: "#ad99d5";
	if (layer.kind === "silkscreen") return "#e8eddb";
	if (layer.kind === "solder-mask") return "#68aa98";
	if (layer.purpose === "fabrication") return "#67e8f9";
	if (layer.purpose === "courtyard") return "#fbbf24";
	return "#a4abc5";
}

/** High-contrast colors for inspection; geometry and physical layer identity stay unchanged. */
export function analysisLayerColor(layer: SceneLayer, dark: boolean) {
	if (layer.overlay) {
		if (layer.id === "references") return dark ? "#f1f5f9" : "#0f172a";
		if (layer.id === "drills") return dark ? "#020617" : "#ffffff";
		if (layer.id === "constraints") return dark ? "#d8b4fe" : "#7e22ce";
		return dark ? "#f472b6" : "#be185d";
	}
	if (layer.category === "copper") {
		if (layer.side === "front" || layer.allSides)
			return dark ? "#fbbf24" : "#a34d0b";
		if (layer.side === "back") return dark ? "#60a5fa" : "#1d4ed8";
		return dark ? "#c4b5fd" : "#6d28d9";
	}
	if (layer.kind === "silkscreen") return dark ? "#a7f3d0" : "#14532d";
	if (layer.kind === "solder-mask") return dark ? "#34d399" : "#047857";
	if (layer.kind === "paste") return dark ? "#c4b5fd" : "#6d28d9";
	if (layer.purpose === "courtyard") return dark ? "#fde047" : "#854d0e";
	if (layer.purpose === "fabrication") return dark ? "#67e8f9" : "#0e7490";
	return dark ? "#cbd5e1" : "#475569";
}

/** Shared by the interactive canvas and standalone SVG export. */
export function applyScenePresentation(
	svg: SVGSVGElement,
	layers: SceneLayer[],
	visibility: Record<string, boolean>,
	{ view, theme }: ScenePresentation,
) {
	svg.setAttribute("data-view", view);
	const analysis = view === "analysis";
	const dark = theme === "dark";
	const boardColor = analysis
		? dark
			? "#172033"
			: "#ffffff"
		: dark
			? "#2a5848"
			: "#234e41";
	const outline = svg.querySelector<SVGRectElement>(":scope > rect");
	if (outline) {
		outline.style.fill = boardColor;
		outline.style.stroke = analysis
			? dark
				? "#94a3b8"
				: "#64748b"
			: dark
				? "#49816b"
				: "#527560";
		outline.style.vectorEffect = analysis ? "non-scaling-stroke" : "";
		outline.style.strokeWidth = analysis ? "1.5px" : "";
	}
	const byKey = new Map(layers.map((layer) => [layer.key, layer]));
	for (const group of svg.querySelectorAll<SVGGElement>(
		"g[data-layer-id],g[data-overlay]",
	)) {
		const key = group.hasAttribute("data-layer-id")
			? `layer:${group.getAttribute("data-layer-id")}`
			: `overlay:${group.getAttribute("data-overlay")}`;
		const layer = byKey.get(key);
		group.style.display =
			(visibility[key] ?? layer?.visible ?? false) ? "" : "none";
		const color = layer
			? analysis
				? analysisLayerColor(layer, dark)
				: layer.color
			: "";
		const overlay = group.getAttribute("data-overlay");
		const opening = layer?.kind === "solder-mask" || layer?.kind === "paste";
		group.style.fill = overlay === "constraints" || opening ? "none" : color;
		group.style.stroke =
			overlay === "references"
				? analysis
					? boardColor
					: "none"
				: overlay === "drills"
					? analysis
						? dark
							? "#94a3b8"
							: "#475569"
						: "none"
					: color;
		group.style.opacity = "";
		if (overlay === "references") {
			group.style.fontFamily = "monospace";
			group.style.fontSize = "1px";
			group.style.fontWeight = analysis ? "600" : "";
			group.style.strokeWidth = analysis ? "0.18px" : "";
			group.style.paintOrder = analysis ? "stroke fill" : "";
		}
		if (overlay === "drills") {
			group.style.strokeWidth = analysis ? "0.06px" : "";
		}
		// Preserve declared shapes and dimensions, while keeping thin outlines readable at any zoom.
		for (const feature of group.querySelectorAll<SVGElement>(
			"[stroke-width]",
		)) {
			feature.style.vectorEffect = analysis ? "non-scaling-stroke" : "";
			feature.style.strokeWidth = analysis ? "1.25px" : "";
		}
		// Openings describe process boundaries, not material covering the copper.
		// Override the projection's filled-shape/stroke="none" presentation only.
		if (opening) {
			for (const feature of group.querySelectorAll<SVGElement>(
				"[data-feature-id]",
			)) {
				feature.style.fill = "none";
				feature.style.stroke = color;
				feature.style.vectorEffect = "non-scaling-stroke";
				feature.style.strokeWidth = analysis ? "1.25px" : "1px";
				feature.style.strokeDasharray = layer.kind === "paste" ? "3px 2px" : "";
			}
		}
	}
}

/** Keep physical dimensions and the original full-board viewBox, never the canvas viewport. */
export function exportBoardSvg(
	markup: string,
	layers: SceneLayer[],
	visibility: Record<string, boolean>,
	presentation: ScenePresentation,
	parsed?: Document,
) {
	const document =
		parsed ?? new DOMParser().parseFromString(markup, "image/svg+xml");
	if (
		document.querySelector("parsererror") ||
		document.documentElement.localName !== "svg"
	)
		throw new Error("Invalid board SVG");
	const svg = document.documentElement as unknown as SVGSVGElement;
	applyScenePresentation(svg, layers, visibility, presentation);
	for (const group of svg.querySelectorAll<SVGGElement>(
		"g[data-layer-id],g[data-overlay]",
	)) {
		if (group.style.display === "none") group.remove();
	}
	// Some server DOM implementations retain empty declarations that browsers remove.
	if (parsed) {
		for (const element of svg.querySelectorAll("[style]")) {
			const declarations = element.getAttribute("style")!.split(";");
			element.setAttribute(
				"style",
				declarations
					.filter((declaration) =>
						declaration.slice(declaration.indexOf(":") + 1).trim(),
					)
					.join(";"),
			);
		}
	}
	return parsed ? svg.outerHTML : new XMLSerializer().serializeToString(svg);
}
