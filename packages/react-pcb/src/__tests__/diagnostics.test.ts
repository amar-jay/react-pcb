import { expect, test } from "bun:test";

import { compilerError, formatDiagnostic } from "../compiler/diagnostics.ts";

test("formats structured compiler diagnostics", () => {
	const error = compilerError(
		JSON.stringify({
			diagnostic: {
				code: "PCBIR006",
				severity: "error",
				message: "duplicate component instance ID",
				entity: "usb-controller/U1",
				help: "Give each placed part a unique ID.",
			},
		}),
		1,
	);

	expect(formatDiagnostic(error.diagnostic)).toBe(
		[
			"error[PCBIR006]: duplicate component instance ID",
			"  --> usb-controller/U1",
			"  help: Give each placed part a unique ID.",
		].join("\n"),
	);
});

test("preserves stderr from custom compiler commands", () => {
	const error = compilerError("custom compiler failed", 3);
	expect(error.diagnostic).toMatchObject({
		code: "PCBCLI001",
		message: "custom compiler failed",
	});
});

test("preserves warnings emitted before a fatal compiler error", () => {
	const error = compilerError(
		JSON.stringify({
			diagnostic: {
				code: "PCBIR013",
				severity: "error",
				message: "duplicate module scope",
				entity: "usb-controller",
			},
			diagnostics: [
				{
					code: "PCBIR014",
					severity: "warning",
					message: "module contains no declarations",
					entity: "usb-controller",
				},
			],
		}),
		1,
	);

	expect(error.diagnostics).toHaveLength(1);
	expect(error.message).toContain(
		"warning[PCBIR014]: module contains no declarations",
	);
	expect(error.message).toContain("error[PCBIR013]: duplicate module scope");
});
