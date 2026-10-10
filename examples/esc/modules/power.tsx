import { Module, part, usePart } from "@react-pcb/core";
import { Battery, BulkCapacitor, type Net, Shunt } from "../parts/index.ts";

const scope = "power";

export const powerBattery = part("J1", `${scope}/J1`);
export const powerBulk = part("C1", `${scope}/C1`);
export const powerShunt = part("R1", `${scope}/R1`);

type PowerProps = {
	vbat: Net;
	ground: Net;
	shuntN: Net;
};

function PowerParts({ vbat, ground, shuntN }: PowerProps) {
	const battery = usePart("J1");
	const bulk = usePart("C1");
	const shunt = usePart("R1");
	return (
		<>
			{/* Input at the top edge, adjacent to the high-side drain bus. */}
			<Battery
				id={battery}
				at={[22.2, 4.2]}
				connect={{ "+": vbat, "-": ground }}
			/>
			<BulkCapacitor
				id={bulk}
				at={[22.2, 10.3]}
				rotation={180}
				connect={{ 1: vbat, 2: ground }}
			/>
			<Shunt
				id={shunt}
				// Pin 2 faces the low-side source bus; pin 1 faces the quiet left edge.
				at={[6.5, 29]}
				connect={{ 1: ground, 2: shuntN }}
			/>
		</>
	);
}

export function Power(props: PowerProps) {
	return (
		<Module name={scope}>
			<PowerParts {...props} />
		</Module>
	);
}
