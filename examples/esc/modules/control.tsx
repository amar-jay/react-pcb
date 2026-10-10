import { Module, Route, pad, part, usePart } from "@react-pcb/core";
import { Capacitor, Controller, type Net } from "../parts/index.ts";

const scope = "control";

export const controller = part("U2", `${scope}/U2`);

type ControlProps = {
	ground: Net;
	logic: Net;
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
				at={[29, 6]}
				connect={{
					"VDD/VDDA": props.logic,
					VDDIO2: props.logic,
					VBAT: props.logic,
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
				at={[32, 5]}
				side="back"
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
