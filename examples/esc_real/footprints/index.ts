import {
	definePhysicalFootprint,
	type FeatureInput,
	type PhysicalFootprintInput,
	type PhysicalLength,
} from "@react-pcb/core";
import type { Device } from "../model.ts";
import references from "./reference-patterns.json";

// Dimensions are mm, component-side view, +x right, +y down. Origin is the
// package center except the documented pin-1 origins of THT reference patterns.
// See SOURCES.md for manufacturer drawings and authored process choices.
export type Binding = Record<string, string | readonly string[]>;
export type Pattern = { footprint: PhysicalFootprintInput; pinMap: Binding };
const mm = (n: number): PhysicalLength => `${Number(n.toFixed(6))}mm`;
const rect = (w: number, h: number) => ({
	kind: "rect" as const,
	size: [mm(w), mm(h)] as const,
});
function box(
	id: string,
	purpose: "fabrication" | "courtyard",
	x: number,
	y: number,
	w: number,
	h: number,
	back = false,
): FeatureInput {
	return {
		id,
		purpose,
		at: [mm(x), mm(y)],
		shape: rect(w, h),
		layers: [
			back
				? "back-courtyard"
				: purpose === "courtyard"
					? "front-courtyard"
					: "front-fabrication",
		],
		stroke: "0.05mm",
	};
}
function smd(
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
): FeatureInput[] {
	return [
		{
			id,
			purpose: "pad",
			at: [mm(x), mm(y)],
			shape: rect(w, h),
			layers: ["front-copper"],
		},
		{
			id: `mask-${id}`,
			purpose: "mask-opening",
			at: [mm(x), mm(y)],
			shape: rect(w + 0.1, h + 0.1),
			layers: ["front-mask"],
		},
		{
			id: `paste-${id}`,
			purpose: "paste-opening",
			at: [mm(x), mm(y)],
			shape: rect(w - 0.05, h - 0.05),
			layers: ["front-paste"],
		},
	];
}
function pth(
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	drill: number,
): FeatureInput[] {
	const shape = (a: number, b: number) =>
		a === b
			? { kind: "circle" as const, diameter: mm(a) }
			: { kind: "oval" as const, size: [mm(a), mm(b)] as const };
	return [
		{
			id,
			purpose: "pad",
			at: [mm(x), mm(y)],
			shape: shape(w, h),
			layers: ["all-copper"],
			drill: { diameter: mm(drill), plated: true },
		},
		{
			id: `mask-${id}`,
			purpose: "mask-opening",
			at: [mm(x), mm(y)],
			shape: shape(w + 0.1, h + 0.1),
			layers: ["all-mask"],
		},
	];
}
function pattern(
	key: string,
	features: FeatureInput[],
): PhysicalFootprintInput {
	return definePhysicalFootprint({ key: `esc-real:physical:${key}`, features });
}
function pinOne(x: number, y: number): FeatureInput {
	return {
		id: "pin-1-marker",
		purpose: "silkscreen",
		at: [mm(x), mm(y)],
		shape: { kind: "circle", diameter: "0.4mm" },
		layers: ["front-silkscreen"],
	};
}
const qfn: FeatureInput[] = [];
for (let i = 0; i < 24; i++) {
	const side = Math.floor(i / 6),
		a = -1.25 + (i % 6) * 0.5;
	const [x, y] =
		side === 0
			? [-1.9, a]
			: side === 1
				? [a, 1.9]
				: side === 2
					? [1.9, -a]
					: [-a, -1.9];
	qfn.push(
		...smd(
			String(i + 1),
			x!,
			y!,
			side % 2 === 0 ? 0.6 : 0.25,
			side % 2 === 0 ? 0.25 : 0.6,
		),
	);
}
qfn.push(
	...smd("EP", 0, 0, 2.8, 2.8).filter((f) => f.purpose !== "paste-opening"),
);
// Four 1.15-square stencil apertures: 67.5% exposed-pad area, 0.2mm web.
for (const x of [-0.675, 0.675])
	for (const y of [-0.675, 0.675])
		qfn.push({
			id: `paste-EP-${x}-${y}`,
			purpose: "paste-opening",
			at: [mm(x), mm(y)],
			shape: rect(1.15, 1.15),
			layers: ["front-paste"],
		});
qfn.push(
	box("body", "fabrication", 0, 0, 4, 4),
	box("court", "courtyard", 0, 0, 5, 5),
	pinOne(-2.3, -1.65),
);
export const STDRIVE101 = pattern("STDRIVE101-DS13472-rev2", qfn);

