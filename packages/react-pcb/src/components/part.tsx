import React from "react";
import type { FootprintDefinition, PinMap } from "../footprints/index.ts";
import type { FootprintDeclarations } from "../footprints/jsx.tsx";
import type {
	PhysicalFootprint,
	PhysicalFootprintInput,
} from "../footprints/physical.ts";
import type { BoardSide } from "../layers/index.ts";
import type { Net, Part as PartHandle } from "../model/index.ts";

export type PartProps = {
	id: PartHandle;
	definition?: unknown;
	mpn?: string;
	value?: string;
	footprint:
		| FootprintDefinition
		| PhysicalFootprint
		| PhysicalFootprintInput
		| FootprintDeclarations
		| string;
	pinMap?: PinMap;
	at?: readonly [number, number];
	side?: BoardSide;
	rotation?: number;
	connect: Readonly<Record<string, Net>>;
};

export function Part(props: PartProps) {
	return React.createElement("pcb-part", props);
}
