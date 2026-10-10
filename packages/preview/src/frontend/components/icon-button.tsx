import type { ComponentProps } from "react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function IconButton({
	label,
	...props
}: ComponentProps<typeof Button> & { label: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-lg"
					aria-label={label}
					{...props}
				/>
			</TooltipTrigger>
			<TooltipContent sideOffset={6}>{label}</TooltipContent>
		</Tooltip>
	);
}
