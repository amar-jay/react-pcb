import { Module, pad, part, Route, usePart } from "@react-pcb/core";
import { Capacitor, Controller, type Net } from "../parts/index.ts";

const scope = "control";

export const controller = part("U2", `${scope}/U2`);
export const logicCap = part("C2", `${scope}/C2`);

type ControlProps = {
	ground: Net;
	logic: Net;
	vbat: Net;
	shuntN: Net;
	pwmHigh: Net;
	pwmLow: Net;
};

function ControlParts(props: ControlProps) {
	const mcu = usePart("U2");
	const logicCap = usePart("C2");
	return (
		<>
			<Controller
				id={mcu}
				at={[8.4, 7.2]}
				connect={{
					"VDD/VDDA": props.logic,
					VDDIO2: props.logic,
					// VBAT is the backup-domain supply input (DS13560 Fig. 5 pin 4),
					// not a second 3V3 pin. Backup power source selection is
					// unresolved electrical work.
					VBAT: props.vbat,
					"VREF+": props.logic,
					"VSS/VSSA": props.ground,
					VSS: props.ground,
					PA8: props.pwmHigh,
					PB13: props.pwmLow,
					PA0: props.ground,
					PA1: props.shuntN,
				}}
			/>
			<Capacitor
				id={logicCap}
				// Pins 6/7 are on the MCU's left edge; avoid a via in this loop.
				at={[2.4, 7.2]}
				rotation={90}
				connect={{ 1: props.logic, 2: props.ground }}
			/>
			<Route
				net={props.logic}
				from={pad(logicCap, "1")}
				to={pad(mcu, "VDD/VDDA")}
				width={0.25}
			/>
		</>
	);
}

export function Control(props: ControlProps) {
	return (
		<Module name={scope}>
			<ControlParts {...props} />
		</Module>
	);
}
