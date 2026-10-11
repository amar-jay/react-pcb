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
import { Control, controller, logicCap } from "./modules/control.tsx";
import { bootCap, Drive, driverCap, gateDriver } from "./modules/drive.tsx";
import {
	Inverter,
	phaseHighA,
	phaseHighB,
	phaseHighC,
	phaseLowA,
	phaseLowB,
	phaseLowC,
} from "./modules/inverter.tsx";
import {
	Power,
	powerBattery,
	powerBulk,
	powerShunt,
} from "./modules/power.tsx";

export default function Esc() {
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
			outline={rect(0, 0, 35, 36)}
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
				returnNet={shuntN}
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
				vbat={vbat}
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
				{/* These keys distinguish waypoints within this pair, independent of geometry. */}
				<RouteThrough key="shunt-kelvin" region={rect(2.2, 14, 2, 12)} />
				<RouteThrough key="mcu-sense" region={rect(2.2, 10, 2, 3)} />
			</DifferentialPair>

			<Route
				net={phaseA}
				// Take VS from the high-side source, away from motor-terminal current.
				from={pad(phaseHighA, "S")}
				to={pad(gateDriver, "VS")}
				width={0.3}
			>
				<RouteThrough region={rect(16, 20, 1.6, 2.5)} />
			</Route>
			<Route
				net={bootstrap}
				from={pad(bootCap, "1")}
				to={pad(gateDriver, "VB")}
				width={0.3}
			/>
			<Route
				net={phaseA}
				from={pad(bootCap, "2")}
				to={pad(phaseHighA, "S")}
				width={0.3}
			/>
			<Route
				net={gateSupply}
				from={pad(driverCap, "1")}
				to={pad(gateDriver, "VCC")}
				width={0.3}
			/>
			<Route
				net={pwmHigh}
				from={pad(controller, "PA8")}
				to={pad(gateDriver, "HIN")}
				width={0.25}
			/>
			<Route
				net={pwmLow}
				from={pad(controller, "PB13")}
				to={pad(gateDriver, "LIN")}
				width={0.25}
			/>
			{/* 3V3 star: local bypass first, then the remaining supply pins. */}
			<Route
				net={logic}
				from={pad(controller, "VDD/VDDA")}
				to={pad(controller, "VDDIO2")}
				width={0.25}
			/>
			<Route
				net={logic}
				from={pad(controller, "VDDIO2")}
				to={pad(controller, "VREF+")}
				width={0.25}
			/>
			{/* Return bus: low-side sources, driver COM, its bypass, shunt and MCU ground. */}
			<Route
				net={shuntN}
				from={pad(phaseLowA, "S")}
				to={pad(gateDriver, "COM")}
				width={0.5}
			/>
			<Route
				net={shuntN}
				from={pad(gateDriver, "COM")}
				to={pad(driverCap, "2")}
				width={0.3}
			/>
			<Route
				net={shuntN}
				from={pad(phaseLowC, "S")}
				to={pad(powerShunt, "2")}
				width={1.0}
			/>
			{/* Held-off gates rejoin their source nets at an explicit star point. */}
			<Route
				net={phaseB}
				from={pad(phaseHighB, "G")}
				to={pad(phaseHighB, "S")}
				width={0.25}
			/>
			<Route
				net={phaseC}
				from={pad(phaseHighC, "G")}
				to={pad(phaseHighC, "S")}
				width={0.25}
			/>
			<Route
				net={shuntN}
				from={pad(phaseLowB, "G")}
				to={pad(phaseLowB, "S")}
				width={0.25}
			/>
			<Route
				net={shuntN}
				from={pad(phaseLowC, "G")}
				to={pad(phaseLowC, "S")}
				width={0.25}
			/>
			{/* VBAT bus: connector, bulk cap, high-side drains and MCU backup. */}
			<Route
				net={vbat}
				from={pad(powerBattery, "+")}
				to={pad(powerBulk, "1")}
				width={1.0}
			/>
			<Route
				net={vbat}
				from={pad(powerBulk, "1")}
				to={pad(phaseHighA, "D")}
				width={1.0}
			/>
			<Route
				net={vbat}
				from={pad(powerBulk, "1")}
				to={pad(controller, "VBAT")}
				width={0.25}
			/>
			{/* Input ground: connector shell side to bulk cap. */}
			<Route
				net={ground}
				from={pad(powerBattery, "-")}
				to={pad(powerBulk, "2")}
				width={1.0}
			/>
			<Route
				net={ground}
				from={pad(controller, "VSS/VSSA")}
				to={pad(controller, "VSS")}
				width={0.25}
			/>
			<Route
				net={ground}
				from={pad(controller, "VSS")}
				to={pad(logicCap, "2")}
				width={0.25}
			/>
			{/* Ground star: MCU ground meets the shunt Kelvin pickup, which meets the input ground. */}
			<Route
				net={ground}
				from={pad(logicCap, "2")}
				to={pad(powerShunt, "1")}
				width={0.5}
			/>
			<Route
				net={ground}
				from={pad(powerShunt, "1")}
				to={pad(powerBulk, "2")}
				width={0.5}
			/>

			<Zone
				net={ground}
				layers={[groundPlane]}
				boundary="board"
				clearance={0.25}
			/>
			<Zone
				net={vbat}
				layers={[batteryPlane]}
				boundary={rect(1, 1.5, 33, 33)}
				clearance={0.3}
			/>
			{/* Separate the left sensing corridor from switching circuitry while
			    retaining continuous reference-plane copper. */}
			<Keepout
				region={rect(11.5, 14, 1.2, 13)}
				disallow={["components", "tracks", "vias"]}
			/>
		</Board>
	);
}
