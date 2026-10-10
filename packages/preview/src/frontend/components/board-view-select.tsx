import type { BoardView } from "../lib/scene-presentation.ts";
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
				className="ml-auto h-8.5 w-27 shrink-0 px-2 text-[12px] data-[size=default]:h-8.5"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="end">
				<SelectItem value="board">Board</SelectItem>
				<SelectItem value="analysis">Analysis</SelectItem>
			</SelectContent>
		</Select>
	);
}
