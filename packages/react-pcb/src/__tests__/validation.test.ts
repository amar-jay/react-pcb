import { expect, test } from "bun:test";

import {
	copperLayer,
	defineLayerSet,
	defineStackup,
	dielectricLayer,
	mechanicalLayer,
	pasteLayer,
	silkscreenLayer,
	solderMaskLayer,
} from "../layers/index.ts";
import { net, pad, part, point, rect } from "../model/index.ts";

test("rejects invalid geometry before rendering", () => {
	expect(() => point(Number.NaN, 0)).toThrow("point x must be finite");
	expect(() => rect(0, 0, 0, 10)).toThrow("rectangle width must be positive");
	expect(() => rect(0, 0, 10, -1)).toThrow("rectangle height must be positive");
});

test("rejects empty connectivity identifiers", () => {
	expect(() => net("   ")).toThrow("net name must be a non-empty name");
	expect(() => part("")).toThrow("part reference must be a non-empty name");
	expect(() => pad(part("U1"), "")).toThrow(
		"pin name must be a non-empty name",
	);
});

test("rejects non-finite and negative layer properties", () => {
	expect(() => copperLayer({ id: "copper/1", thickness: Number.NaN })).toThrow(
		"copper thickness must be positive",
	);
	expect(() =>
		dielectricLayer({
			id: "dielectric/1",
			material: "FR-4",
			thickness: 1,
			epsilonR: 4.2,
			lossTangent: Number.NaN,
		}),
	).toThrow("dielectric lossTangent must not be negative");
	expect(() =>
		solderMaskLayer({
			id: "solder-mask/front",
			side: "front",
			expansion: -0.1,
		}),
	).toThrow("solder mask expansion must not be negative");
});

test("infers technical layer IDs from side and purpose", () => {
	const stackup = defineStackup([
		copperLayer({ id: "copper/1", thickness: 0.035 }),
	]);
	const mask = solderMaskLayer({ side: "front", expansion: 0.05 });
	const paste = pasteLayer({ side: "back" });
	const silk = silkscreenLayer({ side: "front", color: "white" });
	const assembly = mechanicalLayer({ purpose: "assembly", side: "front" });
	const fabrication = mechanicalLayer({ purpose: "fabrication" });
	const layers = defineLayerSet({
		stackup,
		technical: [mask, paste, silk, assembly, fabrication],
	});
	expect(layers.technical.map((layer) => layer.id)).toEqual([
		"solder-mask/front",
		"paste/back",
		"silkscreen/front",
		"mechanical/assembly/front",
		"mechanical/fabrication",
	]);
	expect(mask.id).toBe("solder-mask/front");
	expect(() =>
		defineLayerSet({
			stackup,
			technical: [
				mechanicalLayer({ purpose: "assembly" }),
				mechanicalLayer({ purpose: "assembly", side: "front" }),
			],
		}),
	).not.toThrow();
	expect(() =>
		defineLayerSet({
			stackup,
			technical: [
				solderMaskLayer({ side: "front" }),
				solderMaskLayer({ side: "front" }),
			],
		}),
	).toThrow(
		"duplicate layer ID solder-mask/front: inferred from its solder-mask properties",
	);
});

test("rejects duplicate layer IDs even across different kinds", () => {
	const stackup = defineStackup([
		copperLayer({ id: "copper/1", thickness: 0.035 }),
	]);
	expect(() =>
		defineLayerSet({
			stackup,
			technical: [pasteLayer({ id: "copper/1", side: "front" })],
		}),
	).toThrow("duplicate layer ID");
	expect(() => copperLayer({ id: " ", thickness: 0.035 })).toThrow("layer ID");
});
