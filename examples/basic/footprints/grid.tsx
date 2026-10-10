import React from "react";
import { Footprint, Pad } from "@react-pcb/core";

// Illustrative fixtures; dimensions are independently checked in grid.test.tsx.
export function GridPadRows() {
	return (
		<Footprint
			name="example:grid-pad-rows"
			style={{
				display: "grid",
				width: "5.5mm",
				height: "5.08mm",
				left: "-2.75mm",
				top: "-2.54mm",
				gridTemplateColumns: ["1.5mm", "2.5mm", "1.5mm"],
				gridTemplateRows: Array.from({ length: 4 }, () => "1.27mm" as const),
				justifyItems: "center",
				alignItems: "center",
			}}
		>
			{[1, 2, 3, 4].flatMap((row) =>
				[1, 3].map((column) => (
					<Pad
						key={`${row}/${column}`}
						name={String(column === 1 ? row : 9 - row)}
						layers={["front-copper", "front-mask", "front-paste"]}
						style={{
							width: "1.5mm",
							height: "0.65mm",
							gridColumn: column,
							gridRow: row,
						}}
					/>
				)),
			)}
		</Footprint>
	);
}

export function GridPinHeader() {
	return (
		<Footprint
			name="example:grid-pin-header"
			style={{
				display: "grid",
				width: "5.08mm",
				height: "7.62mm",
				left: "-1.27mm",
				top: "-1.27mm",
				gridTemplateColumns: ["2.54mm", "2.54mm"],
				gridTemplateRows: ["2.54mm", "2.54mm", "2.54mm"],
				justifyItems: "center",
				alignItems: "center",
			}}
		>
			{[1, 2, 3].flatMap((row) =>
				[1, 2].map((column) => {
					const pin = (row - 1) * 2 + column;
					return (
						<Pad
							key={pin}
							name={String(pin)}
							shape={pin === 1 ? "rect" : "circle"}
							layers={["all-copper", "all-mask"]}
							drill={{ diameter: "0.8mm", plated: true }}
							style={{
								width: "1.6mm",
								height: "1.6mm",
								gridColumn: column,
								gridRow: row,
							}}
						/>
					);
				}),
			)}
		</Footprint>
	);
}
