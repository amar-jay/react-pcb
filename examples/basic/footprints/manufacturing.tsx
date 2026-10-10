import {
	Footprint,
	Graphic,
	type ManufacturingProfileInput,
	Pad,
} from "@react-pcb/core";

// Illustrative process limits, not the capabilities of a particular fabricator.
export const inspectionProfile: ManufacturingProfileInput = Object.freeze({
	schemaVersion: 1,
	key: "example:inspection-process",
	minCopperFeature: "0.15mm",
	minCopperSpacing: "0.15mm",
	minDrillDiameter: "0.3mm",
	minAnnularRing: "0.15mm",
	minMaskExpansion: "0.05mm",
	minMaskWeb: "0.1mm",
	minPasteFeature: "0.1mm",
	minCourtyardClearance: "0.2mm",
});

// Explicit apertures allow the report to verify process limits without changing
// nominal copper. The pads use Grid; their paste apertures use absolute layout.
export function ManufacturingPassive() {
	return (
		<Footprint
			name="example:manufacturing-passive"
			style={{
				display: "grid",
				width: "1.6mm",
				height: "0.7mm",
				left: "-0.8mm",
				top: "-0.35mm",
				gridTemplateColumns: ["0.6mm", "0.6mm"],
				gridTemplateRows: ["0.7mm"],
				gap: "0.4mm",
			}}
		>
			{[1, 2].map((column) => (
				<Pad
					key={column}
					name={String(column)}
					layers={["front-copper"]}
					style={{
						width: "0.6mm",
						height: "0.7mm",
						gridColumn: column,
						gridRow: 1,
					}}
				/>
			))}
			{[0, 1].flatMap((index) => [
				<Graphic
					key={`mask-${index}`}
					name={`mask-${index + 1}`}
					purpose="mask-opening"
					layers={["front-mask"]}
					style={{
						position: "absolute",
						width: "0.7mm",
						height: "0.8mm",
						left: index === 0 ? "-0.05mm" : "0.95mm",
						top: "-0.05mm",
					}}
				/>,
				<Graphic
					key={`paste-${index}`}
					name={`paste-${index + 1}`}
					purpose="paste-opening"
					layers={["front-paste"]}
					style={{
						position: "absolute",
						width: "0.5mm",
						height: "0.6mm",
						left: index === 0 ? "0.05mm" : "1.05mm",
						top: "0.05mm",
					}}
				/>,
			])}
			<Graphic
				name="courtyard"
				purpose="courtyard"
				layers={["front-courtyard"]}
				stroke="0.05mm"
				style={{
					position: "absolute",
					width: "2mm",
					height: "1.1mm",
					left: "-0.2mm",
					top: "-0.2mm",
				}}
			/>
		</Footprint>
	);
}
