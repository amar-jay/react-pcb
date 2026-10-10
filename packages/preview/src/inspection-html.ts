import type { BoardInspection } from "./inspection.ts";

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[character] ?? character,
	);
const link = (file: string, label: string) =>
	`<a href="${escapeHtml(file)}">${escapeHtml(label)}</a>`;
const reportStatus = (report: { conformsToCheckedRules: boolean } | null) =>
	report
		? report.conformsToCheckedRules
			? "Selected checks pass"
			: "Selected checks failed"
		: "No manufacturing profile selected.";

/** Small static index: geometry and canonical data stay in their linked artifacts. */
export function inspectionHtml(inspection: BoardInspection): string {
	const { ir, boardManufacturingReport } = inspection.result;
	const title =
		typeof ir.board.metadata.title === "string"
			? ir.board.metadata.title
			: ir.board.id;
	const footprints = inspection.footprints
		.map((item) => {
			const bounds = item.physical?.bounds;
			const dimensions = bounds
				? `${(bounds.max2[0] - bounds.min2[0]) / 2_000_000} × ${(bounds.max2[1] - bounds.min2[1]) / 2_000_000} mm`
				: "";
			const parts = item.parts
				.map(
					(part) =>
						`<code title="${escapeHtml(part.id)}">${escapeHtml(part.reference)}${part.reference === part.id ? "" : ` (${escapeHtml(part.id)})`}${part.at ? "" : " [unplaced]"}</code>`,
				)
				.join(", ");
			const files = [link(item.files.definition, "Definition JSON")];
			if (item.files.geometry)
				files.push(link(item.files.geometry, "Geometry JSON"));
			if (item.files.svg) files.push(link(item.files.svg, "SVG"));
			if (item.report)
				files.push(link(item.files.manufacturing, "Checks JSON"));
			return `<article data-footprint-key="${escapeHtml(item.key)}">
<h2>${escapeHtml(item.key)}</h2>
${dimensions ? `<p>${dimensions} · Component-side view</p>` : ""}
${item.files.svg ? `<img src="${escapeHtml(item.files.svg)}" alt="${escapeHtml(item.key)} footprint geometry">` : "<p>No canonical physical geometry is available for this footprint.</p>"}
<p>Parts: ${parts}</p>
<p>${escapeHtml(reportStatus(item.report))}</p>
<nav>${files.join(" · ")}</nav>
</article>`;
		})
		.join("\n");
	const diagnostics = inspection.diagnostics.length
		? `<details><summary>${inspection.diagnostics.length} diagnostics</summary><ul>${inspection.diagnostics.map((diagnostic) => `<li><code>${escapeHtml(diagnostic.code)}${diagnostic.entity ? ` · ${escapeHtml(diagnostic.entity)}` : ""}</code> ${escapeHtml(diagnostic.message)}</li>`).join("")}</ul></details>`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Footprint inspection</title>
<link rel="icon" href="data:,">
<style>
body{font:14px system-ui,sans-serif;color:#0f172a;margin:24px}h1{font-size:20px}h2{font:600 14px monospace;margin:0}p,nav,summary{font-size:12px}p{margin:8px 0}code,h2{overflow-wrap:anywhere}a{color:#1d4ed8}header{margin-bottom:20px}.footprints{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));gap:16px}article{min-width:0;border:1px solid #cbd5e1;padding:12px}img{display:block;width:100%;height:240px;object-fit:contain}details{margin-top:12px}
</style>
</head>
<body>
<header>
<h1>${escapeHtml(title)} / Footprints</h1>
<p><code>${escapeHtml(inspection.entry)}</code></p>
<p>${inspection.footprints.length} footprints · ${ir.parts.length} parts · ${escapeHtml(reportStatus(boardManufacturingReport))}</p>
<nav>${[link(inspection.files.manifest, "Manifest"), link(inspection.files.board, "Board JSON"), link(inspection.files.svg, "Board SVG"), link(inspection.files.result, "Compile result"), ...(boardManufacturingReport ? [link(inspection.files.manufacturing, "Board checks")] : [])].join(" · ")}</nav>
${diagnostics}
</header>
<main class="footprints">${footprints || "<p>This board has no parts to inspect.</p>"}</main>
</body>
</html>\n`;
}
