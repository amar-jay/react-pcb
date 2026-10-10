export type BoardSide = "front" | "back";
export type CopperUsage = "signal" | "plane" | "mixed";

type Layer<Kind extends string> = Readonly<{ kind: Kind; id: string }>;

export type CopperLayer = Layer<"copper"> &
	Readonly<{
		thickness: number;
		usage: CopperUsage;
	}>;

export type DielectricLayer = Layer<"dielectric"> &
	Readonly<{
		material: string;
		thickness: number;
		epsilonR: number;
		lossTangent?: number;
	}>;

export type SolderMaskLayer = Layer<"solder-mask"> &
	Readonly<{
		side: BoardSide;
		expansion?: number;
	}>;

export type PasteLayer = Layer<"paste"> & Readonly<{ side: BoardSide }>;
export type SilkscreenLayer = Layer<"silkscreen"> &
	Readonly<{
		side: BoardSide;
		color?: string;
	}>;
export type MechanicalLayer = Layer<"mechanical"> &
	Readonly<{
		purpose: "assembly" | "courtyard" | "fabrication" | "other";
		side?: BoardSide;
	}>;

export type StackupLayer = CopperLayer | DielectricLayer;
export type TechnicalLayer =
	| SolderMaskLayer
	| PasteLayer
	| SilkscreenLayer
	| MechanicalLayer;
export type Stackup = Readonly<{
	kind: "stackup";
	entries: readonly StackupLayer[];
}>;
export type LayerSet = Readonly<{
	kind: "layer-set";
	stackup: Stackup;
	technical: readonly TechnicalLayer[];
}>;

type CopperLayerOptions = Readonly<{
	id?: string;
	thickness: number;
	usage?: CopperUsage;
}>;
type DielectricLayerOptions = Readonly<{
	id?: string;
	material: string;
	thickness: number;
	epsilonR: number;
	lossTangent?: number;
}>;
export type CopperLayerInput = Omit<CopperLayer, "id"> &
	Readonly<{ id?: string }>;
export type DielectricLayerInput = Omit<DielectricLayer, "id"> &
	Readonly<{ id?: string }>;
export type StackupLayerInput = CopperLayerInput | DielectricLayerInput;

export function copperLayer(
	options: CopperLayerOptions & Readonly<{ id: string }>,
): CopperLayer;
export function copperLayer(options: CopperLayerOptions): CopperLayerInput;
export function copperLayer(options: CopperLayerOptions): CopperLayerInput {
	if (options.id !== undefined) assertName(options.id, "layer ID", true);
	assertPositive(options.thickness, "copper thickness");
	return {
		kind: "copper",
		...(options.id === undefined ? {} : { id: options.id }),
		thickness: options.thickness,
		usage: options.usage ?? "signal",
	};
}

export function dielectricLayer(
	options: DielectricLayerOptions & Readonly<{ id: string }>,
): DielectricLayer;
export function dielectricLayer(
	options: DielectricLayerOptions,
): DielectricLayerInput;
export function dielectricLayer(
	options: DielectricLayerOptions,
): DielectricLayerInput {
	if (options.id !== undefined) assertName(options.id, "layer ID", true);
	assertPositive(options.thickness, "dielectric thickness");
	assertPositive(options.epsilonR, "dielectric epsilonR");
	if (options.lossTangent !== undefined) {
		assertNonNegative(options.lossTangent, "dielectric lossTangent");
	}
	const { id, ...rest } = options;
	return { kind: "dielectric", ...rest, ...(id === undefined ? {} : { id }) };
}

export type SolderMaskLayerInput = Omit<SolderMaskLayer, "id"> &
	Readonly<{ id?: string }>;
export type PasteLayerInput = Omit<PasteLayer, "id"> &
	Readonly<{ id?: string }>;
export type SilkscreenLayerInput = Omit<SilkscreenLayer, "id"> &
	Readonly<{ id?: string }>;
export type MechanicalLayerInput = Omit<MechanicalLayer, "id"> &
	Readonly<{ id?: string }>;
export type TechnicalLayerInput =
	| SolderMaskLayerInput
	| PasteLayerInput
	| SilkscreenLayerInput
	| MechanicalLayerInput;

export function solderMaskLayer(
	options: Readonly<{ id: string; side: BoardSide; expansion?: number }>,
): SolderMaskLayer;
export function solderMaskLayer(
	options: Readonly<{ id?: string; side: BoardSide; expansion?: number }>,
): SolderMaskLayerInput;
export function solderMaskLayer(
	options: Readonly<{ id?: string; side: BoardSide; expansion?: number }>,
): SolderMaskLayerInput {
	if (options.expansion !== undefined)
		assertNonNegative(options.expansion, "solder mask expansion");
	if (options.id !== undefined) assertName(options.id, "layer ID", true);
	return {
		kind: "solder-mask",
		side: options.side,
		expansion: options.expansion,
		...(options.id === undefined ? {} : { id: options.id }),
	};
}

