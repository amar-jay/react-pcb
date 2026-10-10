import React from "react";

import type { KeepoutRestriction } from "../ir/index.ts";
import type { BoardSide, CopperLayerInput } from "../layers/index.ts";
import type { Net, Region } from "../model/index.ts";

export type { KeepoutRestriction } from "../ir/index.ts";

export type ZoneProps = {
	net: Net;
	layers: readonly CopperLayerInput[];
	boundary: Region | "board";
	clearance?: number;
};
/** Intended fill boundary; no copper is synthesized by this declaration. */
export function Zone(props: ZoneProps) {
	return React.createElement("pcb-zone", props);
}

export type KeepoutProps = {
	region: Region;
	disallow: readonly KeepoutRestriction[];
	/** Component placement reservations; defaults to both sides. Requires components. */
	componentSides?: readonly BoardSide[];
	/** Electrical restrictions; defaults to all board copper layers. */
	copperLayers?: readonly CopperLayerInput[];
	/** Exempt known-net electrical objects, never whole components. */
	except?: readonly Net[];
};
/** Restrictions and scope are retained as intent; physical enforcement is pending. */
export function Keepout(props: KeepoutProps) {
	return React.createElement("pcb-keepout", props);
}
