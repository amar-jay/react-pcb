import { stat, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function fingerprint(
	path: string,
	contents = false,
): Promise<string> {
	try {
		const info = await stat(path, { bigint: true });
		if (info.isDirectory()) {
			const entries = (await readdir(path, { withFileTypes: true }))
				.filter(
					(f) => !["node_modules", ".git", "target", "dist"].includes(f.name),
				)
				.sort((a, b) => a.name.localeCompare(b.name));
			if (contents)
				return (
					await Promise.all(
						entries.map(
							async (f) =>
								`${f.name}:${await fingerprint(join(path, f.name), true)}`,
						),
					)
				).join("\n");
			return entries.map((f) => f.name).join("\n");
		}
		return `${info.mtimeNs}:${info.ctimeNs}:${info.size}`;
	} catch {
		return "missing";
	}
}
