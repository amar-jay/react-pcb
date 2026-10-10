import type { CompilerDiagnostic } from "@react-pcb/core";
import type { PreviewSnapshot } from "../../index.ts";

/** Older live servers send a text log; keep its warnings out of the blocking error list. */
export function previewFindings(
	snapshot: PreviewSnapshot,
): readonly CompilerDiagnostic[] {
	if (!snapshot.error)
		return [
			...(snapshot.result?.diagnostics ?? []),
			...(snapshot.projection?.diagnostics ?? []),
		];
	if (snapshot.buildDiagnostics?.some((item) => item.severity === "error"))
		return snapshot.buildDiagnostics;
	const parsed = [
		...snapshot.error.matchAll(
			/(?:^|\n)(error|warning)\[([^\]]+)\]:\s*([\s\S]*?)(?=\n(?:error|warning)\[|$)/g,
		),
	].flatMap((match): CompilerDiagnostic[] => {
		const [, severity, code, message] = match;
		if (
			(severity !== "error" && severity !== "warning") ||
			code === undefined ||
			message === undefined
		)
			return [];
		const lines = message.split("\n");
		const entityIndex = lines.findIndex((line) =>
			line.trim().startsWith("-->"),
		);
		const entity = lines[entityIndex];
		return [
			{
				code,
				severity,
				message: (entityIndex >= 0 ? lines.slice(0, entityIndex) : lines)
					.join("\n")
					.trim(),
				entity:
					entity === undefined ? null : entity.trim().replace(/^-->\s*/, ""),
			},
		];
	});
	if (parsed.some((item) => item.severity === "error")) return parsed;
	return [
		{
			code: "PCBPREVIEW003",
			severity: "error",
			message: snapshot.error,
			entity: null,
		},
	];
}