const dct: FeatureInput[] = [];
const dda: FeatureInput[] = [];
for (let i = 0; i < 8; i++) {
	const left = i < 4,
		row = left ? i : 7 - i;
	dct.push(
		...smd(String(i + 1), left ? -1.9 : 1.9, -0.975 + row * 0.65, 1.1, 0.4),
	);
	dda.push(
		...smd(String(i + 1), left ? -2.7 : 2.7, -1.905 + row * 1.27, 1.55, 0.6),
	);
}
dct.push(
	box("body", "fabrication", 0, 0, 3, 3),
	box("court", "courtyard", 0, 0, 5.4, 3.7),
	pinOne(-2, -1.55),
);
export const DCT8 = pattern("TI-DCT0008A-4220784D", dct);
dda.push({
	id: "EP",
	purpose: "pad",
	at: ["0mm", "0mm"],
	shape: rect(2.95, 4.9),
	layers: ["front-copper"],
});
// TI explicitly specifies a solder-mask-defined EP. Do not expand this mask
// to make an NSMD-only manufacturing rule pass; see manufacturingProfile.
dda.push({
	id: "mask-EP",
	purpose: "mask-opening",
	at: ["0mm", "0mm"],
	shape: rect(2.71, 3.4),
	layers: ["front-mask"],
});
for (const x of [-0.67, 0.67])
	for (const y of [-0.85, 0.85])
		dda.push({
			id: `paste-EP-${x}-${y}`,
			purpose: "paste-opening",
			at: [mm(x), mm(y)],
			shape: rect(1.1, 1.45),
			layers: ["front-paste"],
		});
dda.push(
	box("body", "fabrication", 0, 0, 3.9, 4.9),
	box("court", "courtyard", 0, 0, 7.5, 5.7),
	pinOne(-3, -2.55),
);
export const DDA8 = pattern("TI-DDA0008B-4214849B", dda);

const to247: FeatureInput[] = [];
[0, 5.08, 7.62, 10.16].forEach((x, i) =>
	to247.push(...pth(String(i + 1), x, 0, 2.3, 4.5, 1.9)),
);
to247.push(
	box("body", "fabrication", 5.08, 0.325, 16.26, 5.31),
	box("court", "courtyard", 5.08, 0.325, 17.26, 6.31),
	box("court-back", "courtyard", 5.08, 0, 12.96, 5.1, true),
	pinOne(-2, -1.5),
);
export const TO247 = pattern("UF3C065040K4S-340AN-E-vertical", to247);

const coil: FeatureInput[] = [
	...smd("1", 0, -4.25, 5.5, 4),
	...smd("2", 0, 4.25, 5.5, 4),
	box("body", "fabrication", 0, 0, 12.3, 12.3),
	box("court", "courtyard", 0, 0, 13.3, 13.5),
	pinOne(-3.3, -4.25),
];
export const MSS1246T = pattern("Coilcraft-MSS1246T-doc540-2", coil);

const terminal: FeatureInput[] = [
	...pth("1", 0, 0, 2.6, 2.6, 1.3),
	...pth("2", 9.52, 0, 2.6, 2.6, 1.3),
	box("body", "fabrication", 4.76, 1.425, 19.04, 12.05),
	box("court", "courtyard", 4.76, 1.425, 20.04, 13.05),
	box("court-back", "courtyard", 4.76, 0, 13.12, 3.6, true),
	pinOne(-2, 0),
];
export const MKDS = pattern("Phoenix-1714971-MKDS5-2-9.5", terminal);

const swd: FeatureInput[] = [];
for (let i = 1; i <= 10; i++)
	if (i !== 7)
		swd.push(
			...smd(
				String(i),
				i % 2 ? -2.035 : 2.035,
				-2.54 + Math.floor((i - 1) / 2) * 1.27,
				2.79,
				0.74,
			),
		);
swd.push(
	box("body", "fabrication", 0, 0, 5.08, 6.35),
	box("court", "courtyard", 0, 0, 7.5, 7.35),
	pinOne(-3.6, -2.9),
);
export const FTSH007 = pattern("Samtec-FTSH-DV-revH-007-K", swd);

export const TESTPOINT = pattern("board-owned-testpoint-1.5", [
	{
		id: "1",
		purpose: "pad",
		at: ["0mm", "0mm"],
		shape: { kind: "circle", diameter: "1.5mm" },
		layers: ["front-copper"],
	},
	{
		id: "mask-1",
		purpose: "mask-opening",
		at: ["0mm", "0mm"],
		shape: { kind: "circle", diameter: "1.6mm" },
		layers: ["front-mask"],
	},
	box("court", "courtyard", 0, 0, 2, 2),
]);
export const MOUNT = pattern("board-owned-M3-NPTH", [
	{
		id: "hole",
		purpose: "non-plated-hole",
		at: ["0mm", "0mm"],
		shape: { kind: "circle", diameter: "3.2mm" },
		layers: [],
		drill: { diameter: "3.2mm", plated: false },
	},
	box("court", "courtyard", 0, 0, 7, 7),
	box("court-back", "courtyard", 0, 0, 7, 7, true),
]);

const referencePatterns = references as unknown as Record<
	string,
	{ footprint: PhysicalFootprintInput; pinMap: Binding }
