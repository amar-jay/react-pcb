import type {
	BoardIr,
	CompilerDiagnostic,
	ConstraintDiagnosticGeometry,
	IrPinRef,
} from "@react-pcb/core";
import { mm2 } from "./outline-diagnostic.ts";

export type ConstraintSelection = {
	constraintId: string;
	regionId: string | null;
	waypoint: number | null;
};
export type ConstraintEntry = ConstraintSelection & {
	kind: "keepout" | "zone" | "route" | "differential-pair";
	label: string;
	nets: readonly string[];
	details: readonly [string, string][];
};
export function constraintEntries(ir: BoardIr): ConstraintEntry[] {
	const netName = (id: string) =>
		ir.nets.find((net) => net.id === id)?.name ?? id;
	const pinName = (pin: IrPinRef) =>
		`${ir.parts.find((part) => part.id === pin.part)?.reference ?? pin.part}.${pin.name}`;
	const dimension = (value: number | null) =>
		value === null ? "Unspecified" : `${value} ${ir.units}`;
	const visits = (through: readonly string[]): readonly (string | null)[] =>
		through.length ? through : [null];
	return [
		...ir.routeConstraints.flatMap((route) =>
			visits(route.through).map(
				(regionId, index): ConstraintEntry => ({
					constraintId: route.id,
					regionId,
					waypoint: regionId === null ? null : index + 1,
					kind: "route",
					nets: [route.net],
					label: `Route ${netName(route.net)}${regionId === null ? "" : ` · waypoint ${index + 1}`}`,
					details: [
						["Net", netName(route.net)],
						["From", pinName(route.from)],
						["To", pinName(route.to)],
						[
							regionId === null ? "Waypoints" : "Waypoint",
							regionId === null
								? "None declared"
								: `${index + 1} of ${route.through.length}`,
						],
						["Width intent", dimension(route.width)],
					],
				}),
			),
		),
		...ir.differentialPairs.flatMap((pair) =>
			visits(pair.through).map(
				(regionId, index): ConstraintEntry => ({
					constraintId: pair.id,
					regionId,
					waypoint: regionId === null ? null : index + 1,
					kind: "differential-pair",
					nets: [pair.positive, pair.negative],
					label: `Pair ${netName(pair.positive)} / ${netName(pair.negative)}${regionId === null ? "" : ` · waypoint ${index + 1}`}`,
					details: [
						["Positive net", netName(pair.positive)],
						["Negative net", netName(pair.negative)],
						["From", pair.from.map(pinName).join(" / ")],
						["To", pair.to.map(pinName).join(" / ")],
						[
							regionId === null ? "Waypoints" : "Waypoint",
							regionId === null
								? "None declared"
								: `${index + 1} of ${pair.through.length}`,
						],
						["Width intent", dimension(pair.width)],
						["Gap intent", dimension(pair.gap)],
						[
							"Impedance intent",
							pair.targetImpedance === null
								? "Unspecified"
								: `${pair.targetImpedance} Ω`,
						],
					],
				}),
			),
		),
		...ir.keepouts.map(
			(keepout): ConstraintEntry => ({
				constraintId: keepout.id,
				regionId: keepout.region,
				waypoint: null,
				kind: "keepout",
				nets: [],
				label: `Keepout · ${keepout.disallow.join(", ")}`,
				details: [
					["Restrictions", keepout.disallow.join(", ")],
					[
						"Component sides",
						keepout.componentSides.join(", ") || "Not applicable",
					],
					[
						"Copper layers",
						keepout.copperLayers.join(", ") || "Not applicable",
					],
					["Net exceptions", keepout.except.map(netName).join(", ") || "None"],
				],
			}),
		),
		...ir.zones.map(
			(zone): ConstraintEntry => ({
				constraintId: zone.id,
				regionId: zone.boundary,
				waypoint: null,
				kind: "zone",
				nets: [zone.net],
				label: `Zone intent · ${netName(zone.net)}`,
				details: [
					["Net", netName(zone.net)],
					["Layers", zone.layers.join(", ")],
					["Clearance intent", dimension(zone.clearance)],
				],
			}),
		),
	];
}
export function sameConstraintRegion(
	a: ConstraintSelection | null | undefined,
	b: ConstraintSelection,
) {
	return (
		a?.constraintId === b.constraintId &&
		a.regionId === b.regionId &&
		a.waypoint === b.waypoint
	);
}
export function regionSelection(element: Element): ConstraintSelection | null {
	const constraintId = element.getAttribute("data-constraint-id");
	const regionId = element.getAttribute("data-region-id");
	const sequence = element.getAttribute("data-waypoint");
	return constraintId && regionId
		? { constraintId, regionId, waypoint: sequence ? Number(sequence) : null }
		: null;
}
export function highlightConstraintRegions(
	svg: SVGSVGElement,
	selected: ConstraintSelection | null,
	net: string,
) {
	for (const region of svg.querySelectorAll<SVGElement>(
		"[data-constraint-id]",
	)) {
		const nets: string[] = JSON.parse(
			region.getAttribute("data-net-ids") ?? "[]",
		);
		const match = !!net && nets.includes(net);
		region.classList.toggle(
			"selected",
			!!selected &&
				region.getAttribute("data-constraint-id") === selected.constraintId,
		);
		region.classList.toggle("net-match", match);
		region.classList.toggle(
			"dimmed",
			!!net &&
				!match &&
				region.getAttribute("data-constraint-type") !== "keepout" &&
				region.getAttribute("data-constraint-id") !== selected?.constraintId,
		);
	}
}
export function constraintGeometry(
	finding: CompilerDiagnostic | null | undefined,
): ConstraintDiagnosticGeometry | null {
	return finding?.geometry?.kind === "constraint-region"
		? finding.geometry
		: null;
}
export function constraintFocusView(
	geometry: ConstraintDiagnosticGeometry,
	aspect = 1,
): [number, number, number, number] {
	const bounds = geometry.featureBounds
		? {
				min2: [
					Math.min(
						geometry.regionBounds.min2[0],
						geometry.featureBounds.min2[0],
					),
					Math.min(
						geometry.regionBounds.min2[1],
						geometry.featureBounds.min2[1],
					),
				] as const,
				max2: [
					Math.max(
						geometry.regionBounds.max2[0],
						geometry.featureBounds.max2[0],
					),
					Math.max(
						geometry.regionBounds.max2[1],
						geometry.featureBounds.max2[1],
					),
				] as const,
			}
		: geometry.regionBounds;
	const x = mm2(bounds.min2[0]),
		y = mm2(bounds.min2[1]);
	const w = mm2(bounds.max2[0] - bounds.min2[0]),
		h = mm2(bounds.max2[1] - bounds.min2[1]);
	const margin = Math.max(1, Math.max(w, h) * 0.25);
	const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
	const width = Math.max(w + margin * 2, (h + margin * 2) * ratio);
	const height = Math.max(h + margin * 2, width / ratio);
	return [x + (w - width) / 2, y + (h - height) / 2, width, height];
}
export function boardFitView(
	svg: Element,
): [number, number, number, number] | null {
	const board = svg.querySelector(":scope > rect");
	if (!board) return null;
	const [x, y, w, h] = ["x", "y", "width", "height"].map((key) =>
		Number(board.getAttribute(key) ?? 0),
	);
	if (
		x === undefined ||
		y === undefined ||
		w === undefined ||
		h === undefined ||
		![x, y, w, h].every(Number.isFinite) ||
		w <= 0 ||
		h <= 0
	)
		return null;
	const pad = Math.max(1, Math.max(w, h) / 25);
	return [x - pad, y - pad, w + pad * 2, h + pad * 2];
}
