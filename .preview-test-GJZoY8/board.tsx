import { Board, net, Part, part, rect } from "@react-pcb/core";
import { testLayers } from "../packages/preview/src/__tests__/fixtures.ts";
import { footprint } from "./footprint.ts";

export default function MyBoard() {
	return (
		<Board
			outline={rect(0, 0, 20, 20)}
			layers={testLayers}
			metadata={{ title: "Preview fixture" }}
		>
			<Part
				id={part("C1")}
				at={[5, 5]}
				footprint={footprint}
				connect={{ 1: net("GND") }}
			/>
		</Board>
	);
}
