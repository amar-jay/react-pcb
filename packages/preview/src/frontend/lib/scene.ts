import type { BoardIr } from "@react-pcb/core";
import { boardLayerColor } from "./scene-presentation.ts";

export type SceneLayer = {
	key: string;
	id: string;
	name: string;
	color: string;
	overlay: boolean;
	visible: boolean;
	category: "copper" | "technical" | "overlay";
	group: string;
	side: "front" | "back" | null;
	/** Reusable footprint roles can apply to both sides without implying an inner copper layer. */
	allSides?: boolean;
	detail: string;
	kind: string;
	purpose?: string;
};

export function boardSize(ir: BoardIr) {
	const outline = ir.regions[ir.board.outline]?.geometry;
	return outline
		? `${outline.width} × ${outline.height} ${ir.units}`
		: "Unresolved outline";
}

export function sceneLayers(
	svg: string | null,
	ir: BoardIr | undefined,
	parsed?: Document,
): SceneLayer[] {
	if (!svg || !ir) return [];
	const document =
		parsed ?? new DOMParser().parseFromString(svg, "image/svg+xml");
	const copper = ir.board.layers.stackup.entries.filter(
		(layer) => layer.kind === "copper",
	);
	return [
		...document.querySelectorAll<SVGGElement>(
			"g[data-layer-id],g[data-overlay]",
		),
	].flatMap((group): SceneLayer[] => {
		const overlay = !!group.dataset.overlay;
		const id = group.dataset.layerId ?? group.dataset.overlay;
		if (id === undefined) return [];
		const technical = ir.board.layers.technical.find(
			(layer) => layer.id === id,
		);
		const depth = copper.findIndex((layer) => layer.id === id);
		const copperLayer = copper[depth];
		const name = overlay
			? ({
					references: "Part references",
					drills: "Drills",
					constraints: "Constraint regions",
				}[id] ?? id)
			: depth >= 0
				? depth === 0
					? "Front copper"
					: depth === copper.length - 1
						? "Back copper"
						: `Inner copper ${depth}`
				: technical
					? `${technical.side ? (technical.side === "front" ? "Front " : "Back ") : ""}${technical.kind === "mechanical" ? technical.purpose : technical.kind.replace("-", " ")}`
					: id;
		const side =
			depth === 0
				? "front"
				: depth > 0 && depth === copper.length - 1
					? "back"
					: (technical?.side ?? null);
		const category = overlay ? "overlay" : depth >= 0 ? "copper" : "technical";
		const technicalName =
			technical?.kind === "mechanical"
				? technical.purpose
				: technical?.kind.replace("-", " ");
		const groupName = technicalName
			? technicalName.charAt(0).toUpperCase() + technicalName.slice(1)
			: id;
		const layer: SceneLayer = {
			key: `${overlay ? "overlay" : "layer"}:${id}`,
			id,
			name,
			kind: overlay
				? id
				: depth >= 0
					? "copper"
					: (technical?.kind ?? "unknown"),
			purpose: technical?.kind === "mechanical" ? technical.purpose : undefined,
			overlay,
			color: "",
			category,
			group:
				category === "technical"
					? groupName
					: category === "copper"
						? "Copper"
						: "Overlays",
			side,
			detail: copperLayer
				? `${copperLayer.usage} · ${copperLayer.thickness} ${ir.units}`
				: id,
			visible: overlay
				? ["references", "drills"].includes(id)
				: depth === 0 ||
					(technical?.kind === "silkscreen" && technical.side === "front"),
		};
		layer.color = boardLayerColor(layer);
		return [layer];
	});
}

export function download(name: string, content: string, type: string) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
