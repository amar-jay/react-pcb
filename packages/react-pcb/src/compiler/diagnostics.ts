export type DiagnosticSeverity = "error" | "warning";

export type CompilerDiagnostic = {
	code: string;
	severity: DiagnosticSeverity;
	message: string;
	entity: string | null;
	help?: string;
	source?: {
		sourceKey?: string;
		file?: string;
		line?: number;
		column?: number;
	};
};

type CompilerFailure = {
	diagnostic: CompilerDiagnostic;
	diagnostics?: CompilerDiagnostic[];
};

export class PcbCompileError extends Error {
	readonly diagnostic: CompilerDiagnostic;
	readonly diagnostics: readonly CompilerDiagnostic[];

	constructor(
		diagnostic: CompilerDiagnostic,
		diagnostics: readonly CompilerDiagnostic[] = [],
	) {
		super([...diagnostics, diagnostic].map(formatDiagnostic).join("\n\n"));
		this.name = "PcbCompileError";
		this.diagnostic = diagnostic;
		this.diagnostics = diagnostics;
	}
}

export function formatDiagnostic(diagnostic: CompilerDiagnostic): string {
	const lines = [
		`${diagnostic.severity}[${diagnostic.code}]: ${diagnostic.message}`,
	];
	if (diagnostic.entity) lines.push(`  --> ${diagnostic.entity}`);
	if (diagnostic.source?.file) {
		const { file, line, column } = diagnostic.source;
		lines.push(
			`  at ${file}${line === undefined ? "" : `:${line}`}${column === undefined ? "" : `:${column}`}`,
		);
	}
	if (diagnostic.help) lines.push(`  help: ${diagnostic.help}`);
	return lines.join("\n");
}

export function compilerError(
	stderr: string,
	exitCode: number,
): PcbCompileError {
	const message = stderr.trim();
	try {
		const failure = JSON.parse(message) as CompilerFailure;
		if (failure.diagnostic?.code && failure.diagnostic.message) {
			return new PcbCompileError(failure.diagnostic, failure.diagnostics);
		}
	} catch {
		// Preserve output from older or custom compiler commands below.
	}

	return new PcbCompileError({
		code: "PCBCLI001",
		severity: "error",
		message: message || `pcbir exited with status ${exitCode}`,
		entity: null,
		help: "Check the compiler command and its stderr output.",
	});
}
