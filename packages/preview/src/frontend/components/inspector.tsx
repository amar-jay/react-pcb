import type { BoardIr, IrPart } from "@react-pcb/core";
import {
	AlertCircle,
	ArrowRight,
	Check,
	ChevronDown,
	Crosshair,
} from "lucide-react";
import type { PreviewSnapshot } from "../../index.ts";
import { DetailRow, InspectorSection } from "./inspector-section.tsx";
import { LayerStackup } from "./layer-stackup.tsx";
import { Badge } from "./ui/badge";

export function Inspector({
	snapshot,
	part,
	net,
	onNet,
}: {
	snapshot: PreviewSnapshot;
	part: IrPart | undefined;
	net: string;
	onNet: (id: string) => void;
}) {
	const ir = snapshot.result?.ir;
	if (!ir)
		return (
			<div className="py-7.5 text-center text-muted-foreground">
				<Crosshair size={28} strokeWidth={1} className="mx-auto mb-4" />
				<h3 className="text-[16px] text-foreground">No board loaded</h3>
				<p className="mt-2 text-[13px] leading-[1.7]">
					Board details appear after the source compiles.
				</p>
			</div>
		);
	return part ? (
		<PartDetails
			snapshot={snapshot}
			ir={ir}
			part={part}
			net={net}
			onNet={onNet}
		/>
	) : (
		<BoardOverview snapshot={snapshot} ir={ir} />
	);
}

function BoardOverview({
	snapshot,
	ir,
}: {
	snapshot: PreviewSnapshot;
	ir: BoardIr;
}) {
	const outline = ir.regions[ir.board.outline]?.geometry;
	const copper = ir.board.layers.stackup.entries.filter(
		(layer) => layer.kind === "copper",
	);
	const report = snapshot.result?.boardManufacturingReport;
	const metrics = [
		{ label: "Parts", value: ir.parts.length },
		{ label: "Nets", value: ir.nets.length },
		{ label: "Copper layers", value: copper.length },
		{
			label: "Placed",
			value: ir.parts.filter((item) => item.at).length,
			total: ir.parts.length,
		},
	];
	return (
		<>
			<div className="rounded-md border bg-muted/50 p-3">
				<dl>
					<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
						<dt className="text-[12px] text-muted-foreground">Dimensions</dt>
						<dd className="font-mono text-[16px] leading-6 wrap-anywhere">
							{outline
								? `${outline.width} × ${outline.height} ${ir.units}`
								: "Unresolved outline"}
						</dd>
					</div>
					{outline && (
						<div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
							<dt>Origin</dt>
							<dd className="font-mono wrap-anywhere">
								{outline.x}, {outline.y} {ir.units}
							</dd>
						</div>
					)}
				</dl>
				<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3">
					{metrics.map(({ label, value, total }) => (
						<div
							key={label}
							className="flex min-w-0 items-baseline justify-between gap-2"
						>
							<dt className="text-[11px] text-muted-foreground">{label}</dt>
							<dd className="shrink-0 font-mono text-[13px] leading-5">
								{value}
								{total !== undefined && (
									<span className="text-muted-foreground"> / {total}</span>
								)}
							</dd>
						</div>
					))}
				</dl>
			</div>
			<LayerStackup ir={ir} />
			{report && (
				<InspectorSection
					title={
						snapshot.error ? "Last successful board checks" : "Board checks"
					}
				>
					<dl>
						{report.checks
							.filter((check) => check.id !== "unverified")
							.map((check) => (
								<DetailRow
									key={check.id}
									label={
										check.id === "board-copper-spacing"
											? "Copper spacing"
											: "Inter-part courtyards"
									}
									value={check.status.replaceAll("-", " ")}
									status={check.status}
								/>
							))}
					</dl>
					<p className="mt-2.5 text-[11px] leading-[1.7] text-muted-foreground">
						Placed copper and declared courtyard geometry.
					</p>
				</InspectorSection>
			)}
		</>
	);
}

