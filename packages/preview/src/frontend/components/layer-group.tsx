import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function LayerGroup({
	title,
	legend,
	children,
}: {
	title: string;
	legend?: ReactNode;
	children: ReactNode;
}) {
	return (
		<details
			className="group/layers mb-2 border-b pb-2.25 last:mb-0 last:border-b-0 last:pb-0"
			open
		>
			<summary className="flex list-none items-center gap-2 px-1 pt-2.25 pb-3 text-[12px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
				<span>{title}</span>
				{legend != null && (
					<small className="ml-auto font-mono text-[11px] leading-normal font-normal">
						{legend}
					</small>
				)}
				<ChevronDown
					size={14}
					className={cn(
						"shrink-0 transition-transform duration-150 group-not-open/layers:-rotate-90",
						legend != null ? "ml-0" : "ml-auto",
					)}
				/>
			</summary>
			{children}
		</details>
	);
}
