import type { BoardView } from "../lib/scene-presentation.ts";
import { AnalysisIcon, BoardIcon } from "./pcb-icons.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

export function BoardViewSelect({
	value,
	onChange,
}: {
	value: BoardView;
	onChange: (view: BoardView) => void;
}) {
	return (
		<Select
			value={value}
			onValueChange={(value) => {
				if (value === "board" || value === "analysis") onChange(value);
			}}
		>
			<SelectTrigger
				aria-label="Board view"
				className="ml-auto h-8.5 w-32 shrink-0 px-2 text-[12px] data-[size=default]:h-8.5"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="end">
				<SelectItem value="board">
					<span className="flex items-center gap-2">
						<BoardIcon />
						Board
					</span>
				</SelectItem>
				<SelectItem value="analysis">
					<span className="flex items-center gap-2">
						<AnalysisIcon />
						Analysis
					</span>
				</SelectItem>
			</SelectContent>
		</Select>
	);
}
