import { useId } from "react";
import type { SceneLayer } from "../lib/scene.ts";
import { cn } from "../lib/utils";
import { CircularChoice } from "./ui/circular-choice";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

type LayerControlsProps = {
	items: SceneLayer[];
	visibility: Record<string, boolean>;
	onToggle: (key: string, visible: boolean) => void;
};

export function LayerList({ items, visibility, onToggle }: LayerControlsProps) {
	const prefix = useId();
	return items.map((layer) => (
		<label
			key={layer.key}
			htmlFor={`${prefix}-${layer.key}`}
			title={layer.id}
			className={cn(
				"flex min-h-9.5 cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.75 hover:bg-muted",
				layer.overlay && "min-h-9.5",
			)}
		>
			<CircularChoice
				id={`${prefix}-${layer.key}`}
				aria-label={layer.name}
				checked={visibility[layer.key] ?? layer.visible}
				onChange={(event) => onToggle(layer.key, event.target.checked)}
			/>
			<span
				className={cn(
					"h-5 w-0.75 shrink-0 rounded-[3px] border border-[#343b4810]",
					layer.overlay && "size-2.25",
				)}
				style={{ background: layer.color }}
			/>
			<span className="min-w-0 text-[13px] leading-[1.3] font-normal wrap-anywhere">
				{layer.name}
			</span>
		</label>
	));
}

export function TechnicalLayers({
	items,
	visibility,
	onToggle,
}: LayerControlsProps) {
	return [...new Set(items.map((layer) => layer.group))].map((name) => {
		const pair = items.filter((layer) => layer.group === name);
		const first = pair[0];
		if (!first) return null;
		// Shared layers and duplicate sides keep their independent stable-ID controls.
		if (
			pair.some((layer) => !layer.side || layer.allSides) ||
			new Set(pair.map((layer) => layer.side)).size < pair.length
		)
			return (
				<div key={name}>
					<h3 className="px-1.5 py-1.75 text-[13px] font-normal">{name}</h3>
					<LayerList items={pair} visibility={visibility} onToggle={onToggle} />
				</div>
			);
		const front = pair.find((layer) => layer.side === "front");
		const back = pair.find((layer) => layer.side === "back");
		const frontVisible = front && (visibility[front.key] ?? front.visible);
		const backVisible = back && (visibility[back.key] ?? back.visible);
		const value =
			frontVisible && backVisible
				? "both"
				: frontVisible
					? "front"
					: backVisible
						? "back"
						: "hidden";
		return (
			<div
				key={name}
				className="flex min-h-10 items-center gap-2.5 px-1.5 py-1 text-[13px]"
			>
				<span
					className="size-2.25 shrink-0 rounded-[3px] border border-[#343b4820]"
					style={{ background: first.color }}
				/>
				<span className="min-w-0 flex-1 wrap-anywhere">{name}</span>
				<Select
					value={value}
					onValueChange={(next) => {
						for (const layer of pair) {
							const visible = next === "both" || next === layer.side;
							if ((visibility[layer.key] ?? layer.visible) !== visible)
								onToggle(layer.key, visible);
						}
					}}
				>
					<SelectTrigger
						aria-label={`${name} visibility`}
						size="sm"
						className="h-7 w-23 shrink-0 gap-1 px-2 text-[11px] data-[size=sm]:h-7"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent align="end">
						<SelectItem value="hidden">Hidden</SelectItem>
						{front && <SelectItem value="front">Front</SelectItem>}
						{back && <SelectItem value="back">Back</SelectItem>}
						{front && back && <SelectItem value="both">Both</SelectItem>}
					</SelectContent>
				</Select>
			</div>
		);
	});
}
