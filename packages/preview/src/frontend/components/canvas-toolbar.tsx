import type { BoardIr } from "@react-pcb/core";
import { FileCode2, Network } from "lucide-react";
import type { ReactNode } from "react";
import type { BoardView } from "../lib/scene-presentation.ts";
import { BoardViewSelect } from "./board-view-select.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { SidebarTrigger } from "./ui/sidebar";

export function CanvasToolbar({
	ir,
	title,
	entry,
	net,
	onNet,
	children,
	view,
	onView,
}: {
	ir: BoardIr | undefined;
	title: string;
	entry: string;
	net: string;
	onNet: (id: string) => void;
	children: ReactNode;
	view: BoardView;
	onView: (view: BoardView) => void;
}) {
	// Keep the reset option distinct from every canonical net ID.
	let allNetsValue = "__all__";
	while (ir?.nets.some((item) => item.id === allNetsValue)) allNetsValue += "_";
	return (
		<div className="flex min-h-15 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-2">
			<div className="flex min-w-0 flex-1 items-center gap-3 max-[600px]:basis-full">
				<SidebarTrigger aria-label="Toggle design sidebar" />
				<div className="min-w-0">
					<h1
						id="board-title"
						title={title}
						className="truncate text-[15px] leading-[1.3] font-semibold"
					>
						{title}
					</h1>
					<div
						className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
						title={entry}
					>
						<FileCode2 size={11} className="shrink-0" />
						<span id="source" className="truncate">
							{entry.split(/[\\/]/).pop() || "Board JSX"}
						</span>
					</div>
				</div>
				<BoardViewSelect value={view} onChange={onView} />
			</div>
			<div className="flex min-w-0 items-center gap-2 max-[600px]:w-full max-[600px]:justify-end">
				<Select
					value={net || allNetsValue}
					onValueChange={(value) => onNet(value === allNetsValue ? "" : value)}
				>
					<SelectTrigger
						id="net"
						aria-label="Highlight net"
						className="data-[size=default]:h-8.5 min-w-30 max-w-47.5 text-[12px] max-md:min-w-0 max-md:max-w-30.5 max-md:px-2"
					>
						<Network size={14} />
						<SelectValue />
					</SelectTrigger>
					<SelectContent position="popper" align="end">
						<SelectItem value={allNetsValue}>All nets</SelectItem>
						{ir?.nets.map((item) => (
							<SelectItem key={item.id} value={item.id}>
								{item.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{children}
			</div>
		</div>
	);
}
