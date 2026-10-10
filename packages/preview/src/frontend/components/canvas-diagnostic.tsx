import type {
	OutlineDiagnosticGeometry,
	PhysicalFeature,
} from "@react-pcb/core";
import { X } from "lucide-react";
import {
	mm2,
	type OutlineFocus,
	type OutlineViolation,
	overflowSegments,
} from "../lib/outline-diagnostic.ts";
import { projectPoint } from "../lib/ruler.ts";
import type { CanvasViewport } from "./canvas-measurement.tsx";
import { Button } from "./ui/button";

function FeatureShape({ feature }: { feature: PhysicalFeature<number> }) {
	const shape = feature.shape;
	if (shape.kind === "circle") return <circle r={shape.diameter / 2_000_000} />;
	const width = shape.size[0] / 1_000_000;
	const height = shape.size[1] / 1_000_000;
	const radius =
		shape.kind === "rounded-rect"
			? shape.radius / 1_000_000
			: shape.kind === "oval"
				? Math.min(width, height) / 2
				: 0;
	return (
		<rect
			x={-width / 2}
			y={-height / 2}
			width={width}
			height={height}
			rx={radius}
		/>
	);
}

export function CanvasDiagnostic({
	focus,
	geometry,
	feature,
	viewport,
	retained,
	onFeature,
	onDismiss,
}: {
	focus: OutlineFocus;
	geometry: OutlineDiagnosticGeometry;
	feature: OutlineViolation;
	viewport: CanvasViewport;
	retained: boolean;
	onFeature: (id: string) => void;
	onDismiss: () => void;
}) {
	const { a, b, c, d, e, f } = viewport.transform;
	const board = geometry.boardBounds;
	const segments = overflowSegments(geometry, feature);
	return (
		<>
			<div
				className="pointer-events-none absolute inset-0 z-2 overflow-hidden"
				data-diagnostic-overlay
			>
				<svg
					className="absolute inset-0 size-full text-destructive"
					aria-label={`Outline violation for ${focus.finding.entity}`}
				>
					<title>{`Latest failed placement: ${focus.finding.entity}`}</title>
					<g
						transform={`matrix(${a} ${b} ${c} ${d} ${e} ${f})`}
						fill="none"
						stroke="currentColor"
					>
						<rect
							x={mm2(board.min2[0])}
							y={mm2(board.min2[1])}
							width={mm2(board.max2[0] - board.min2[0])}
							height={mm2(board.max2[1] - board.min2[1])}
							strokeWidth={1.5}
							strokeDasharray="5 4"
							vectorEffect="non-scaling-stroke"
						/>
						{geometry.features.map(({ geometry: shape }) => (
							<g
								key={shape.id}
								data-diagnostic-feature={shape.id}
								opacity={shape.id === feature.geometry.id ? 1 : 0.35}
								transform={`translate(${shape.at[0] / 1_000_000} ${shape.at[1] / 1_000_000}) rotate(${shape.rotation})`}
								className="[&>*]:[vector-effect:non-scaling-stroke]"
								strokeWidth={2}
							>
								<FeatureShape feature={shape} />
							</g>
						))}
						{/* Bounds include strokes and drills, which can exceed the drawn shape. */}
						<rect
							x={mm2(feature.bounds.min2[0])}
							y={mm2(feature.bounds.min2[1])}
							width={mm2(feature.bounds.max2[0] - feature.bounds.min2[0])}
							height={mm2(feature.bounds.max2[1] - feature.bounds.min2[1])}
							strokeWidth={1}
							strokeDasharray="2 3"
							vectorEffect="non-scaling-stroke"
						/>
					</g>
					{segments.map((segment) => {
						const start = projectPoint(segment.start, viewport.transform);
						const end = projectPoint(segment.end, viewport.transform);
						const horizontal =
							segment.edge === "left" || segment.edge === "right";
						return (
							<g key={segment.edge} stroke="currentColor" strokeWidth={2}>
								<line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
								{[start, end].map((point, index) => (
									<line
										key={index === 0 ? "start" : "end"}
										x1={point.x - (horizontal ? 0 : 5)}
										y1={point.y - (horizontal ? 5 : 0)}
										x2={point.x + (horizontal ? 0 : 5)}
										y2={point.y + (horizontal ? 5 : 0)}
									/>
								))}
							</g>
						);
					})}
				</svg>
				{segments.map((segment) => {
					const start = projectPoint(segment.start, viewport.transform);
					const end = projectPoint(segment.end, viewport.transform);
					return (
						<span
							key={segment.edge}
							className="absolute -translate-x-1/2 -translate-y-full rounded-sm border bg-card px-2 py-1 font-mono text-[11px] text-foreground"
							style={{
								left: Math.max(
									80,
									Math.min((start.x + end.x) / 2, viewport.width - 80),
								),
								top: Math.max(
									40,
									Math.min((start.y + end.y) / 2 - 12, viewport.height - 40),
								),
							}}
						>
							{segment.label} past {segment.edge} edge
						</span>
					);
				})}
			</div>
			<section
				className="absolute top-10 left-10 z-3 w-72 max-w-[calc(100%-64px)] rounded-md border bg-card p-3 text-xs"
				aria-label="Selected outline error"
			>
				<div className="flex items-center justify-between gap-2">
					<span className="font-mono text-destructive">
						PCBIR031 · {focus.finding.entity}
					</span>
					<Button
						size="icon-xs"
						variant="ghost"
						onClick={onDismiss}
						aria-label="Clear error highlight"
					>
						<X />
					</Button>
				</div>
				<p className="mt-1 text-muted-foreground">
					Latest failed placement
					{retained
						? " over the last successful board."
						: "; outline and offending features only."}
				</p>
				<fieldset
					className="mt-2 flex flex-wrap gap-1"
					aria-label="Offending features"
				>
					{geometry.features.map(({ geometry: item }) => (
						<Button
							key={item.id}
							size="sm"
							variant={item.id === feature.geometry.id ? "secondary" : "ghost"}
							aria-pressed={item.id === feature.geometry.id}
							onClick={() => onFeature(item.id)}
							className="h-7 font-mono text-xs"
						>
							{item.id}
						</Button>
					))}
				</fieldset>
				<p className="mt-2 font-medium">
					{feature.geometry.id} ·{" "}
					{feature.geometry.purpose.replaceAll("-", " ")}
				</p>
				{segments.map((segment) => (
					<p key={segment.edge} className="mt-1 font-mono">
						{segment.label} past {segment.edge} edge
					</p>
				))}
			</section>
		</>
	);
}