export function pasteLayer(
	options: Readonly<{ id: string; side: BoardSide }>,
): PasteLayer;
export function pasteLayer(
	options: Readonly<{ id?: string; side: BoardSide }>,
): PasteLayerInput;
export function pasteLayer(
	options: Readonly<{ id?: string; side: BoardSide }>,
): PasteLayerInput {
	if (options.id !== undefined) assertName(options.id, "layer ID", true);
	return {
		kind: "paste",
		side: options.side,
		...(options.id === undefined ? {} : { id: options.id }),
	};
}

export function silkscreenLayer(
	options: Readonly<{ id: string; side: BoardSide; color?: string }>,
): SilkscreenLayer;
export function silkscreenLayer(
	options: Readonly<{ id?: string; side: BoardSide; color?: string }>,
): SilkscreenLayerInput;
export function silkscreenLayer(
	options: Readonly<{ id?: string; side: BoardSide; color?: string }>,
): SilkscreenLayerInput {
	if (options.id !== undefined) assertName(options.id, "layer ID", true);
	return {
		kind: "silkscreen",
		side: options.side,
		color: options.color,
		...(options.id === undefined ? {} : { id: options.id }),
	};
}

export function mechanicalLayer(
	options: Readonly<{
		id: string;
		purpose: MechanicalLayer["purpose"];
		side?: BoardSide;
	}>,
): MechanicalLayer;
export function mechanicalLayer(
	options: Readonly<{
		id?: string;
		purpose: MechanicalLayer["purpose"];
		side?: BoardSide;
	}>,
): MechanicalLayerInput;
export function mechanicalLayer(
	options: Readonly<{
		id?: string;
		purpose: MechanicalLayer["purpose"];
		side?: BoardSide;
	}>,
): MechanicalLayerInput {
	if (options.id !== undefined) assertName(options.id, "layer ID", true);
	return {
		kind: "mechanical",
		purpose: options.purpose,
		side: options.side,
		...(options.id === undefined ? {} : { id: options.id }),
	};
}

function inferredTechnicalId(layer: TechnicalLayerInput): string {
	if (layer.kind === "mechanical") {
		return layer.side === undefined
			? `mechanical/${layer.purpose}`
			: `mechanical/${layer.purpose}/${layer.side}`;
	}
	return `${layer.kind}/${layer.side}`;
}

export function defineStackup(entries: readonly StackupLayerInput[]): Stackup {
	if (
		entries.length === 0 ||
		entries[0]?.kind !== "copper" ||
		entries.at(-1)?.kind !== "copper"
	) {
		throw new Error("a stackup must start and end with copper");
	}
	entries.forEach((entry, index) => {
		if (index > 0 && entry.kind === entries[index - 1]?.kind)
			throw new Error(
				"stackup entries must alternate between copper and dielectric",
			);
	});
	const counts = { copper: 0, dielectric: 0 };
	const identified = entries.map((entry) => {
		const position = ++counts[entry.kind];
		const id = entry.id ?? `${entry.kind}/${position}`;
		assertName(id, "layer ID", true);
		return { entry, id };
	});
	if (counts.copper > 32)
		throw new Error("a stackup may contain at most 32 copper layers");
	const ids = new Set<string>();
	for (const { id } of identified) {
		if (ids.has(id)) throw new Error(`duplicate layer ID ${id}`);
		ids.add(id);
	}
	const layers = identified.map(({ entry, id }): StackupLayer => {
		const layer = entry as { id?: string };
		if (layer.id === undefined) layer.id = id;
		return Object.freeze(entry) as StackupLayer;
	});
	return Object.freeze({ kind: "stackup", entries: Object.freeze(layers) });
}

export function defineLayerSet(
	options: Readonly<{
		stackup: Stackup;
		technical?: readonly TechnicalLayerInput[];
	}>,
): LayerSet {
	const technical = options.technical ?? [];
	const ids = new Set(options.stackup.entries.map((layer) => layer.id));
	const identified = technical.map((layer) => {
		const inferred = layer.id === undefined;
		const id = layer.id ?? inferredTechnicalId(layer);
		assertName(id, "layer ID", true);
		return { layer, id, inferred };
	});
	for (const item of identified) {
		if (ids.has(item.id)) {
			throw new Error(
				item.inferred
					? `duplicate layer ID ${item.id}: inferred from its ${item.layer.kind} properties. Give this layer an explicit ID.`
					: `duplicate layer ID ${item.id}`,
			);
		}
		ids.add(item.id);
	}
	const layers = identified.map(({ layer, id }): TechnicalLayer => {
		const target = layer as { id?: string };
		if (target.id === undefined) target.id = id;
		return Object.freeze(layer) as TechnicalLayer;
	});
	return Object.freeze({
		kind: "layer-set",
		stackup: options.stackup,
		technical: Object.freeze(layers),
	});
}

import {
	assertName,
	assertNonNegative,
	assertPositive,
} from "../validation/index.ts";
