import type { ComponentProps } from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

export function CircularChoice({
	type = "checkbox",
	className,
	...props
}: Omit<ComponentProps<"input">, "type"> & { type?: "checkbox" | "radio" }) {
	return (
		<span className="relative inline-flex size-[15px] shrink-0 align-middle">
			<input
				{...props}
				type={type}
				className={cn(
					"peer m-0 size-full cursor-pointer appearance-none rounded-full border border-muted-foreground/60 bg-card checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
			/>
			{type === "checkbox" ? (
				<Check
					aria-hidden="true"
					strokeWidth={3}
					className="pointer-events-none absolute inset-[2px] size-[11px] text-primary-foreground opacity-0 peer-checked:opacity-100 peer-disabled:text-muted-foreground"
				/>
			) : (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[4px] rounded-full bg-primary-foreground opacity-0 peer-checked:opacity-100 peer-disabled:text-muted-foreground"
				/>
			)}
		</span>
	);
}
