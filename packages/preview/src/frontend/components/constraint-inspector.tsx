import type { BoardIr } from "@react-pcb/core";
import {
	type ConstraintSelection,
	constraintEntries,
	sameConstraintRegion,
} from "../lib/constraint-scene.ts";
import { DetailRow, InspectorSection } from "./inspector-section.tsx";
import { Button } from "./ui/button";

export function ConstraintInspector({
	ir,
	selection,
	onSelect,
	net,
	onNet,
}: {
	ir: BoardIr;
	selection: ConstraintSelection | null;
	onSelect: (selection: ConstraintSelection) => void;
	net: string;
	onNet: (id: string) => void;
}) {
	const entries = constraintEntries(ir);
	const entry = entries.find((item) => sameConstraintRegion(selection, item));
	const region = entry?.regionId ? ir.regions[entry.regionId] : null;
	return (
		<>
			{entry && (
				<>
					<h3 className="text-base font-medium wrap-anywhere">{entry.label}</h3>
					<p className="mt-2 text-xs text-muted-foreground">
						{entry.kind === "zone"
							? "Fill boundary intent; copper fill and connectivity are unverified."
							: entry.kind === "keepout"
								? "Interior overlap is prohibited for the selected objects and scope."
								: "Ordered centerline visit intent; physical traversal is unverified."}
					</p>
					<InspectorSection title="Constraint rules">
						<dl>
							{entry.details.map(([label, value]) => (
								<DetailRow key={label} label={label} value={value} />
							))}
						</dl>
						{entry.nets.map((id) => (
							<Button
								key={id}
								className="mt-2 mr-2"
								size="sm"
								variant="outline"
								aria-pressed={net === id}
								onClick={() => onNet(net === id ? "" : id)}
							>
								Highlight {ir.nets.find((n) => n.id === id)?.name ?? id}
							</Button>
						))}
					</InspectorSection>
					{region && (
						<InspectorSection title="Authored region">
							<dl>
								<DetailRow
									label="Origin"
									value={`${region.geometry.x}, ${region.geometry.y} ${ir.units}`}
								/>
								<DetailRow
									label="Dimensions"
									value={`${region.geometry.width} × ${region.geometry.height} ${ir.units}`}
								/>
							</dl>
						</InspectorSection>
					)}
					<details className="mt-4 text-xs wrap-anywhere">
						<summary>Stable IDs</summary>
						<dl>
							<DetailRow label="Constraint" value={entry.constraintId} />
							{entry.regionId && (
								<DetailRow label="Region" value={entry.regionId} />
							)}
						</dl>
					</details>
				</>
			)}
			<InspectorSection title="Constraints">
				<div className="flex flex-col gap-1">
					{entries.map((item) => (
						<button
							key={JSON.stringify([
								item.constraintId,
								item.regionId,
								item.waypoint,
							])}
							type="button"
							className="rounded-md border p-2 text-left text-xs hover:border-primary aria-pressed:border-primary aria-pressed:bg-secondary"
							aria-pressed={sameConstraintRegion(selection, item)}
							onClick={() => onSelect(item)}
						>
							{item.label}
						</button>
					))}
				</div>
				{!entries.length && (
					<p className="text-xs text-muted-foreground">
						No constraints declared.
					</p>
				)}
			</InspectorSection>
		</>
	);
}
