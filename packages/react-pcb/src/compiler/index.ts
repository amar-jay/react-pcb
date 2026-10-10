import type { ReactNode } from "react";
import type {
	BoardManufacturingReport,
	ManufacturingReport,
} from "../footprints/manufacturing.ts";
import { type BoardIr, PCB_IR_SCHEMA_VERSION } from "../ir/index.ts";
import { createDeclarationTransaction } from "../protocol/index.ts";
import { renderDeclarations } from "../renderer/index.ts";
import type { CompilerDiagnostic } from "./diagnostics.ts";
import {
	compilerError,
	formatDiagnostic,
	PcbCompileError,
} from "./diagnostics.ts";

export type { CompilerDiagnostic, DiagnosticSeverity } from "./diagnostics.ts";
export { formatDiagnostic, PcbCompileError };

export type CompileOptions = {
	command?: readonly string[];
	cwd?: string;
	hideWarnings?: boolean;
	baseRevision?: number | null;
};

export type CompileResult = {
	ir: BoardIr;
	manufacturingReports: Readonly<Record<string, ManufacturingReport>>;
	boardManufacturingReport: BoardManufacturingReport | null;
	diagnostics: CompilerDiagnostic[];
};

type CompilerResponse = CompileResult & {
	compilerDiagnostics: CompilerDiagnostic[];
};

export async function compile(
	element: ReactNode,
	options: CompileOptions = {},
): Promise<CompileResult> {
	const declarations = await renderDeclarations(element);
	const command = options.command ?? [
		"cargo",
		"run",
		"--quiet",
		"-p",
		"pcbir",
		"--",
		"compile",
	];
	const process = Bun.spawn([...command], {
		cwd: options.cwd,
		stdin: new Blob([
			JSON.stringify(
				createDeclarationTransaction(
					declarations,
					options.baseRevision ?? null,
				),
			),
		]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (exitCode !== 0) throw compilerError(stderr, exitCode);
	if (stderr.trim()) console.error(stderr.trim());
	const response = JSON.parse(stdout) as CompilerResponse;
	if (response.ir.schemaVersion !== PCB_IR_SCHEMA_VERSION) {
		throw new PcbCompileError({
			code: "PCBCLI002",
			severity: "error",
			message: `unsupported PCB IR schema version ${String(response.ir.schemaVersion)}`,
			entity: null,
			help: `Use a compiler that emits schema version ${PCB_IR_SCHEMA_VERSION}.`,
		});
	}
	const { compilerDiagnostics, ...result } = response;
	if (
		result.ir.board.manufacturingProfile &&
		!result.boardManufacturingReport
	) {
		throw new PcbCompileError({
			code: "PCBCLI002",
			severity: "error",
			message:
				"compiler does not provide board-level manufacturing checks for the selected profile",
			entity: result.ir.board.id,
			help: "Use a compiler that implements board-level manufacturing validation.",
		});
	}
	if (!options.hideWarnings) {
		for (const diagnostic of compilerDiagnostics) {
			console.error(formatDiagnostic(diagnostic));
		}
	}
	return {
		...result,
		boardManufacturingReport: result.boardManufacturingReport ?? null,
		diagnostics: [...compilerDiagnostics, ...result.diagnostics],
	};
}
