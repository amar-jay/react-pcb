import { compilerError, PcbCompileError } from "../compiler/diagnostics.ts";
import { type BoardIr, PCB_IR_SCHEMA_VERSION } from "./index.ts";

/** Explicitly upgrade saved schema-2 board JSON. Preserves IDs, geometry and
 * revision; supplies legacy scope defaults without certifying physical routing. */
export async function upgradeBoardIr(
	input: unknown,
	options: { cwd?: string; command?: readonly string[] } = {},
): Promise<BoardIr> {
	const child = Bun.spawn(
		[
			...(options.command ?? [
				"cargo",
				"run",
				"--quiet",
				"-p",
				"pcbir",
				"--",
				"upgrade-board",
			]),
		],
		{
			cwd: options.cwd,
			stdin: new Blob([JSON.stringify(input)]),
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code !== 0) throw compilerError(stderr, code);
	const result = JSON.parse(stdout) as BoardIr;
	if (result.schemaVersion !== PCB_IR_SCHEMA_VERSION) {
		throw new PcbCompileError({
			code: "PCBCLI002",
			severity: "error",
			message: `unsupported upgraded PCB IR schema version ${String(result.schemaVersion)}`,
			entity: null,
			help: `Use a compiler that emits schema version ${PCB_IR_SCHEMA_VERSION}.`,
		});
	}
	return result;
}
