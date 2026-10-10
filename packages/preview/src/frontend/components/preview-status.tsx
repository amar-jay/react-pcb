import { CircleCheck, CircleX } from "lucide-react";
import type { PreviewSnapshot } from "../../index.ts";
import type { PreviewConnection } from "../hooks/use-preview.ts";
import { IconButton } from "./icon-button.tsx";
import { Badge } from "./ui/badge";

export function PreviewStatus({
	snapshot,
	connection,
	onViewFailure,
}: {
	snapshot: PreviewSnapshot;
	connection: PreviewConnection;
	onViewFailure: () => void;
}) {
	const ir = snapshot.result?.ir;
	const status =
		connection === "disconnected"
			? "Disconnected"
			: connection === "connecting"
				? "Connecting…"
				: snapshot.building
					? "Compiling…"
					: snapshot.error
						? "Build failed"
						: ir
							? "Compiled"
							: "No board loaded";
	const buildState =
		connection === "disconnected"
			? "error"
			: snapshot.building
				? "building"
				: snapshot.error
					? "error"
					: "ready";

	if (snapshot.error && !snapshot.building) {
		return (
			<IconButton
				id="build-error"
				label="View compilation failure"
				aria-haspopup="dialog"
				className="size-7 shrink-0 text-destructive hover:text-destructive"
				onClick={onViewFailure}
			>
				<CircleX className="size-5" aria-hidden="true" />
			</IconButton>
		);
	}

	if (
		connection === "connected" &&
		!snapshot.building &&
		!snapshot.error &&
		ir
	) {
		return (
			<span
				id="status"
				role="status"
				aria-label="Compiled"
				title="Compiled"
				data-state="ready"
				className="grid size-7 shrink-0 place-items-center text-emerald-600 dark:text-emerald-400"
			>
				<CircleCheck className="size-5" aria-hidden="true" />
			</span>
		);
	}

	return (
		<Badge
			id="status"
			className="group/status h-7 gap-[7px] rounded-md bg-[color-mix(in_srgb,var(--success)_9%,var(--card))] px-2.5 text-[12px] font-normal text-success data-[state=error]:bg-[color-mix(in_srgb,var(--destructive)_9%,var(--card))] data-[state=error]:text-destructive data-[state=building]:bg-[#f4eddb] data-[state=building]:text-[#9a7835]"
			role="status"
			title={status}
			variant={buildState === "error" ? "destructive" : "secondary"}
			data-state={buildState}
		>
			<span className="inline-block size-1.5 shrink-0 rounded-full bg-success group-data-[state=error]/status:bg-destructive group-data-[state=building]/status:bg-[#b18c44]" />
			{status}
		</Badge>
	);
}
