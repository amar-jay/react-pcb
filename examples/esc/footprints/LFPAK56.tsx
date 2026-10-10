import { Footprint, Graphic, Pad } from "@react-pcb/core";
import React from "react";
import { box, Documentation } from "./shared.tsx";

// Nexperia SOT669, 20 March 2025, Fig.2. The T-shaped mounting-base copper
// is two abutting rectangles: both IDs bind to D. No polygon approximation.
export function LFPAK56Footprint() {
	return (
		<Footprint
			name="esc:sot669-lfpak56"
			style={{ width: "6mm", height: "8mm" }}
		>
			<Pad
				name="mb-upper"
				layers={["front-copper"]}
				style={box(0, -2750, 4700, 1500)}
			/>
			<Pad
				name="mb-lower"
				layers={["front-copper"]}
				style={box(0, -450, 4200, 3100)}
			/>
			{/* A rectangular merged mask is an explicit authoring choice; see README. */}
			<Graphic
				name="mask-mb"
				purpose="mask-opening"
				layers={["front-mask"]}
				style={box(0, -1200, 4850, 4750)}
			/>
			{[-1905, -635, 635, 1905].map((x, index) => (
				<React.Fragment key={x}>
					<Pad
						name={String(index + 1)}
						layers={["front-copper"]}
						style={box(x, 2725, 700, 1150)}
					/>
					<Graphic
						name={`mask-${index + 1}`}
						purpose="mask-opening"
						layers={["front-mask"]}
						style={box(x, 2725, 850, 1300)}
					/>
					<Graphic
						name={`paste-${index + 1}`}
						purpose="paste-opening"
						layers={["front-paste"]}
						style={box(x, 2725, 600, 1050)}
					/>
					<Graphic
						name={`paste-mb-top-${index + 1}`}
						purpose="paste-opening"
						layers={["front-paste"]}
						style={box(x, -3000, 600, 900)}
					/>
				</React.Fragment>
			))}
			{[-1150, 0, 1150].flatMap((x, column) =>
				[-1150, -300, 550].map((y, row) => (
					<Graphic
						key={`${x}/${y}`}
						name={`paste-mb-${column + 1}-${row + 1}`}
						purpose="paste-opening"
						layers={["front-paste"]}
						style={box(x, y, 900, 600)}
					/>
				)),
			)}
			<Documentation
				width={4900}
				height={3950}
				courtyardWidth={5600}
				courtyardHeight={7600}
				y={-100}
			/>
			<Graphic
				name="gate-marker"
				purpose="silkscreen"
				shape="circle"
				layers={["front-silkscreen"]}
				style={box(2550, 2725, 250, 250)}
			/>
		</Footprint>
	);
}
