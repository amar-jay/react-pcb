import { expect, test } from "bun:test";
import type { BoardIr, IrPart } from "@react-pcb/core";
import { ratsnest } from "../frontend/lib/ratsnest.ts";

function part(overrides: Partial<IrPart> & Pick<IrPart, "id">): IrPart {
	return {
		reference: overrides.id,
		component: "",
		footprint: "FP",
		pinMap: {},
		padLayers: {},
		physicalFeatures: {},
		at: [0, 0],
		side: "front",
		rotation: 0,
		connections: {},
		...overrides,
	};
}

function board(
	parts: IrPart[],
	footprintPads: readonly [string, number, number][] = [],
): BoardIr {
	return {
		units: "mm",
		parts,
		footprintDefinitions: {
			FP: {
				key: "FP",
				resolved: true,
				pads: footprintPads.map(([id, x, y]) => ({
					id,
					at: [x, y],
					shape: "circle",
					size: [1, 1],
					rotation: 0,
					layers: [],
					drill: null,
				})),
				physical: null,
			},
		},
	} as unknown as BoardIr;
}

test("ratsnest spans each net by the shortest airwires", () => {
	const placed = (id: string, x: number, y: number, net: string) =>
		part({
			id,
			connections: { P: net },
			pinMap: { P: ["P"] },
			physicalFeatures: {
				P: {
					layers: ["copper/1"],
					geometry: {
						id: "P",
						purpose: "pad",
						at: [x * 1_000_000, y * 1_000_000],
						shape: { kind: "circle", diameter: 1 },
						rotation: 0,
						layers: ["front-copper"],
						drill: null,
						stroke: null,
					},
				},
			},
		});
	const wires = ratsnest(
		board([
			placed("a", 1, 2, "SIG"),
			placed("b", 5, 2, "SIG"),
			placed("c", 1, 9, "SIG"),
			placed("g", 0, 0, "GND"),
		]),
	);
	expect(wires.filter((wire) => wire.net === "GND")).toEqual([]);
	expect(
		wires
			.filter((wire) => wire.net === "SIG")
			.map((wire) => [wire.x1, wire.y1, wire.x2, wire.y2].join(",")),
	).toEqual(["1,2,5,2", "1,2,1,9"]);
});

test("legacy pad positions follow placement rotation and back-side mirroring", () => {
	const wires = ratsnest(
		board(
			[
				part({
					id: "A",
					at: [10, 5],
					rotation: 90,
					pinMap: { P: ["P"] },
					connections: { P: "N" },
				}),
				part({
					id: "B",
					at: [0, 0],
					side: "back",
					pinMap: { P: ["P"] },
					connections: { P: "N" },
				}),
			],
			[["P", 1, 0]],
		),
	);
	expect(wires).toEqual([{ net: "N", x1: 10, y1: 6, x2: -1, y2: 0 }]);
});
