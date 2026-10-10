import { expect, test } from "bun:test";
import {
	GridPadRows,
	GridPinHeader,
} from "../../../../examples/basic/footprints/grid.tsx";
import {
	Board,
	compile,
	compileFootprint,
	definePhysicalFootprint,
	Footprint,
	FootprintGroup,
	footprintSvg,
	Graphic,
	net,
	Pad,
	Part,
	PcbCompileError,
	type PhysicalLength,
	part,
	rect,
	renderFootprintDeclarations,
} from "../index.ts";
import { assertDefined, testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };

test("two-sided pad rows equal explicit geometry, including every center, size and bounds", async () => {
	const ir = await compileFootprint(<GridPadRows />, options);
	const coordinates = [
		["1", "-2mm", "-1.905mm"],
		["8", "2mm", "-1.905mm"],
		["2", "-2mm", "-0.635mm"],
		["7", "2mm", "-0.635mm"],
		["3", "-2mm", "0.635mm"],
		["6", "2mm", "0.635mm"],
		["4", "-2mm", "1.905mm"],
		["5", "2mm", "1.905mm"],
	] as const;
	const explicit = definePhysicalFootprint({
		key: ir.key,
		features: coordinates.map(([id, x, y]) => ({
			id,
			purpose: "pad",
			at: [x, y],
			shape: { kind: "rect", size: ["1.5mm", "0.65mm"] },
			layers: ["front-copper", "front-mask", "front-paste"],
		})),
	});
	expect(ir).toEqual(await compileFootprint(explicit, options));
	expect(ir.bounds).toEqual({
		min2: [-5500000, -4460000],
		max2: [5500000, 4460000],
	});
	const left = ir.features.filter((f) => Number(f.id) <= 4);
	expect(
		left.slice(1).map((f, i) => f.at[1] - assertDefined(left[i]).at[1]),
	).toEqual([1270000, 1270000, 1270000]);
	expect(await footprintSvg(ir, options)).toBe(
		await footprintSvg(await compileFootprint(explicit, options), options),
	);
});

test("2x3 header preserves pitch, drills, explicit geometry, serialization and board placement", async () => {
	const declaration = await renderFootprintDeclarations(<GridPinHeader />);
	const ir = await compileFootprint(declaration, options);
	const coordinates = [
		["0mm", "0mm"],
		["2.54mm", "0mm"],
		["0mm", "2.54mm"],
		["2.54mm", "2.54mm"],
		["0mm", "5.08mm"],
		["2.54mm", "5.08mm"],
	] as const;
	const explicit = definePhysicalFootprint({
		key: ir.key,
		features: coordinates.map((at, i) => ({
			id: String(i + 1),
			purpose: "pad",
			at,
			shape:
				i === 0
					? { kind: "rect", size: ["1.6mm", "1.6mm"] }
					: { kind: "circle", diameter: "1.6mm" },
			layers: ["all-copper", "all-mask"],
			drill: { diameter: "0.8mm", plated: true },
		})),
	});
	expect(ir).toEqual(await compileFootprint(explicit, options));
	expect(ir.bounds).toEqual({
		min2: [-1600000, -1600000],
		max2: [6680000, 11760000],
	});
	expect(
		await compileFootprint(JSON.parse(JSON.stringify(declaration)), options),
	).toEqual(ir);
	expect(await footprintSvg(ir, options)).toBe(
		await footprintSvg(
			await compileFootprint(<GridPinHeader />, options),
			options,
		),
	);
	const board = await compile(
		<Board outline={rect(0, 0, 30, 30)} layers={testLayers}>
			<Part
				id={part("J1")}
				at={[10, 10]}
				rotation={90}
				footprint={declaration}
				connect={{ 1: net("GND") }}
			/>
			<Part
				id={part("J2")}
				at={[10, 10]}
				rotation={90}
				side="back"
				footprint={ir}
				connect={{ 1: net("GND") }}
			/>
		</Board>,
		options,
	);
	expect(board.ir.parts[0]?.physicalFeatures["4"]?.geometry.at).toEqual([
		7460000, 12540000,
	]);
	expect(board.ir.parts[1]?.physicalFeatures["4"]?.geometry.at).toEqual([
		7460000, 7460000,
	]);
	expect(board.diagnostics).toEqual([]);
	expect(JSON.stringify(ir)).not.toContain("gridTemplate");
});

