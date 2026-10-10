import { Footprint, Graphic, Pad } from "@react-pcb/core";
import React from "react";
import { box, Documentation, SmdOpenings } from "./shared.tsx";

function TwoTerminal({
	name,
	center,
	width,
	height,
	body,
	courtyard,
}: {
	name: string;
	center: number;
	width: number;
	height: number;
	body: readonly [number, number];
	courtyard: readonly [number, number];
}) {
	return (
		<Footprint name={name} style={{ width: "10mm", height: "10mm" }}>
			{([-1, 1] as const).map((sign, index) => (
				<React.Fragment key={sign}>
					<Pad
						name={String(index + 1)}
						layers={["front-copper"]}
						style={box(sign * center, 0, width, height)}
					/>
					<SmdOpenings
						name={String(index + 1)}
						x={sign * center}
						y={0}
						width={width}
						height={height}
					/>
				</React.Fragment>
			))}
			<Documentation
				width={body[0]}
				height={body[1]}
				courtyardWidth={courtyard[0]}
				courtyardHeight={courtyard[1]}
			/>
			{([-1, 1] as const).map((sign) => (
				<Graphic
					key={sign}
					name={`silk-${sign}`}
					purpose="silkscreen"
					layers={["front-silkscreen"]}
					style={box(
						0,
						sign * (Math.max(body[1], height) / 2 + 250),
						body[0] / 2,
						100,
					)}
				/>
			))}
		</Footprint>
	);
}

// Murata GRM reflow ranges, table 2: a=gap, b=land length, c=land width.
export function Capacitor0402Footprint() {
	return (
		<TwoTerminal
			name="esc:grm15-0402"
			center={400}
			width={400}
			height={500}
			body={[1000, 500]}
			courtyard={[1900, 1200]}
		/>
	);
}

export function Capacitor1210Footprint() {
	return (
		<TwoTerminal
			name="esc:grm32-1210"
			center={1650}
			width={1100}
			height={2200}
			body={[3200, 2500]}
			courtyard={[5100, 3600]}
		/>
	);
}

// Vishay 30100, p.2, WSL2512 0.007–0.5 ohm: a=1.65, b=3.68, l=4.06.
export function Shunt2512Footprint() {
	return (
		<TwoTerminal
			name="esc:wsl2512-7m-to-500m"
			center={2855}
			width={1650}
			height={3680}
			body={[6350, 3180]}
			courtyard={[8200, 4500]}
		/>
	);
}
