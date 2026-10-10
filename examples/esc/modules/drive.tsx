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
				at={[16, 4]}
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
				at={[16, 7.5]}
				connect={{ 1: props.gateSupply, 2: props.ground }}
			/>
			<Capacitor
				id={bootCap}
				at={[20, 4]}
				side="back"
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