test("explicit spans include gaps and all cell alignments use untransformed boxes", async () => {
	for (const [align, expected] of [
		["start", [1000000, 500000]],
		["center", [3250000, 1750000]],
		["end", [5500000, 3000000]],
	] as const) {
		const ir = await compileFootprint(
			<Footprint
				name="span"
				style={{
					display: "grid",
					width: "7mm",
					height: "4mm",
					gridTemplateColumns: ["2mm", "4mm"],
					gridTemplateRows: ["1mm", "2mm"],
					gap: "0.5mm",
					justifyItems: align,
					alignItems: align,
				}}
			>
				<Pad
					name="P"
					layers={["front-copper"]}
					style={{
						width: "2mm",
						height: "1mm",
						gridColumn: 1,
						gridRow: 1,
						gridColumnSpan: 2,
						gridRowSpan: 2,
						transform: { rotate: 90 },
					}}
				/>
			</Footprint>,
			options,
		);
		expect(ir.features[0]).toMatchObject({
			at: expected,
			rotation: 90,
			shape: { kind: "rect", size: [2000000, 1000000] },
		});
	}
});

test("mixed units, nested grid/flex, reflections and odd centered dimensions remain exact", async () => {
	const ir = await compileFootprint(
		<Footprint
			name="nested-grid"
			style={{
				display: "grid",
				width: "8mm",
				height: "4mm",
				gridTemplateColumns: ["4000um", "4000000nm"],
				gridTemplateRows: ["4mm"],
				justifyItems: "center",
				alignItems: "center",
				transform: { reflectX: true, rotate: 90 },
			}}
		>
			<FootprintGroup
				style={{
					display: "flex",
					width: "2mm",
					height: "2mm",
					gridColumn: 2,
					gridRow: 1,
					gap: "1mm",
					alignItems: "center",
				}}
			>
				<Pad
					name="P"
					layers={["front-copper"]}
					style={{ width: "1mm", height: "1mm" }}
				/>
			</FootprintGroup>
		</Footprint>,
		options,
	);
	expect(ir.features[0]).toMatchObject({
		at: [4000000, 500000],
		rotation: 270,
	});
	const odd = await compileFootprint(
		<Footprint
			name="odd-grid"
			style={{
				display: "grid",
				width: "10nm",
				height: "10nm",
				gridTemplateColumns: ["10nm"],
				gridTemplateRows: ["10nm"],
				justifyItems: "center",
				alignItems: "center",
			}}
		>
			<Pad
				name="P"
				layers={["front-copper"]}
				style={{ width: "3nm", height: "3nm", gridColumn: 1, gridRow: 1 }}
			/>
		</Footprint>,
		options,
	);
	expect(odd.features[0]?.at).toEqual([5, 5]);
	expect(odd.bounds).toEqual({ min2: [7, 7], max2: [13, 13] });
});

test("assignments and identities survive reordering and absolute overlays consume no grid cells", async () => {
	const make = (reverse: boolean, wrap: boolean) => {
		const pads = [1, 2].map((column) => (
			<Pad
				key={`pad-${column}`}
				layers={["front-copper"]}
				style={{ width: "1mm", height: "1mm", gridColumn: column, gridRow: 1 }}
			/>
		));
		const body = (
			<Graphic
				key="body"
				purpose="fabrication"
				layers={["front-fabrication"]}
				style={{
					position: "absolute",
					width: "20mm",
					height: "20mm",
					left: "-10mm",
					top: "-10mm",
				}}
			/>
		);
		const contents = reverse ? [body, ...pads.toReversed()] : [...pads, body];
		const gridStyle = {
			display: "grid" as const,
			width: "4mm" as PhysicalLength,
			height: "2mm" as PhysicalLength,
			gridTemplateColumns: ["2mm", "2mm"] as const,
			gridTemplateRows: ["2mm"] as const,
		};
		return (
			<Footprint
				name="stable-grid"
				style={wrap ? { width: "4mm", height: "2mm" } : gridStyle}
			>
				{wrap ? (
					<FootprintGroup
						style={{
							...gridStyle,
							position: "absolute",
							left: "0mm",
							top: "0mm",
						}}
					>
						{contents}
					</FootprintGroup>
				) : (
					contents
				)}
			</Footprint>
		);
	};
	const before = await compileFootprint(make(false, false), options);
	const after = await compileFootprint(make(true, true), options);
	expect(Object.fromEntries(after.features.map((f) => [f.id, f]))).toEqual(
		Object.fromEntries(before.features.map((f) => [f.id, f])),
	);
	expect(await footprintSvg(after, options)).toBe(
		await footprintSvg(before, options),
	);
});

