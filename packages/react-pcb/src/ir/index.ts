import type { ManufacturingProfile } from "../footprints/manufacturing.ts";
import type {
	FootprintRole,
	PhysicalFootprint,
	PlacedPhysicalFeature,
} from "../footprints/physical.ts";
import type { BoardSide, CopperUsage } from "../layers/index.ts";
import type { DatasheetSource, ElectricalType } from "../parts/index.tsx";

export const PCB_IR_SCHEMA_VERSION = 2 as const;

export type IrStackupLayer =
	| Readonly<{
			kind: "copper";
			id: string;
			thickness: number;
			usage: CopperUsage;
	  }>
	| Readonly<{
			kind: "dielectric";
			id: string;
			material: string;
			thickness: number;
			epsilonR: number;
			lossTangent: number | null;
	  }>;
export type IrTechnicalLayer =
	| Readonly<{
			kind: "solder-mask";
			id: string;
			side: BoardSide;
			expansion: number | null;
	  }>
	| Readonly<{ kind: "paste"; id: string; side: BoardSide }>
	| Readonly<{
			kind: "silkscreen";
			id: string;
			side: BoardSide;
			color: string | null;
	  }>
	| Readonly<{
			kind: "mechanical";
			id: string;
			purpose: "assembly" | "courtyard" | "fabrication" | "other";
			side: BoardSide | null;
	  }>;
export type IrLayerSet = Readonly<{
	kind: "layer-set";
	stackup: Readonly<{ kind: "stackup"; entries: readonly IrStackupLayer[] }>;
	technical: readonly IrTechnicalLayer[];
}>;

export type IrNet = Readonly<{ id: string; name: string }>;
export type IrPinDefinition = Readonly<{
	electricalType: ElectricalType;
	functions?: readonly string[];
	required?: boolean;
}>;
export type IrComponentDefinition = Readonly<{
	manufacturer?: string;
	mpn?: string;
	value?: string;
	package?: string;
	datasheet?: DatasheetSource;
	pinoutCoverage?: "complete" | "partial";
	pins?: Readonly<Record<string, IrPinDefinition>>;
}>;
export type IrFootprintPad = Readonly<{
	id: string;
	at: readonly [number, number];
	shape: "rect" | "circle" | "oval";
	size: readonly [number, number];
	rotation: number;
	layers: readonly (
		| string
		| Readonly<{ kind: "all-copper" }>
		| Readonly<{ role: FootprintRole }>
	)[];
	drill: Readonly<{
		diameter: number;
		slot?: readonly [number, number];
		plated: boolean;
	}> | null;
}>;
export type IrFootprintDefinition = Readonly<{
	key: string;
	resolved: boolean;
	pads: readonly IrFootprintPad[];
	physical: PhysicalFootprint | null;
}>;
export type IrPart = Readonly<{
	id: string;
	reference: string;
	component: string;
	footprint: string;
	pinMap: Readonly<Record<string, readonly string[]>>;
	padLayers: Readonly<Record<string, readonly string[]>>;
	physicalFeatures: Readonly<Record<string, PlacedPhysicalFeature>>;
	at: readonly [number, number] | null;
	side: BoardSide;
	rotation: number;
	connections: Readonly<Record<string, string>>;
}>;
export type IrPinRef = Readonly<{ part: string; name: string }>;
export type IrRegion = Readonly<{
	id: string;
	geometry: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;
export type IrRouteConstraint = Readonly<{
	id: string;
	net: string;
	from: IrPinRef;
	to: IrPinRef;
	width: number | null;
	through: readonly string[];
}>;
export type IrDifferentialPair = Readonly<{
	id: string;
	positive: string;
	negative: string;
	from: readonly [IrPinRef, IrPinRef];
	to: readonly [IrPinRef, IrPinRef];
	width: number | null;
	gap: number | null;
	targetImpedance: number | null;
	through: readonly string[];
}>;
export type IrZone = Readonly<{
	id: string;
	net: string;
	layers: readonly string[];
	boundary: string;
	clearance: number | null;
}>;
export type IrKeepout = Readonly<{
	id: string;
	region: string;
	disallow: readonly string[];
	except: readonly string[];
}>;

export type BoardIr = Readonly<{
	schemaVersion: typeof PCB_IR_SCHEMA_VERSION;
	revision: number;
	units: "mm" | "mil" | "in";
	board: Readonly<{
		id: string;
		outline: string;
		layers: IrLayerSet;
		metadata: Readonly<Record<string, unknown>>;
		manufacturingProfile?: ManufacturingProfile;
	}>;
	componentDefinitions: Readonly<Record<string, IrComponentDefinition>>;
	footprintDefinitions: Readonly<Record<string, IrFootprintDefinition>>;
	parts: readonly IrPart[];
	nets: readonly IrNet[];
	routeConstraints: readonly IrRouteConstraint[];
	differentialPairs: readonly IrDifferentialPair[];
	zones: readonly IrZone[];
	keepouts: readonly IrKeepout[];
	regions: Readonly<Record<string, IrRegion>>;
}>;
