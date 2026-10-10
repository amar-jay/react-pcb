import { Module, part, usePart } from "@react-pcb/core";
import { Capacitor, GateDriver, type Net } from "../parts/index.ts";

const scope = "drive";

export const gateDriver = part("U1", `${scope}/U1`);

type DriveProps = {
	ground: Net;
	gateSupply: Net;
	phaseA: Net;
	pwmHigh: Net;
	pwmLow: Net;
	gateHigh: Net;
	gateLow: Net;
	bootstrap: Net;
};

function DriveParts(props: DriveProps) {
	const driver = usePart("U1");
	const driverCap = usePart("C3");
	const bootCap = usePart("C4");
	return (
		<>
			<GateDriver
				id={driver}
				// Back-side reflection faces HO/LO toward phase A's gate lands.
				// The body sits in the gap between the front-side MOSFET rows.
				at={[18.8, 21.3]}
				side="back"
				connect={{
					HIN: props.pwmHigh,
					LIN: props.pwmLow,
					HO: props.gateHigh,
					LO: props.gateLow,
					VB: props.bootstrap,
					VS: props.phaseA,
					VCC: props.gateSupply,
					COM: props.ground,
				}}
			/>
			<Capacitor
				id={driverCap}
				// VCC/COM are on the right in board front coordinates.
				at={[23.4, 21.3]}
				side="back"
				rotation={270}
				connect={{ 1: props.gateSupply, 2: props.ground }}
			/>
			<Capacitor
				id={bootCap}
				// VB is above VS; back reflection plus rotation puts pin 1 above 2.
				at={[14.2, 20.665]}
				side="back"
				rotation={270}
				connect={{ 1: props.bootstrap, 2: props.phaseA }}
			/>
		</>
	);
}

export function Drive(props: DriveProps) {
	return (
		<Module name={scope}>
			<DriveParts {...props} />
		</Module>
	);
}
