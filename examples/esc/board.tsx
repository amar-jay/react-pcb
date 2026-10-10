import {
	Board,
	DifferentialPair,
	Keepout,
	pad,
	Route,
	RouteThrough,
	rect,
	useNet,
	Zone,
} from "@react-pcb/core";
import { batteryPlane, boardLayers, groundPlane } from "./layers.ts";
import { Control, controller } from "./modules/control.tsx";
import { Drive, gateDriver } from "./modules/drive.tsx";
import { Inverter, phasePadA } from "./modules/inverter.tsx";
import { Power, powerShunt } from "./modules/power.tsx";

export function Esc() {
	const ground = useNet("GND");
	const vbat = useNet("VBAT");
	const logic = useNet("3V3");
	const gateSupply = useNet("12V_GATE"); // External supply intent; regulator is not yet designed.
	const phaseA = useNet("PHASE_A");
	const phaseB = useNet("PHASE_B");
	const phaseC = useNet("PHASE_C");
	const shuntN = useNet("SHUNT_N");
	const pwmHigh = useNet("PWM_AH");
	const pwmLow = useNet("PWM_AL");
	const gateHigh = useNet("GATE_AH");
	const gateLow = useNet("GATE_AL");
	const bootstrap = useNet("BOOT_A");

	return (
		<Board
			outline={rect(0, 0, 36, 36)}
			layers={boardLayers}
			metadata={{
				title: "ESC footprint study",
				revision: "0.1.0",
				description:
					"Datasheet-backed footprints; three half-bridges, phase-A driver, external supply and sensing intent still unresolved",
			}}
		>
			<Power vbat={vbat} ground={ground} shuntN={shuntN} />
			<Inverter
				vbat={vbat}
				ground={shuntN}
				phaseA={phaseA}
				phaseB={phaseB}
				phaseC={phaseC}
				gateHigh={gateHigh}
				gateLow={gateLow}
				driver={gateDriver}
			/>
			<Drive
				ground={ground}
				gateSupply={gateSupply}
				phaseA={phaseA}
				pwmHigh={pwmHigh}
				pwmLow={pwmLow}
				gateHigh={gateHigh}
				gateLow={gateLow}
				bootstrap={bootstrap}
			/>
			<Control
				ground={ground}
				logic={logic}
				shuntN={shuntN}
				pwmHigh={pwmHigh}
				pwmLow={pwmLow}
			/>

			<DifferentialPair
				positive={ground}
				negative={shuntN}
				width={0.15}
				gap={0.15}
				from={[pad(powerShunt, "1"), pad(powerShunt, "2")]}
				to={[pad(controller, "PA0"), pad(controller, "PA1")]}
			>
				<RouteThrough key="shunt-kelvin" region={rect(8, 6, 8, 6)} />
				<RouteThrough key="mcu-sense" region={rect(24, 3, 8, 5)} />
			</DifferentialPair>

			<Route
				net={phaseA}
				from={pad(phasePadA, "P")}
				to={pad(gateDriver, "VS")}
				width={0.8}
			>
				<RouteThrough region={rect(16, 8, 6, 12)} />
			</Route>

			<Zone
				net={ground}
				layers={[groundPlane]}
				boundary="board"
				clearance={0.25}
			/>
			<Zone
				net={vbat}
				layers={[batteryPlane]}
				boundary={rect(2, 2, 32, 32)}
				clearance={0.3}
			/>
			<Keepout region={rect(12, 8, 2, 2)} disallow={["vias", "copper"]} />
		</Board>
	);
}