function PartDetails({
	snapshot,
	ir,
	part,
	net,
	onNet,
}: {
	snapshot: PreviewSnapshot;
	ir: BoardIr;
	part: IrPart;
	net: string;
	onNet: (id: string) => void;
}) {
	const component = ir.componentDefinitions[part.component];
	const report = snapshot.result?.manufacturingReports[part.footprint];
	return (
		<div className="[&>section]:mt-4 [&>section]:pt-3 [&>section>h4]:mb-2 [&>section>h4]:text-[13px]">
			<div className="flex items-center justify-between gap-3">
				<h3 className="min-w-0 font-mono text-[20px] leading-6 wrap-anywhere">
					{part.reference}
				</h3>
				<Badge
					variant="outline"
					className="rounded-[5px] px-1.75 py-0.5 text-[11px] text-muted-foreground"
				>
					{part.side === "front" ? "Front" : "Back"} side
				</Badge>
			</div>
			<p className="mt-1 text-[13px] wrap-anywhere">
				{component?.mpn ?? component?.value ?? part.component}
			</p>
			{component?.manufacturer && (
				<p className="mt-0.5 text-[11px] text-muted-foreground">
					{component.manufacturer}
				</p>
			)}
			<InspectorSection
				title={
					<>
						Placement <small>{ir.units}</small>
					</>
				}
			>
				<dl className="grid grid-cols-2 gap-x-4 gap-y-1 [&>div]:gap-2 [&>div]:py-1 [&>div]:text-[12px]">
					{part.at ? (
						(
							[
								["X position", part.at[0]],
								["Y position", part.at[1]],
							] as const
						).map(([label, position]) => (
							<DetailRow key={label} label={label} value={String(position)} />
						))
					) : (
						<div className="col-span-2 py-1 text-[12px] text-muted-foreground">
							Unplaced
						</div>
					)}
					<DetailRow label="Rotation" value={`${part.rotation}°`} />
					<DetailRow
						label="Features"
						value={String(Object.keys(part.physicalFeatures).length)}
					/>
				</dl>
			</InspectorSection>
			<InspectorSection title="Footprint">
				<p className="rounded-md border bg-muted px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] wrap-anywhere">
					{part.footprint}
				</p>
			</InspectorSection>
			<InspectorSection
				title={
					<>
						Connections <small>{Object.keys(part.connections).length}</small>
					</>
				}
			>
				<div className="flex flex-col gap-1">
					{Object.entries(part.connections).map(([pin, id]) => (
						<ConnectionButton
							key={pin}
							pin={pin}
							name={ir.nets.find((item) => item.id === id)?.name ?? id}
							active={net === id}
							onClick={() => onNet(net === id ? "" : id)}
						/>
					))}
					{!Object.keys(part.connections).length && (
						<p className="py-2.5 text-[13px] leading-[1.7] text-muted-foreground">
							No connections declared.
						</p>
					)}
				</div>
			</InspectorSection>
			<InspectorSection title="Footprint checks">
				{report ? (
					<details
						className="group/report overflow-hidden rounded-md border"
						key={`${part.id}:${part.footprint}:${report.conformsToCheckedRules}`}
						open={!report.conformsToCheckedRules}
					>
						<summary
							className="flex list-none items-center gap-2 bg-[color-mix(in_srgb,var(--success)_5%,var(--card))] px-2.5 py-2 text-[12px] text-success data-[state=failed]:bg-[color-mix(in_srgb,var(--destructive)_5%,var(--card))] data-[state=failed]:text-destructive [&::-webkit-details-marker]:hidden"
							data-state={report.conformsToCheckedRules ? "passed" : "failed"}
						>
							{report.conformsToCheckedRules ? (
								<Check size={16} />
							) : (
								<AlertCircle size={16} />
							)}
							<span className="flex-1">
								{report.conformsToCheckedRules
									? "Checked rules pass"
									: "Rule failures"}
							</span>
							<ChevronDown size={14} className="group-open/report:rotate-180" />
						</summary>
						<div className="border-t p-3">
							<p className="mb-2 font-mono text-[11px] leading-[1.7] text-muted-foreground wrap-anywhere">
								{report.profile.key}
							</p>
							<dl>
								{report.checks.map((check) => (
									<DetailRow
										key={check.id}
										label={check.id}
										value={check.status.replaceAll("-", " ")}
										status={check.status}
										compact
									/>
								))}
							</dl>
						</div>
					</details>
				) : (
					<p className="py-2.5 text-[13px] leading-[1.7] text-muted-foreground">
						No report for this footprint.
					</p>
				)}
				{report && (
					<p className="mt-2.5 text-[11px] leading-[1.7] text-muted-foreground">
						Checks cover selected rules for this footprint.
					</p>
				)}
			</InspectorSection>
		</div>
	);
}

function ConnectionButton({
	pin,
	name,
	active,
	onClick,
}: {
	pin: string;
	name: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="flex min-h-8 w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left hover:border-primary aria-pressed:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] aria-pressed:bg-secondary"
			aria-pressed={active}
			onClick={onClick}
			title={`Highlight ${name}`}
		>
			<span className="min-w-6.5 font-mono text-[11px] leading-[normal] text-muted-foreground wrap-anywhere">
				{pin}
			</span>
			<ArrowRight size={14} className="shrink-0 text-muted-foreground" />
			<span className="ml-auto min-w-0 text-[12px] text-primary wrap-anywhere">
				{name}
			</span>
		</button>
	);
}
