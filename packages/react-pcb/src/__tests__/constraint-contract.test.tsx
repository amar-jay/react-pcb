import { expect, test } from "bun:test";
import {
	Board,
	type BoardIr,
	boardSvg,
	compile,
	copperLayer,
	defineLayerSet,
	defineStackup,
	dielectricLayer,
	Keepout,
	type KeepoutProps,
	net,
	PCB_IR_SCHEMA_VERSION,
	upgradeBoardIr,
} from "../index.ts";
import { rect } from "../model/index.ts";
import { assertDefined, testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };

function ScopedBoard({ props = {} }: { props?: Partial<KeepoutProps> }) {
	return (
		<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
			<Keepout
				region={rect(1, 1, 2, 2)}
				disallow={["components", "copper"]}
				{...props}
			/>
		</Board>
	);
}

test("keepout scope expands defaults to explicit sides and board copper IDs", async () => {
	const { ir } = await compile(<ScopedBoard />, options);
	expect(ir.schemaVersion).toBe(PCB_IR_SCHEMA_VERSION);
	expect(ir.keepouts).toMatchObject([
		{
			componentSides: ["front", "back"],
			copperLayers: ["copper/1", "copper/2"],
		},
	]);
	const front = copperLayer({ thickness: 0.035 });
	const back = copperLayer({ thickness: 0.035 });
	const layers = defineLayerSet({
		stackup: defineStackup([
			front,
			dielectricLayer({ material: "FR-4", thickness: 1, epsilonR: 4.2 }),
			back,
		]),
		technical: [],
	});
	const selected = await compile(
		<Board outline={rect(0, 0, 10, 10)} layers={layers}>
			<Keepout
				region={rect(1, 1, 2, 2)}
				disallow={["components", "tracks"]}
				componentSides={["back"]}
				copperLayers={[back]}
				except={[net("Signal", "nets/signal")]}
			/>
		</Board>,
		options,
	);
	expect(selected.ir.keepouts).toMatchObject([
		{
			componentSides: ["back"],
			copperLayers: ["copper/2"],
			except: ["nets/signal"],
		},
	]);
	expect(JSON.stringify(selected.ir.keepouts)).not.toContain("thickness");
});

test("inactive keepout scopes serialize as empty and explicit inactive selections reject", async () => {
	const components = await compile(
		<ScopedBoard props={{ disallow: ["components"] }} />,
		options,
	);
	expect(components.ir.keepouts[0]?.copperLayers).toEqual([]);
	const electrical = await compile(
		<ScopedBoard props={{ disallow: ["tracks", "vias"] }} />,
		options,
	);
	expect(electrical.ir.keepouts[0]?.componentSides).toEqual([]);
	for (const props of [
		{ componentSides: [] },
		{ componentSides: ["front", "front"] },
		{ copperLayers: [] },
		{ copperLayers: [copperLayer({ id: "unknown", thickness: 0.035 })] },
		{
			disallow: ["components"],
			copperLayers: [copperLayer({ id: "copper/1", thickness: 0.035 })],
		},
		{ disallow: ["tracks"], componentSides: ["front"] },
		{ disallow: ["components"], except: [net("GND")] },
	] as Partial<KeepoutProps>[]) {
		await expect(
			compile(<ScopedBoard props={props} />, options),
		).rejects.toMatchObject({ diagnostic: { code: "PCBIR035" } });
	}
});

test("schema-2 upgrades are explicit, preserve identities and input data, and emit usable schema 3", async () => {
	const { ir } = await compile(<ScopedBoard />, options);
	const legacy = JSON.parse(JSON.stringify(ir));
	legacy.schemaVersion = 2;
	for (const keepout of legacy.keepouts) {
		delete keepout.componentSides;
		delete keepout.copperLayers;
	}
	const original = JSON.stringify(legacy);
	await expect(boardSvg(legacy as BoardIr, options)).rejects.toMatchObject({
		diagnostic: { code: "PCBIR036" },
	});
	const upgraded = await upgradeBoardIr(legacy, options);
	expect(upgraded).toEqual(ir);
	expect(JSON.stringify(legacy)).toBe(original);
	expect((await boardSvg(upgraded, options)).svg).toContain("data-region-id");
	expect(await upgradeBoardIr(upgraded, options)).toEqual(upgraded);
	for (const schemaVersion of [1, 4, 99]) {
		await expect(
			upgradeBoardIr({ ...legacy, schemaVersion }, options),
		).rejects.toMatchObject({ diagnostic: { code: "PCBIR036" } });
	}
});

test("serialized current IR rejects malformed scope before projection", async () => {
	const { ir } = await compile(<ScopedBoard />, options);
	const forged = structuredClone(ir);
	const keepout = assertDefined(forged.keepouts[0]);
	(keepout as { copperLayers: readonly string[] }).copperLayers = [
		"solder-mask/front",
	];
	await expect(boardSvg(forged, options)).rejects.toMatchObject({
		diagnostic: { code: "PCBIR035" },
	});
	const unknown = JSON.parse(JSON.stringify(ir));
	unknown.keepouts[0].componentSide = "front";
	await expect(boardSvg(unknown as BoardIr, options)).rejects.toThrow(
		"unknown field",
	);
});
