import type { BoardIr } from "../ir/index.ts";
import { type CompilerDiagnostic, compilerError } from "./diagnostics.ts";

export type BoardProjection = {
	svg: string;
	diagnostics: CompilerDiagnostic[];
};

/** Project compiled placement; no placement/routing is inferred by the projection. */
export async function boardSvg(
	ir: BoardIr,
	options: { cwd?: string; command?: readonly string[] } = {},
): Promise<BoardProjection> {
	const child = Bun.spawn(
		[
			...(options.command ?? [
				"cargo",
				"run",
				"--quiet",
				"-p",
				"pcbir",
				"--",
				"board-svg",
			]),
		],
		{
			cwd: options.cwd,
			stdin: new Blob([JSON.stringify(ir)]),
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
	return JSON.parse(stdout) as BoardProjection;
}
