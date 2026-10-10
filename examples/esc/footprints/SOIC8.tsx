import React from "react";
import { Footprint, Graphic, Pad } from "@react-pcb/core";
import { box, Documentation, SmdOpenings } from "./shared.tsx";

// IR2101(S), PD60043 Rev O, p.13: 6.46 outer span, 1.78 × 0.72 lands.
export function SOIC8Footprint() {
	return (
		<Footprint name="esc:ir2101-soic8" style={{ width: "8mm", height: "6mm" }}>
			{Array.from({ length: 8 }, (_, index) => {
				const left = index < 4;
				const x = left ? -2340 : 2340;
				const y = left ? -1905 + index * 1270 : 1905 - (index - 4) * 1270;
				const name = String(index + 1);
				return (
					<React.Fragment key={name}>
						<Pad
							name={name}
							layers={["front-copper"]}
							style={box(x, y, 1780, 720)}
						/>
						<SmdOpenings name={name} x={x} y={y} width={1780} height={720} />
					</React.Fragment>
				);
			})}
			<Documentation
				width={3900}
				height={4900}
				courtyardWidth={7300}
				courtyardHeight={5800}
			/>
			<Graphic
				name="pin-1"
				purpose="silkscreen"
				shape="circle"
				layers={["front-silkscreen"]}
				style={box(-2340, -2715, 300, 300)}
			/>
			{([-1, 1] as const).map((sign) => (
				<Graphic
					key={sign}
					name={`silk-${sign}`}
					purpose="silkscreen"
					layers={["front-silkscreen"]}
					style={box(0, sign * 2560, 3600, 120)}
				/>
			))}
		</Footprint>
	);
}
