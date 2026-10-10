import type {
	CompilerDiagnostic,
	OutlineDiagnosticGeometry,
} from "@react-pcb/core";

export type OutlineViolation = OutlineDiagnosticGeometry["features"][number];
export type OutlineFocus = {
	finding: CompilerDiagnostic;
	featureId: string;
};

export const outlineEdges = ["left", "top", "right", "bottom"] as const;
export const mm2 = (value: number) => value / 2_000_000;

/** Display half-nanometre precision without hiding small, real violations. */
export function overflowLabel(overflow2: number): string {
	return `${mm2(overflow2)
		.toFixed(9)
		.replace(/\.?0+$/, "")} mm`;
}

export function outlineGeometry(
	finding: CompilerDiagnostic | null | undefined,
) {
	return finding?.code === "PCBIR031" &&
		finding.entity &&
		finding.geometry?.kind === "board-outline" &&
		finding.geometry.features.length
		? finding.geometry
		: null;
}

export function focusOutlineFinding(
	finding: CompilerDiagnostic,
): OutlineFocus | null {
	const geometry = outlineGeometry(finding);
	const feature =
		geometry?.features.find((f) => f.geometry.purpose === "mask-opening") ??
		geometry?.features[0];
	return feature ? { finding, featureId: feature.geometry.id } : null;
}

/** Focus the actual feature and the crossed edges, using the canvas aspect ratio. */
export function outlineFocusView(
	geometry: OutlineDiagnosticGeometry,
	feature: OutlineViolation,
	aspect: number,
): [number, number, number, number] {
	const [minX, minY] = [
		mm2(feature.bounds.min2[0]),
		mm2(feature.bounds.min2[1]),
	];
	const [maxX, maxY] = [
		mm2(feature.bounds.max2[0]),
		mm2(feature.bounds.max2[1]),
	];
	const [left, top] = [
		mm2(geometry.boardBounds.min2[0]),
		mm2(geometry.boardBounds.min2[1]),
	];
	const [right, bottom] = [
		mm2(geometry.boardBounds.max2[0]),
		mm2(geometry.boardBounds.max2[1]),
	];
	const x0 = Math.min(
		minX,
		feature.overflow2[0] ? left : minX,
		feature.overflow2[2] ? right : minX,
	);
	const y0 = Math.min(
		minY,
		feature.overflow2[1] ? top : minY,
		feature.overflow2[3] ? bottom : minY,
	);
	const x1 = Math.max(
		maxX,
		feature.overflow2[0] ? left : maxX,
		feature.overflow2[2] ? right : maxX,
	);
	const y1 = Math.max(
		maxY,
		feature.overflow2[1] ? top : maxY,
		feature.overflow2[3] ? bottom : maxY,
	);
	const margin = Math.max(1, Math.max(x1 - x0, y1 - y0) * 0.5);
	let width = x1 - x0 + margin * 2;
	let height = y1 - y0 + margin * 2;
	const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
	width = Math.max(width, height * ratio);
	height = Math.max(height, width / ratio);
	return [(x0 + x1 - width) / 2, (y0 + y1 - height) / 2, width, height];
}

export function overflowSegments(
	geometry: OutlineDiagnosticGeometry,
	feature: OutlineViolation,
) {
	const { min2, max2 } = feature.bounds;
	const board = geometry.boardBounds;
	const cx = mm2((min2[0] + max2[0]) / 2);
	const cy = mm2((min2[1] + max2[1]) / 2);
	const endpoints = [
		[
			{ x: mm2(board.min2[0]), y: cy },
			{ x: mm2(min2[0]), y: cy },
		],
		[
			{ x: cx, y: mm2(board.min2[1]) },
			{ x: cx, y: mm2(min2[1]) },
		],
		[
			{ x: mm2(board.max2[0]), y: cy },
			{ x: mm2(max2[0]), y: cy },
		],
		[
			{ x: cx, y: mm2(board.max2[1]) },
			{ x: cx, y: mm2(max2[1]) },
		],
	] as const;
	return outlineEdges.flatMap((edge, index) => {
		const overflow = feature.overflow2[index] ?? 0;
		const points = endpoints[index];
		if (!points) return [];
		const [start, end] = points;
		return overflow > 0
			? [{ edge, start, end, label: overflowLabel(overflow) }]
			: [];
	});
}

/** An initial failed build has no accepted scene. Draw only its known outline. */
export function diagnosticBoardSvg(
	geometry: Pick<OutlineDiagnosticGeometry, "boardBounds">,
): string {
	const { min2, max2 } = geometry.boardBounds;
	const x = mm2(min2[0]);
	const y = mm2(min2[1]);
	const w = mm2(max2[0] - min2[0]);
	const h = mm2(max2[1] - min2[1]);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - 1} ${y - 1} ${w + 2} ${h + 2}" data-units="mm" role="img" aria-label="Failed placement board outline"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg>`;
}
