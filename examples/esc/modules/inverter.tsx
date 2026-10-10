import {
	Module,
	type PartProps,
	pad,
	part,
	Route,
	useNet,
	usePart,
} from "@react-pcb/core";
import { Mosfet, type Net, PhasePad } from "../parts/index.ts";

const scope = "inverter";

export const phasePadA = part("J2", `${scope}/J2`);
export const phasePadB = part("J3", `${scope}/J3`);
export const phasePadC = part("J4", `${scope}/J4`);

type PhaseName = "A" | "B" | "C";

type PhaseProps = {
	name: PhaseName;
	vbat: Net;
	ground: Net;
	phase: Net;
	at: readonly [number, number];
	gateHigh?: Net;
	gateLow?: Net;
	driver?: PartProps["id"];
};

function InverterPhase({
	name,
	vbat,
	ground,
	phase,
	at,
	gateHigh,
	gateLow,
	driver,
}: PhaseProps) {
	const ownHigh = useNet(`GATE_${name}H`);
	const ownLow = useNet(`GATE_${name}L`);
	const highNet = gateHigh ?? ownHigh;
	const lowNet = gateLow ?? ownLow;
	const high = usePart(`Q${name}H`);
	const low = usePart(`Q${name}L`);
	const output = usePart(name === "A" ? "J2" : name === "B" ? "J3" : "J4");
	const [x, y] = at;
	return (
		<>
			<Mosfet
				id={high}
				at={[x, y + 4]}
				connect={{ G: highNet, D: vbat, S: phase }}
			/>
			<Mosfet
				id={low}
				at={[x, y - 4]}
				connect={{ G: lowNet, D: phase, S: ground }}
			/>
			<PhasePad id={output} at={[x, 32]} connect={{ P: phase }} />
			{driver ? (
				<>
					<Route
						net={highNet}
						from={pad(driver, "HO")}
						to={pad(high, "G")}
						width={0.3}
					/>
					<Route
						net={lowNet}
						from={pad(driver, "LO")}
						to={pad(low, "G")}
						width={0.3}
					/>
				</>
			) : null}
		</>
	);
}

type InverterProps = {
	vbat: Net;
	ground: Net;
	phaseA: Net;
	phaseB: Net;
	phaseC: Net;
	gateHigh: Net;
	gateLow: Net;
	driver: PartProps["id"];
};

function InverterParts(props: InverterProps) {
	return (
		<>
			<InverterPhase
				name="A"
				vbat={props.vbat}
				ground={props.ground}
				phase={props.phaseA}
				gateHigh={props.gateHigh}
				gateLow={props.gateLow}
				driver={props.driver}
				at={[18, 20]}
			/>
			<InverterPhase
				name="B"
				vbat={props.vbat}
				ground={props.ground}
				phase={props.phaseB}
				at={[24, 20]}
			/>
			<InverterPhase
				name="C"
				vbat={props.vbat}
				ground={props.ground}
				phase={props.phaseC}
				at={[30, 20]}
			/>
		</>
	);
}

export function Inverter(props: InverterProps) {
	return (
		<Module name={scope}>
			<InverterParts {...props} />
		</Module>
	);
}
