import { DOMParser } from "linkedom";
import { footprintSceneLayer } from "./frontend/lib/footprint-scene.ts";
import { exportBoardSvg } from "./frontend/lib/scene-presentation.ts";

/** Exact conversion of the footprint projection's half-nm coordinates to mm. */
function mm(value: string | bigint) {
	const number = BigInt(value),
		absolute = number < 0n ? -number : number;
	const whole = absolute / 2_000_000n;
	const fraction = ((absolute % 2_000_000n) * 5n)
		.toString()
		.padStart(7, "0")
		.replace(/0+$/, "");
	return `${number < 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Keep canonical features/IDs, with browser-sized coordinates and shared inspection styling. */
export function inspectionFootprintSvg(markup: string) {
	const document = new DOMParser().parseFromString(
		markup,
		"image/svg+xml",
	) as unknown as Document;
	const svg = document.documentElement as unknown as SVGSVGElement;
	if (svg.localName !== "svg" || svg.getAttribute("data-units") !== "half-nm")
		throw new Error("Expected a canonical footprint SVG in half-nanometres");
	const rawViewBox = svg.getAttribute("viewBox");
	if (!rawViewBox)
		throw new Error("Canonical footprint SVG is missing its viewBox");
	const coordinates = rawViewBox.trim().split(/\s+/);
	if (coordinates.length !== 4)
		throw new Error("Invalid canonical footprint SVG viewBox");
	const [x, y, width, height] = coordinates.map(BigInt);
	if (
		x === undefined ||
		y === undefined ||
		width === undefined ||
		height === undefined ||
		width <= 0n ||
		height <= 0n
	)
		throw new Error("Invalid canonical footprint SVG viewBox");
	const margin =
		(width > height ? width : height) / 25n > 400_000n
			? (width > height ? width : height) / 25n
			: 400_000n;
	const viewport = [
		x - margin,
		y - margin,
		width + margin * 2n,
		height + margin * 2n,
	] as const;
	for (const element of svg.querySelectorAll<SVGElement>("*")) {
		for (const attribute of [
			"x",
			"y",
			"cx",
			"cy",
			"r",
			"rx",
			"ry",
			"width",
			"height",
			"stroke-width",
		]) {
			const value = element.getAttribute(attribute);
			if (value !== null) element.setAttribute(attribute, mm(value));
		}
		const transform = element.getAttribute("transform");
		if (transform)
			element.setAttribute(
				"transform",
				transform.replace(
					/translate\(([^)]+)\)/g,
					(_, point: string) =>
						`translate(${point
							.trim()
							.split(/[\s,]+/)
							.map(mm)
							.join(" ")})`,
				),
			);
	}
	svg.setAttribute("viewBox", viewport.map(mm).join(" "));
	svg.setAttribute("width", `${mm(viewport[2])}mm`);
	svg.setAttribute("height", `${mm(viewport[3])}mm`);
	svg.setAttribute("data-units", "mm");
	const background = document.createElementNS(
		"http://www.w3.org/2000/svg",
		"rect",
	);
	for (const [attribute, value] of [
		["x", viewport[0]],
		["y", viewport[1]],
		["width", viewport[2]],
		["height", viewport[3]],
	] as const) {
		background.setAttribute(attribute, mm(value));
	}
	background.setAttribute("stroke-width", "0.04");
	svg.insertBefore(background, svg.querySelector("g"));
	const layers = [...svg.querySelectorAll<SVGGElement>("g[data-layer]")].map(
		(group) => {
			const role = group.getAttribute("data-layer");
			if (role === null)
				throw new Error("Canonical footprint SVG layer is missing its role");
			const layer = footprintSceneLayer(role);
			group.setAttribute(
				layer.overlay ? "data-overlay" : "data-layer-id",
				layer.id,
			);
			group.setAttribute("data-kind", layer.kind);
			return layer;
		},
	);
	const styled = exportBoardSvg(
		svg.outerHTML,
		layers,
		{},
		{ view: "analysis", theme: "light" },
		document,
	);
	return { svg: styled, layers };
}