test("invalid grid intent fails explicitly with container or child source diagnostics", async () => {
	const base = await renderFootprintDeclarations(
		<Footprint
			name="bad-grid"
			source={{ file: "grid.tsx", line: 1 }}
			style={{
				display: "grid",
				width: "4mm",
				height: "2mm",
				gridTemplateColumns: ["2mm", "2mm"],
				gridTemplateRows: ["2mm"],
			}}
		>
			<Pad
				name="P"
				source={{ file: "pad.tsx", line: 8 }}
				layers={["front-copper"]}
				style={{ width: "1mm", height: "1mm", gridColumn: 1, gridRow: 1 }}
			/>
		</Footprint>,
	);
	const cases: [boolean, Record<string, unknown>, string][] = [
		[false, { gridTemplateColumns: undefined }, "nonempty array"],
		[false, { gridTemplateRows: [] }, "nonempty array"],
		[false, { gridTemplateColumns: "repeat(2, 2mm)" }, "nonempty array"],
		[false, { gridTemplateColumns: ["1fr"] }, "length requires"],
		[false, { gridTemplateColumns: ["0mm"] }, "positive"],
		[false, { gridTemplateColumns: [2] }, "physical-unit strings"],
		[false, { gridTemplateRows: ["3mm"] }, "exceed container"],
		[false, { gap: "1mm" }, "tracks and gaps exceed"],
		[false, { gap: "-1nm" }, "gap must not be negative"],
		[false, { justifyItems: "stretch" }, "stretch"],
		[false, { alignItems: "flex-start" }, "start, center, or end"],
		[false, { justifyContent: "center" }, "require display: flex"],
		[false, { flexDirection: "row" }, "require display: flex"],
		[false, { display: "flex" }, "grid container properties require"],
		[false, { gridAutoRows: "1mm" }, "unsupported style"],
		[false, { gridColumn: 1 }, "grid placement properties require"],
		[true, { gridColumn: undefined }, "requires explicit gridColumn"],
		[true, { gridRow: undefined }, "requires explicit gridRow"],
		[true, { gridColumn: 0 }, "positive integer"],
		[true, { gridRow: -1 }, "positive integer"],
		[true, { gridRow: 1.5 }, "positive integer"],
		[true, { gridColumn: "1 / 3" }, "positive integer"],
		[true, { gridColumn: 3 }, "outside the explicit grid"],
		[true, { gridColumnSpan: 3 }, "outside the explicit grid"],
		[true, { gridRowSpan: 0 }, "positive integer"],
		[true, { gridColumnSpan: 9007199254740991 }, "outside the explicit grid"],
		[true, { width: "3mm" }, "exceeds its assigned cell"],
		[true, { left: "0mm" }, "flow children cannot"],
		[
			true,
			{ position: "absolute", left: "0mm", top: "0mm" },
			"grid placement properties require",
		],
		[true, { gridTemplateRows: ["1mm"] }, "grid container properties require"],
		[true, { width: "3nm" }, "half-nanometre"],
	];
	for (const [child, patch, message] of cases) {
		const declaration = structuredClone(base);
		const node = child
			? assertDefined(declaration.root.children[0])
			: declaration.root;
		node.props.style = { ...(node.props.style as object), ...patch };
		try {
			await compileFootprint(declaration, options);
			throw new Error(`expected rejection: ${message}`);
		} catch (error) {
			expect(error).toBeInstanceOf(PcbCompileError);
			expect((error as Error).message).toContain(message);
			expect((error as PcbCompileError).diagnostic).toMatchObject({
				entity: child ? "bad-grid/P" : "bad-grid",
				source: { file: child ? "pad.tsx" : "grid.tsx" },
			});
		}
	}
});

test("a grid group can span a parent grid and nest inside a flex container", async () => {
	const inner = (
		<FootprintGroup
			style={{
				display: "grid",
				width: "4mm",
				height: "2mm",
				gridColumn: 1,
				gridColumnSpan: 2,
				gridRow: 1,
				gridTemplateColumns: ["1mm", "2mm"],
				gridTemplateRows: ["1mm"],
				gap: "0.5mm",
				justifyItems: "end",
				alignItems: "end",
			}}
		>
			<Pad
				name="P"
				layers={["front-copper"]}
				style={{ width: "1mm", height: "1mm", gridColumn: 2, gridRow: 1 }}
			/>
		</FootprintGroup>
	);
	const ir = await compileFootprint(
		<Footprint
			name="grid-grid"
			style={{
				display: "grid",
				width: "6mm",
				height: "4mm",
				gridTemplateColumns: ["3mm", "3mm"],
				gridTemplateRows: ["4mm"],
				justifyItems: "center",
				alignItems: "center",
			}}
		>
			{inner}
		</Footprint>,
		options,
	);
	expect(ir.features[0]?.at).toEqual([4000000, 1500000]);
	const flexGrid = await compileFootprint(
		<Footprint
			name="flex-grid"
			style={{
				display: "flex",
				width: "6mm",
				height: "4mm",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<FootprintGroup
				style={{
					display: "grid",
					width: "4mm",
					height: "2mm",
					gridTemplateColumns: ["1mm", "2mm"],
					gridTemplateRows: ["1mm"],
					gap: "0.5mm",
					justifyItems: "end",
					alignItems: "end",
				}}
			>
				<Pad
					name="P"
					layers={["front-copper"]}
					style={{ width: "1mm", height: "1mm", gridColumn: 2, gridRow: 1 }}
				/>
			</FootprintGroup>
		</Footprint>,
		options,
	);
	expect(flexGrid.features).toEqual(ir.features);
});
