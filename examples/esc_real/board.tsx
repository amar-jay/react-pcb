import {
	Board,
	copperLayer,
	defineLayerSet,
	defineStackup,
	dielectricLayer,
	mechanicalLayer,
	Part,
	pad,
	part,
	pasteLayer,
	Route,
	rect,
	silkscreenLayer,
	solderMaskLayer,
} from "@react-pcb/core";
import { createCircuit } from "./circuit.ts";
import { MOUNT, physicalDevice } from "./footprints/index.ts";
import type { Circuit } from "./model.ts";
import placement from "./placement.json";
import { manufacturingProfile } from "./process.ts";

export { manufacturingProfile } from "./process.ts";

// Planning stack only. These IDs remain stable when layer order changes.
export const layers = defineLayerSet({
	stackup: defineStackup([
		copperLayer({
			id: "esc-real/copper/front",
			thickness: 0.07,
			usage: "mixed",
		}),
		dielectricLayer({
			id: "esc-real/dielectric/top",
			material: "FR-4",
			thickness: 0.2,
			epsilonR: 4.3,
		}),
		copperLayer({
			id: "esc-real/copper/ground",
			thickness: 0.035,
			usage: "plane",
		}),
		dielectricLayer({
			id: "esc-real/dielectric/core",
			material: "FR-4",
			thickness: 0.95,
			epsilonR: 4.3,
		}),
		copperLayer({
			id: "esc-real/copper/power",
			thickness: 0.035,
			usage: "plane",
		}),
		dielectricLayer({
			id: "esc-real/dielectric/bottom",
			material: "FR-4",
			thickness: 0.2,
			epsilonR: 4.3,
		}),
		copperLayer({
			id: "esc-real/copper/back",
			thickness: 0.07,
			usage: "mixed",
		}),
	]),
	technical: (["front", "back"] as const).flatMap((side) => [
		solderMaskLayer({ id: `esc-real/mask/${side}`, side }),
		pasteLayer({ id: `esc-real/paste/${side}`, side }),
		silkscreenLayer({ id: `esc-real/silk/${side}`, side, color: "white" }),
		mechanicalLayer({
			id: `esc-real/fabrication/${side}`,
			side,
			purpose: "fabrication",
		}),
		mechanicalLayer({
			id: `esc-real/courtyard/${side}`,
			side,
			purpose: "courtyard",
		}),
	]),
});

export default function EscReal({
	circuit = createCircuit(),
}: {
	circuit?: Circuit;
}) {
	const placements = placement as unknown as Record<
		string,
		{ at: [number, number]; rotation: 0 }
	>;
	const handles = new Map(
		circuit.parts.map((p) => [p.reference, part(p.reference, p.id)]),
	);
	// Physical constraints express selected local connections, not routed copper.
	const routes: {
		from: [string, string];
		to: [string, string];
		width: number;
	}[] = [];
	for (const phase of ["U", "V", "W"]) {
		for (const side of ["H", "L"])
			routes.push({
				from: [`R_GATE_${phase}${side}`, "2"],
				to: [`Q_${phase}${side}`, "G"],
				width: 0.4,
			});
		for (const [suffix, input, terminal] of [
			["P", "IN+", "E1"],
			["N", "IN-", "E2"],
		] as const) {
			routes.push({
				from: [`R_SHUNT_${phase}`, terminal],
				to: [`R_I_${phase}${suffix}`, "1"],
				width: 0.2,
			});
			routes.push({
				from: [`R_I_${phase}${suffix}`, "2"],
				to: [`U_I_${phase}`, input],
				width: 0.2,
			});
		}
		routes.push({
			from: [`C_I_SUP_${phase}`, "1"],
			to: [`U_I_${phase}`, "VS"],
			width: 0.25,
		});
	}
	return (
		<Board
			outline={rect(0, 0, 180, 160)}
			layers={layers}
			manufacturingProfile={manufacturingProfile}
			metadata={{
				title: "ESC physical placement prototype",
				revision: "0.3.0",
				stage: "physical-placement",
				physicalStatus:
					"Sourced lands and initial placement; copper routing and thermal/mechanical qualification pending",
				operatingPoint:
					"48V / 10A RMS / 20kHz assumptions; not qualified ratings",
				dnpPartIds: circuit.parts.filter((p) => !p.populate).map((p) => p.id),
				manufacturingProcess:
					"Project geometric acceptance limits; mixed SMD/NSMD mask openings; no fabricator qualification",
			}}
		>
			{circuit.parts.map((p) => {
				const position = placements[p.id];
				if (!position) throw new Error(`No reviewed placement for ${p.id}`);
				const physical = physicalDevice(p.device);
				return (
					<Part
						key={p.id}
						id={handles.get(p.reference)!}
						definition={{ key: p.device.key, ...p.device.definition }}
						footprint={physical.footprint}
						pinMap={physical.pinMap}
						at={position.at}
						rotation={position.rotation}
						connect={p.connections}
					/>
				);
			})}
			{(
				[
					[6, 6],
					[174, 6],
					[6, 154],
					[174, 154],
				] as const
			).map((at, i) => (
				<Part
					key={`mount-${i + 1}`}
					id={part(`H${i + 1}`, `esc-real/mechanical/H${i + 1}`)}
					definition={{
						key: "esc-real:board-owned:M3-hole",
						pins: {},
						pinoutCoverage: "complete",
						value: "3.2mm NPTH / M3",
					}}
					footprint={MOUNT}
					pinMap={{}}
					at={at}
					connect={{}}
				/>
			))}
			{routes.map((r) => {
				const source = circuit.parts.find((p) => p.reference === r.from[0])!;
				const net = source.connections[r.from[1]];
				if (!net)
					throw new Error(`Unconnected route source ${r.from.join(".")}`);
				return (
					<Route
						key={`${source.id}/${r.from[1]}/${r.to.join("/")}`}
						net={net}
						from={pad(handles.get(r.from[0])!, r.from[1])}
						to={pad(handles.get(r.to[0])!, r.to[1])}
						width={r.width}
					/>
				);
			})}
		</Board>
	);
}
