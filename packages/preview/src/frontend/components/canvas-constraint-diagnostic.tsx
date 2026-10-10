import type {
	CompilerDiagnostic,
	ConstraintDiagnosticGeometry,
} from "@react-pcb/core";
import { mm2 } from "../lib/outline-diagnostic.ts";
import { FeatureShape } from "./canvas-diagnostic.tsx";
import type { CanvasViewport } from "./canvas-measurement.tsx";
import { Button } from "./ui/button";

export function CanvasConstraintDiagnostic({
	finding,
	geometry,
	viewport,
	retained,
	onDismiss,
}: {
	finding: CompilerDiagnostic;
	geometry: ConstraintDiagnosticGeometry;
	viewport: CanvasViewport;
	retained: boolean;
	onDismiss: () => void;
}) {
	const { a, b, c, d, e, f } = viewport.transform;
	const shape = geometry.feature;
	const rectangles = [
		{ id: "board", bounds: geometry.boardBounds },
		...geometry.blockers.map((blocker, index) => ({
			id: `blocker-${index}`,
			bounds: blocker.bounds,
		})),
		{ id: "region", bounds: geometry.regionBounds },
		...(geometry.effectiveBounds
			? [{ id: "effective", bounds: geometry.effectiveBounds }]
			: []),
	];
	return (
		<>
			<div
				className="pointer-events-none absolute inset-0 z-2 overflow-hidden"
				data-diagnostic-overlay
			>
				<svg
					className="absolute inset-0 size-full text-destructive"
					aria-label={`Current constraint region: ${geometry.regionId}`}
				>
					<g
						transform={`matrix(${a} ${b} ${c} ${d} ${e} ${f})`}
						fill="none"
						stroke="currentColor"
					>
						{rectangles.map(({ id, bounds }) => (
							<rect
								key={id}
								data-diagnostic-region={id}
								x={mm2(bounds.min2[0])}
								y={mm2(bounds.min2[1])}
								width={mm2(bounds.max2[0] - bounds.min2[0])}
								height={mm2(bounds.max2[1] - bounds.min2[1])}
								vectorEffect="non-scaling-stroke"
								strokeWidth={id === "region" ? 3 : 1.5}
								strokeDasharray={id === "region" ? undefined : "5 4"}
								opacity={id === "region" ? 1 : 0.5}
							/>
						))}
						{shape && (
							<g
								data-diagnostic-feature={shape.id}
								transform={`translate(${shape.at[0] / 1_000_000} ${shape.at[1] / 1_000_000}) rotate(${shape.rotation})`}
								className="[&>*]:[vector-effect:non-scaling-stroke]"
								strokeWidth={2}
							>
								<FeatureShape feature={shape} />
							</g>
						)}
					</g>
				</svg>
			</div>
			<section
				className="absolute top-10 left-10 z-3 w-80 max-w-[calc(100%-64px)] rounded-md border bg-card p-3 text-xs"
				aria-label="Selected constraint finding"
			>
				<div className="flex items-center justify-between gap-2">
					<span className="font-mono text-destructive">{finding.code}</span>
					<Button size="sm" variant="ghost" onClick={onDismiss}>
						Clear highlight
					</Button>
				</div>
				<p className="mt-1 text-muted-foreground">
					Current diagnostic geometry
					{retained ? " over the last successful board." : "."}
				</p>
				<h3 className="mt-2 font-medium wrap-anywhere">{geometry.label}</h3>
				<p className="mt-1">
					{finding.code === "PCBIR039"
						? finding.severity === "error"
							? "Waypoint has no on-board area."
							: "Boundary has no on-board effect."
						: finding.code === "PCBIR040"
							? "Prohibited interior overlap."
							: finding.code === "PCBIR042"
								? "Every eligible copper layer blocks this visit."
								: "Keepout coverage is incomplete."}
				</p>
				<details className="mt-2 wrap-anywhere">
					<summary>Diagnostic message</summary>
					<p>{finding.message}</p>
				</details>
				{geometry.waypoint && (
					<p className="mt-2">Waypoint {geometry.waypoint}</p>
				)}
				{geometry.part && (
					<p className="mt-2 wrap-anywhere">
						{geometry.part} · {shape?.id} · {geometry.layer}
					</p>
				)}
				<details className="mt-2 wrap-anywhere">
					<summary>Stable IDs</summary>
					<p>{geometry.constraintId}</p>
					<p>{geometry.regionId}</p>
				</details>
			</section>
		</>
	);
}
