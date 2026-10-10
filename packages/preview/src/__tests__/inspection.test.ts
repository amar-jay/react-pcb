import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DOMParser } from "linkedom";
import { compileFootprint, footprintSvg } from "@react-pcb/core";
import { buildBoardInspection, exportBoardInspection } from "../index.ts";
import { inspectionFootprintSvg } from "../inspection-svg.ts";
import { footprintSceneLayer } from "../frontend/lib/footprint-scene.ts";
import { presetVisibility } from "../frontend/lib/layer-presets.ts";

const cwd = resolve(import.meta.dir, "../../../..");
const unsafeKey = "../odd/path & shared";
const title = "</script><script>globalThis.injected=true</script>";
const source = (reverse = false) => `
import React from 'react';
import {Board,Part,net,part,rect,definePhysicalFootprint} from '@react-pcb/core';
import {testLayers} from '../packages/preview/src/__tests__/fixtures.ts';
const footprint=definePhysicalFootprint({key:${JSON.stringify(unsafeKey)},features:[
{id:'P',purpose:'pad',at:['1mm','2mm'],shape:{kind:'oval',size:['1mm','2mm']},layers:['all-copper','all-mask'],drill:{diameter:'0.6mm',slot:['0.6mm','1.6mm'],plated:true}}]});
const parts=[
<Part id={part('Shared','F')} at={[10,20]} rotation={90} footprint={footprint} connect={{P:net('GND')}}/>,
<Part id={part('Shared','B')} at={[10,20]} side="back" rotation={90} footprint={footprint} connect={{P:net('GND')}}/>,
<Part id={part('U')} footprint={footprint} connect={{P:net('GND')}}/>,
<Part id={part('Legacy')} footprint="unresolved" connect={{P:net('GND')}}/>
];
export default <Board outline={rect(0,0,60,40)} layers={testLayers} metadata={{title:${JSON.stringify(title)}}}>{${reverse ? "parts.toReversed()" : "parts"}}</Board>;
`;

