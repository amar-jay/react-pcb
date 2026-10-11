import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BoardIr } from "@react-pcb/core";
import {
	buildBoardPreview,
	exportBoardPreview,
	type PreviewSnapshot,
	startBoardPreview,
} from "@react-pcb/preview";
import { constraintSource } from "./constraint-fixture.ts";
import { assertDefined } from "./fixtures.ts";

const cwd = resolve(import.meta.dir, "../../../..");

function identities(ir: BoardIr) {
	return {
		regions: Object.keys(ir.regions).sort(),
		routes: ir.routeConstraints,
		pairs: ir.differentialPairs,
		keepouts: ir.keepouts,
		zones: ir.zones,
	};
}

async function until(predicate: () => boolean) {
	const deadline = Date.now() + 10000;
	while (!predicate()) {
		if (Date.now() > deadline)
			throw new Error("Constraint build did not settle");
		await Bun.sleep(30);
	}
}

test("initial constraint failures preserve current geometry and sub-nm zones fail before projection", async () => {
	const directory = await mkdtemp(join(cwd, ".constraint-test-"));
	const entry = join(directory, "board.tsx");
	try {
		for (const [mode, code] of [
			["off-board", "PCBIR039"],
			["sub-nm", "PCBIR037"],
		] as const) {
			await Bun.write(entry, constraintSource(mode));
			const build = await buildBoardPreview(entry);
			expect(build.result).toBeNull();
			expect(build.projection).toBeNull();
			expect(build.error).toContain(code);
			expect(build.buildDiagnostics).toEqual(
				expect.arrayContaining([expect.objectContaining({ code })]),
			);
			if (mode === "off-board") {
				expect(build.buildDiagnostics).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							code,
							geometry: expect.objectContaining({
								kind: "constraint-region",
								regionBounds: {
									min2: [60_000_000, 6_000_000],
									max2: [66_000_000, 12_000_000],
								},
							}),
						}),
					]),
				);
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 15000);

test("live constraint failures retain the accepted scene, transmit current findings and recover stable IDs and exports", async () => {
	const directory = await mkdtemp(join(cwd, ".constraint-test-"));
	const entry = join(directory, "board.tsx");
	let server: Awaited<ReturnType<typeof startBoardPreview>> | undefined;
	try {
		await Bun.write(entry, constraintSource("off-board"));
		server = await startBoardPreview(entry, { port: 0, pollInterval: 30 });
		const live = server;
		expect(live.snapshot.result).toBeNull();
		expect(live.snapshot.projection).toBeNull();
		expect(live.snapshot.error).toContain("PCBIR039");
		async function rebuild(mode: Parameters<typeof constraintSource>[0]) {
			const version = live.snapshot.version;
			await Bun.write(entry, constraintSource(mode));
			await until(
				() => live.snapshot.version > version && !live.snapshot.building,
			);
			// Verify the actual JSON boundary consumed by the browser.
			return (await (
				await fetch(new URL("/__preview/data", live.url))
			).json()) as PreviewSnapshot;
		}
		const accepted = await rebuild("valid");
		expect(accepted.error).toBeNull();
		const acceptedIr = assertDefined(accepted.result).ir;
		const acceptedSvg = assertDefined(accepted.projection).svg;
		for (const kind of ["zone", "keepout", "route", "differential-pair"])
			expect(acceptedSvg).toContain(`data-constraint-type="${kind}"`);
		expect(
			accepted.result?.diagnostics.filter((d) => d.code === "PCBIR043"),
		).toHaveLength(2);
		const output = join(directory, "index.html");
		await exportBoardPreview(entry, output);
		const acceptedHtml = await Bun.file(output).text();
		for (const [mode, code] of [
			["overlap", "PCBIR040"],
			["blocked", "PCBIR042"],
			["blocked-pair", "PCBIR042"],
			["anonymous", "PCBIR029"],
			["sub-nm", "PCBIR037"],
			["off-board", "PCBIR039"],
		] as const) {
			const failed = await rebuild(mode);
			expect(failed.error).toContain(code);
			expect(failed.result?.ir).toEqual(acceptedIr);
			expect(failed.projection?.svg).toBe(acceptedSvg);
			const findings = assertDefined(failed.buildDiagnostics).filter(
				(d) => d.code === code && d.severity === "error",
			);
			expect(findings).toHaveLength(mode === "blocked-pair" ? 2 : 1);
			if (mode === "blocked-pair")
				expect(
					findings
						.map((d) =>
							d.geometry?.kind === "constraint-region" ? d.geometry.net : null,
						)
						.sort(),
				).toEqual(["return", "sig"]);
			if (["overlap", "blocked", "blocked-pair", "off-board"].includes(mode))
				expect(
					findings.every((d) => d.geometry?.kind === "constraint-region"),
				).toBe(true);
			if (mode === "overlap") {
				await expect(exportBoardPreview(entry, output)).rejects.toThrow(code);
				expect(await Bun.file(output).text()).toBe(acceptedHtml);
			}
			const recovered = await rebuild("valid");
			expect(recovered.error).toBeNull();
			expect(recovered.buildDiagnostics).toEqual([]);
			expect(recovered.projection?.svg).toBe(acceptedSvg);
			expect(identities(assertDefined(recovered.result).ir)).toEqual(
				identities(acceptedIr),
			);
		}
		const edited = await rebuild("edited");
		expect(edited.error).toBeNull();
		const editedIr = assertDefined(edited.result).ir;
		expect(editedIr.routeConstraints).toEqual(acceptedIr.routeConstraints);
		expect(editedIr.differentialPairs).toEqual(acceptedIr.differentialPairs);
		expect(editedIr.zones).toEqual(acceptedIr.zones);
		expect(editedIr.keepouts).toEqual(
			expect.arrayContaining(acceptedIr.keepouts),
		);
		expect(Object.keys(editedIr.regions)).toEqual(
			expect.arrayContaining(Object.keys(acceptedIr.regions)),
		);
		expect(edited.projection?.svg).not.toBe(acceptedSvg);
		await exportBoardPreview(entry, output);
		const html = await Bun.file(output).text();
		const embedded = JSON.parse(
			assertDefined(html.match(/id="preview-data">(.*?)<\/script>/s)?.[1]),
		) as PreviewSnapshot;
		expect(embedded.live).toBe(false);
		expect(embedded.result?.ir).toEqual(editedIr);
		expect(embedded.projection?.svg).toBe(edited.projection?.svg);
	} finally {
		await server?.stop();
		await rm(directory, { recursive: true, force: true });
	}
}, 45000);
