import type { BoardIr } from "@react-pcb/core";
import { ChevronRight, Search, X } from "lucide-react";
import { useState } from "react";
import { Input } from "./ui/input";

export function PartsList({
	ir,
	selected,
	onSelect,
}: {
	ir: BoardIr | undefined;
	selected: string | null;
	onSelect: (id: string) => void;
}) {
	const [query, setQuery] = useState("");
	const parts =
		ir?.parts.filter((part) => {
			const component = ir.componentDefinitions[part.component];
			return [
				part.reference,
				part.footprint,
				component?.mpn,
				component?.value,
				component?.manufacturer,
			].some((value) => value?.toLowerCase().includes(query.toLowerCase()));
		}) ?? [];

	return (
		<>
			<div className="relative mt-1.25 mb-4.5 [&>svg]:absolute [&>svg]:top-3 [&>svg]:left-2.75 [&>svg]:text-muted-foreground [&_input]:h-10 [&_input]:rounded-[7px] [&_input]:bg-card [&_input]:py-0 [&_input]:pr-7.75 [&_input]:pl-8.25 [&_input]:text-[13px] [&>button]:absolute [&>button]:top-1.5 [&>button]:right-1.5 [&>button]:grid [&>button]:size-7 [&>button]:place-items-center [&>button]:rounded-sm [&>button]:text-muted-foreground [&>button:hover]:bg-muted [&>button:hover]:text-foreground">
				<Search size={14} />
				<Input
					aria-label="Search parts"
					placeholder="Search parts…"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				{query && (
					<button
						type="button"
						aria-label="Clear part search"
						onClick={() => setQuery("")}
					>
						<X size={12} />
					</button>
				)}
			</div>
			<div className="mb-3 flex items-center justify-between px-1 text-[12px] text-muted-foreground [&_h2]:text-[12px] [&_h2]:font-medium [&>span]:font-mono [&>span]:text-[11px] [&>span]:leading-normal">
				<h2>Parts</h2>
				<span>
					{parts.length}
					{query ? ` / ${ir?.parts.length ?? 0}` : ""}
				</span>
			</div>
			<div id="parts" className="flex flex-col gap-2">
				{parts.map((item) => {
					const component = ir?.componentDefinitions[item.component];
					return (
						<button
							type="button"
							key={item.id}
							className="group/part flex w-full items-center gap-3 rounded-lg border px-2.5 py-3.5 text-left transition-[border-color,background] duration-150 hover:border-[color-mix(in_srgb,var(--primary)_50%,var(--border))] aria-pressed:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] aria-pressed:bg-secondary [&>svg]:ml-auto [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
							data-part-id={item.id}
							aria-pressed={selected === item.id}
							onClick={() => {
								onSelect(item.id);
							}}
						>
							<span className="grid size-9.5 shrink-0 place-items-center rounded-[7px] bg-muted font-mono text-[14px] leading-normal group-aria-pressed/part:bg-card group-aria-pressed/part:text-primary">
								{item.reference}
							</span>
							<span className="min-w-0 text-[13px] font-medium wrap-anywhere [&_small]:mt-1.25 [&_small]:block [&_small]:text-[11px] [&_small]:font-normal [&_small]:text-muted-foreground">
								{component?.mpn ?? component?.value ?? item.footprint}
								<small>
									{!item.at
										? "Unplaced"
										: !Object.keys(item.physicalFeatures).length
											? "No physical geometry"
											: `${item.side === "front" ? "Front" : "Back"} side`}
								</small>
							</span>
							<ChevronRight size={13} />
						</button>
					);
				})}
				{!parts.length && (
					<p className="py-2.5 text-[13px] leading-[1.7] text-muted-foreground">
						{query ? "No parts match your search." : "No parts declared."}
					</p>
				)}
			</div>
		</>
	);
}