test("inspection derives unique definitions from placed and unplaced parts, preserves identity and uses local geometry", async () => {
	const directory = await mkdtemp(join(cwd, ".inspection-test-"));
	const entry = join(directory, "board.tsx");
	try {
		await Bun.write(entry, source());
		const first = await buildBoardInspection(entry);
		expect(first.footprints.map((item) => item.key)).toEqual([
			unsafeKey,
			"unresolved",
		]);
		const physical = first.footprints[0]!;
		expect(physical.parts.map((part) => part.id)).toEqual(["B", "F", "U"]);
		expect(
			physical.parts.filter((part) => part.reference === "Shared"),
		).toHaveLength(2);
		expect(physical.parts.find((part) => part.id === "U")?.at).toBeNull();
		expect(physical.physical).toEqual(
			first.result.ir.footprintDefinitions[unsafeKey]!.physical,
		);
		expect(physical.svg).toContain("translate(1 2)");
		expect(physical.svg).not.toContain("translate(8 21)");
		expect(physical.svg).toContain('width="0.6" height="1.6"');
		expect(physical.report).toBeNull();
		expect(first.result.boardManufacturingReport).toBeNull();
		expect(first.footprints[1]).toMatchObject({
			physical: null,
			svg: null,
			layers: [],
			report: null,
		});
		expect(
			first.diagnostics.some((diagnostic) => diagnostic.entity === "Legacy"),
		).toBe(true);
		expect(physical.files.svg).toMatch(/^footprints\/[a-f0-9]{64}\.svg$/);
		await Bun.write(entry, source(true));
		const reordered = await buildBoardInspection(entry);
		expect(reordered.footprints).toEqual(first.footprints);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 15000);

test("inspection converts exact half-nm edges, transforms and strokes to browser-sized mm without changing canonical geometry", async () => {
	const physical = await compileFootprint(
		{
			schemaVersion: 1,
			key: "exact",
			features: [
				{
					id: "P",
					purpose: "pad",
					at: ["-1nm", "2nm"],
					rotation: 90,
					shape: { kind: "rect", size: ["3nm", "5nm"] },
					layers: ["front-copper"],
				},
				{
					id: "outline",
					purpose: "courtyard",
					at: ["0nm", "0nm"],
					shape: { kind: "rect", size: ["9nm", "11nm"] },
					layers: ["front-courtyard"],
					stroke: "1nm",
				},
			],
		},
		{ cwd },
	);
	const original = JSON.stringify(physical);
	const canonical = await footprintSvg(physical, { cwd });
	const output = inspectionFootprintSvg(canonical);
	const document = new DOMParser().parseFromString(output.svg, "image/svg+xml");
	const svg = document.documentElement;
	const pad = svg.querySelector('[data-feature-id="P"]')!;
	expect(svg.getAttribute("data-units")).toBe("mm");
	expect(pad.getAttribute("x")).toBe("-0.0000015");
	expect(pad.getAttribute("y")).toBe("-0.0000025");
	expect(pad.getAttribute("width")).toBe("0.000003");
	expect(pad.getAttribute("transform")).toBe(
		"translate(-0.000001 0.000002) rotate(90)",
	);
	expect(
		svg
			.querySelector('[data-feature-id="outline"]')!
			.getAttribute("stroke-width"),
	).toBe("0.000001");
	expect(
		svg
			.querySelector('g[data-layer-id="front-courtyard"]')!
			.getAttribute("data-layer"),
	).toBe("front-courtyard");
	expect(canonical).toContain('data-units="half-nm"');
	expect(JSON.stringify(physical)).toBe(original);
	expect(() => inspectionFootprintSvg('<svg data-units="mm"/>')).toThrow(
		"canonical",
	);
});

test("all-side footprint copper retains its meaning in both side presets and shared presentation", () => {
	const copper = footprintSceneLayer("all-copper");
	const mask = footprintSceneLayer("all-mask");
	const drill = footprintSceneLayer("drill");
	for (const side of ["front", "back"] as const) {
		expect(presetVisibility([copper, mask, drill], side)).toEqual({
			[copper.key]: true,
			[mask.key]: false,
			[drill.key]: true,
		});
	}
	expect(copper.color).toBe("#dfae77");
	expect(copper.side).toBeNull();
});

test("inspection export is small static HTML with escaped labels and linked canonical artifacts; failed rebuilds preserve output", async () => {
	const directory = await mkdtemp(join(cwd, ".inspection-test-"));
	const entry = join(directory, "board.tsx");
	const output = join(directory, "out");
	try {
		await Bun.write(entry, source());
		const command = Bun.spawn(
			[process.execPath, "run", "board:inspect", entry, "--out", output],
			{ cwd, stdout: "pipe", stderr: "pipe" },
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(command.stdout).text(),
			new Response(command.stderr).text(),
			command.exited,
		]);
		expect({ code, stderr: code === 0 ? "" : stderr }).toEqual({
			code: 0,
			stderr: "",
		});
		const index = join(output, "index.html");
		expect(stdout).toContain(index);
		const html = await Bun.file(index).text();
		const document = new DOMParser().parseFromString(html, "text/html");
		expect(document.querySelector("h1")!.textContent).toBe(
			`${title} / Footprints`,
		);
		expect(
			document
				.querySelector("[data-footprint-key]")!
				.getAttribute("data-footprint-key"),
		).toBe(unsafeKey);
		expect(
			document.querySelectorAll('script, svg, link[rel="stylesheet"]').length,
		).toBe(0);
		expect(html).not.toContain("data:font");
		expect(html).not.toContain("preview-data");
		expect(Buffer.byteLength(html)).toBeLessThan(12000);
		const manifest = await Bun.file(join(output, "manifest.json")).json();
		const board = await Bun.file(join(output, manifest.files.board)).json();
		expect(board.board.metadata.title).toBe(title);
		expect(
			await Bun.file(join(output, manifest.files.manufacturing)).json(),
		).toBeNull();
		const physical = manifest.footprints.find(
			(item: { key: string }) => item.key === unsafeKey,
		);
		expect(physical.parts).toEqual(["B", "F", "U"]);
		expect(document.querySelector("img")!.getAttribute("src")).toBe(
			physical.files.svg,
		);
		expect(document.querySelectorAll("article").length).toBe(
			manifest.footprints.length,
		);
		for (const anchor of document.querySelectorAll("a")) {
			expect(
				await Bun.file(join(output, anchor.getAttribute("href")!)).exists(),
			).toBe(true);
		}
		for (const item of manifest.footprints) {
			for (const file of Object.values(item.files)) {
				if (file)
					expect(await Bun.file(join(output, file as string)).exists()).toBe(
						true,
					);
			}
			expect(
				await Bun.file(join(output, item.files.definition)).json(),
			).toEqual(board.footprintDefinitions[item.key]);
			expect(
				await Bun.file(join(output, item.files.manufacturing)).json(),
			).toBeNull();
		}
		expect(
			await Bun.file(join(output, physical.files.geometry)).json(),
		).toEqual(board.footprintDefinitions[unsafeKey].physical);
		const svg = await Bun.file(join(output, physical.files.svg)).text();
		await Bun.write(entry, "export default 123;");
		await expect(exportBoardInspection(entry, output)).rejects.toThrow(
			"default-export",
		);
		expect(await Bun.file(index).text()).toBe(html);
		expect(await Bun.file(join(output, physical.files.svg)).text()).toBe(svg);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 20000);

test("inspection keeps the board-selected manufacturing reports and thresholds", async () => {
	const inspection = await buildBoardInspection(
		join(cwd, "examples/basic.tsx"),
	);
	expect(inspection.footprints).toHaveLength(3);
	expect(
		inspection.result.boardManufacturingReport?.conformsToCheckedRules,
	).toBe(true);
	for (const item of inspection.footprints) {
		expect(item.report).toEqual(
			inspection.result.manufacturingReports[item.key]!,
		);
		expect(item.report?.profile).toEqual(
			inspection.result.boardManufacturingReport!.profile,
		);
	}
});