>;
function reference(name: string): Pattern {
	const r = referencePatterns[name];
	if (!r) throw new Error(`Missing sourced pattern: ${name}`);
	const features = structuredClone(r.footprint.features) as FeatureInput[];
	// Reserve both sides for THT parts. This is an authored conservative assembly
	// reservation; the library's original front courtyard remains untouched.
	if (features.some((f) => f.drill?.plated)) {
		for (const f of features.filter((f) => f.purpose === "courtyard"))
			features.push({ ...f, id: `${f.id}-back`, layers: ["back-courtyard"] });
	}
	return {
		footprint: definePhysicalFootprint({ key: r.footprint.key, features }),
		pinMap: r.pinMap,
	};
}
const cache = new Map<string, Pattern>();
export function physicalDevice(d: Device): Pattern {
	const cached = cache.get(d.key);
	if (cached) return cached;
	const pkg = d.definition.package;
	let footprint: PhysicalFootprintInput | undefined, r: Pattern | undefined;
	switch (pkg) {
		case "VFQFPN-24-4x4-P0.5-EP":
			footprint = STDRIVE101;
			break;
		case "TO-247-4":
			footprint = TO247;
			break;
		case "SSOP-8-DCT-P0.65":
			footprint = DCT8;
			break;
		case "HSOIC-8-P1.27-EP":
			footprint = DDA8;
			break;
		case "MSS1246T":
			footprint = MSS1246T;
			break;
		case "MKDS-5-2-P9.52":
			footprint = MKDS;
			break;
		case "FTSH-2x5-P1.27":
			footprint = FTSH007;
			break;
		case "TestPoint-D1.5":
			footprint = TESTPOINT;
			break;
		case "WSK2512-2mR-Kelvin":
			r = reference("WSK2512");
			break;
		case "SOIC-8-P1.27":
			r = reference("SOIC8");
			break;
		case "SOT-23":
			r = reference("SOT23");
			break;
		case "SOT-23-5":
			r = reference("SOT235");
			break;
		case "SOT-23-6":
			r = reference("SOT236");
			break;
		case "TSSOP-20-P0.65":
			r = reference("TSSOP20");
			break;
		case "LQFP-48-7x7-P0.5":
			r = reference("LQFP48");
			break;
		case "Radial-D16-P7.5-H25":
			r = reference("BULK");
			break;
		case "LED-0603":
			r = reference("LED0603");
			break;
		case "NTC-0603":
			r = reference("R0603");
			break;
		case "SOD-123":
			r = reference("SOD123");
			break;
		case "Switch-TL3305A-reference":
			r = reference("SWITCH");
			break;
		case "JST-XH-2-P2.5":
			r = reference("JST2");
			break;
		case "JST-XH-3-P2.5":
			r = reference("JST3");
			break;
		case "JST-XH-4-P2.5":
			r = reference("JST4");
			break;
		case "JST-XH-6-P2.5":
			r = reference("JST6");
			break;
		case "0603":
		case "0805":
		case "1206":
		case "1210":
			r = reference(`${d.key.includes(":C:") ? "C" : "R"}${pkg}`);
			break;
		default:
			throw new Error(`No reviewed footprint binding for ${d.key}: ${pkg}`);
	}
	const pinMap: Binding = { ...d.pinMap };
	if (r)
		for (const [logical, pad] of Object.entries(d.pinMap))
			pinMap[logical] = r.pinMap[pad] ?? pad;
	if (pkg === "WSK2512-2mR-Kelvin")
		Object.assign(pinMap, { I1: "1", I2: "4", E1: "2", E2: "3" });
	// Circuit LED terminal 1 is ANODE, 2 CATHODE; the library numbers K=1,A=2.
	if (pkg === "LED-0603") Object.assign(pinMap, { "1": "2", "2": "1" });
	// Same cathode-first convention in the SOD123 source; A=2,K=1.
	if (pkg === "SOD-123") Object.assign(pinMap, { A: "2", K: "1" });
	const resolved = { footprint: footprint ?? r!.footprint, pinMap };
	cache.set(d.key, resolved);
	return resolved;
}
export function courtyardBounds(
	f: PhysicalFootprintInput,
): [number, number, number, number] {
	const features = f.features.filter(
		(f) => f.purpose === "courtyard" && f.layers?.includes("front-courtyard"),
	);
	if (!features.length) throw new Error(`No front courtyard: ${f.key}`);
	const boxes = features.map((g) => {
		const x = parseFloat(g.at[0]),
			y = parseFloat(g.at[1]);
		const [w, h] =
			g.shape.kind === "circle"
				? [parseFloat(g.shape.diameter), parseFloat(g.shape.diameter)]
				: g.shape.size.map(parseFloat);
		return [x - w! / 2, y - h! / 2, x + w! / 2, y + h! / 2];
	});
	return [
		Math.min(...boxes.map((b) => b[0]!)),
		Math.min(...boxes.map((b) => b[1]!)),
		Math.max(...boxes.map((b) => b[2]!)),
		Math.max(...boxes.map((b) => b[3]!)),
	];
}
