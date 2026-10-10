import React from "react";
import {
	Part,
	renderFootprintDeclarations,
	type PartProps,
} from "@react-pcb/core";
import { PhaseTerminalFootprint } from "../footprints/terminals.tsx";
import type { Net } from "./shared.ts";

const footprint = await renderFootprintDeclarations(
	React.createElement(PhaseTerminalFootprint),
);
// A board feature has no manufacturer, orderable MPN, or invented datasheet.
export function PhasePad(
	props: Pick<PartProps, "id" | "at" | "side" | "rotation"> & {
		connect: { P: Net };
	},
) {
	return React.createElement(Part, {
		...props,
		value: "Motor wire terminal",
		footprint,
		pinMap: { P: "P" },
	});
}
