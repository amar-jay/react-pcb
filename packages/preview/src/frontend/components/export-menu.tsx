import {
	ArrowDownToLine,
	ChevronDown,
	CircuitBoard,
	Code2,
} from "lucide-react";
import type { PreviewSnapshot } from "../../index.ts";
import { download } from "../lib/scene.ts";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function ExportMenu({
	snapshot,
	onExportSvg,
}: {
	snapshot: PreviewSnapshot;
	onExportSvg: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="default"
					className="h-8.5 flex-1 gap-2"
					disabled={!snapshot.result}
				>
					<ArrowDownToLine />
					Export
					<ChevronDown />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8}>
				<DropdownMenuLabel>Export board</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					id="download-svg"
					disabled={!snapshot.projection}
					onSelect={onExportSvg}
				>
					<CircuitBoard />
					Save SVG
				</DropdownMenuItem>
				<DropdownMenuItem
					id="download-ir"
					disabled={!snapshot.result}
					onSelect={() =>
						snapshot.result &&
						download(
							"board.json",
							`${JSON.stringify(snapshot.result, null, 2)}\n`,
							"application/json",
						)
					}
				>
					<Code2 />
					Save IR
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
