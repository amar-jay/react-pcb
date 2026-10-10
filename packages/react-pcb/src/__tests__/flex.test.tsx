import { expect, test } from "bun:test";
import {
	Flex0402,
	FlexSoicRow,
} from "../../../../examples/basic/footprints/flex.tsx";
import {
	Board,
	compile,
	compileFootprint,
	definePhysicalFootprint,
	Footprint,
	FootprintGroup,
	type FootprintStyle,
	footprintSvg,
	Graphic,
	net,
	Pad,
	Part,
	PcbCompileError,
	part,
	rect,
	renderFootprintDeclarations,
} from "../index.ts";
import { assertDefined, testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };

test("flex passive equals explicit geometry, round trips and resolves board instances", async () => {
	const explicit = definePhysicalFootprint({
		key: "example:flex-0402",
		features: [
			{
				id: "1",
				purpose: "pad",
				at: ["-0.5mm", "0mm"],
				shape: { kind: "rect", size: ["0.6mm", "0.7mm"] },
				layers: ["front-copper", "front-mask", "front-paste"],
			},
			{
				id: "2",
				purpose: "pad",
				at: ["0.5mm", "0mm"],
				shape: { kind: "rect", size: ["0.6mm", "0.7mm"] },
				layers: ["front-copper", "front-mask", "front-paste"],
			},
		],
	});
	const declaration = await renderFootprintDeclarations(<Flex0402 />);
	const ir = await compileFootprint(declaration, options);
	expect(ir).toEqual(await compileFootprint(explicit, options));
	expect(
		await compileFootprint(JSON.parse(JSON.stringify(declaration)), options),
	).toEqual(ir);
	expect(await footprintSvg(ir, options)).toBe(
		await footprintSvg(await compileFootprint(<Flex0402 />, options), options),
	);
	expect(JSON.stringify(ir)).not.toContain("style");
	const board = await compile(
		<Board layers={testLayers} outline={rect(0, 0, 20, 20)}>
			<Part
				id={part("C1")}
				at={[10, 10]}
				footprint={declaration}
				connect={{ 1: net("GND") }}
			/>
			<Part
				id={part("C2")}
				at={[10, 10]}
				footprint={ir}
				side="back"
				connect={{ 1: net("GND") }}
			/>
		</Board>,
		options,
	);
	expect(board.ir.parts[0]?.physicalFeatures["1"]?.geometry.at).toEqual([
		9500000, 10000000,
	]);
	expect(board.ir.parts[1]?.physicalFeatures["1"]?.geometry.at).toEqual([
		10500000, 10000000,
	]);
});

test("SOIC column has independently calculated 1.27 mm pitch and exact bounds", async () => {
	const ir = await compileFootprint(<FlexSoicRow />, options);
	const pads = ir.features.filter((f) => f.purpose === "pad");
	expect(pads.map((f) => f.at)).toEqual([
		[-1250000, -1905000],
		[-1250000, -635000],
		[-1250000, 635000],
		[-1250000, 1905000],
	]);
	expect(
		pads.every(
			(f) =>
				f.shape.kind === "rect" &&
				f.shape.size[0] === 1500000 &&
				f.shape.size[1] === 650000,
		),
	).toBe(true);
	expect(ir.features).toHaveLength(5);
	expect(ir.bounds).toEqual({
		min2: [-4000000, -5100000],
		max2: [4100000, 5100000],
	});
});

test("row and column alignment use fixed untransformed boxes with mixed units", async () => {
	for (const direction of ["row", "column"] as const) {
		for (const [alignment, main, cross] of [
			["flex-start", [1, 4], [1, 2]],
			["center", [3.5, 6.5], [4, 4]],
			["flex-end", [6, 9], [7, 6]],
		] as const) {
			const row = direction === "row";
			const ir = await compileFootprint(
				<Footprint
					name="align"
					style={{
						display: "flex",
						flexDirection: direction,
						width: row ? "10mm" : "8mm",
						height: row ? "8mm" : "10mm",
						gap: "1000um",
						justifyContent: alignment,
						alignItems: alignment,
					}}
				>
					<Pad
						name="1"
						layers={["front-copper"]}
						style={{ width: row ? "2000000nm" : "2mm", height: "2mm" }}
					/>
					<Pad
						name="2"
						layers={["front-copper"]}
						style={{ width: row ? "2mm" : "4mm", height: row ? "4mm" : "2mm" }}
					/>
				</Footprint>,
				options,
			);
			expect(ir.features.map((f) => f.at)).toEqual(
				main.map((m, i) =>
					row
						? ([m * 1000000, assertDefined(cross[i]) * 1000000] as const)
						: ([assertDefined(cross[i]) * 1000000, m * 1000000] as const),
				),
			);
		}
	}
});

test("absolute graphics and unnamed wrappers do not change pad pitch or anonymous identity", async () => {
	const make = (bodyFirst: boolean, wrapper: boolean) => {
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
		const pads = [0, 1].map((n) => (
			<Pad
				key={`pad-${n}`}
				layers={["front-copper"]}
				style={{ width: "0.6mm", height: "0.7mm" }}
			/>
		));
		const contents = bodyFirst ? [body, ...pads] : [...pads, body];
		const flexStyle: FootprintStyle = {
			display: "flex",
			width: "1.6mm",
			height: "0.7mm",
			gap: "0.4mm",
		};
		return (
			<Footprint
				name="identity"
				style={wrapper ? { width: "1.6mm", height: "0.7mm" } : flexStyle}
			>
				{wrapper ? (
					<FootprintGroup
						style={{
							...flexStyle,
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
	expect(
		before.features.filter((f) => f.purpose === "pad").map((f) => f.at),
	).toEqual([
		[300000, 350000],
		[1300000, 350000],
	]);
	expect(await footprintSvg(before, options)).toBe(
		await footprintSvg(after, options),
	);
});

test("nested flex transforms and centered odd dimensions retain exact coordinates", async () => {
	const ir = await compileFootprint(
		<Footprint
			name="nested-flex"
			style={{
				display: "flex",
				width: "10mm",
				height: "8mm",
				justifyContent: "center",
				alignItems: "center",
				transform: { rotate: 90, reflectX: true },
			}}
		>
			<FootprintGroup
				style={{
					display: "flex",
					width: "4mm",
					height: "2mm",
					gap: "1mm",
					alignItems: "center",
					transform: { rotate: 90 },
				}}
			>
				<Pad
					name="1"
					layers={["front-copper"]}
					style={{ width: "1mm", height: "1mm" }}
				/>
				<Pad
					name="2"
					layers={["front-copper"]}
					style={{
						width: "1mm",
						height: "1mm",
						transform: { translate: ["0.2mm", "0mm"] },
					}}
				/>
			</FootprintGroup>
		</Footprint>,
		options,
	);
	expect(ir.features.map((f) => [f.at, f.rotation])).toEqual([
		[[6500000, 4000000], 180],
		[[4300000, 4000000], 180],
	]);
	const odd = await compileFootprint(
		<Footprint
			name="odd"
			style={{
				display: "flex",
				width: "10nm",
				height: "10nm",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<Pad
				name="P"
				layers={["front-copper"]}
				style={{ width: "3nm", height: "3nm" }}
			/>
		</Footprint>,
		options,
	);
	expect(odd.features[0]?.at).toEqual([5, 5]);
	expect(odd.bounds).toEqual({ min2: [7, 7], max2: [13, 13] });
});

test("invalid flex input fails with scoped diagnostics and never silently shrinks or rounds", async () => {
	const base = await renderFootprintDeclarations(
		<Footprint
			name="bad-flex"
			source={{ file: "flex.tsx", line: 1 }}
			style={{ display: "flex", width: "4mm", height: "2mm" }}
		>
			<Pad
				name="P"
				source={{ file: "pad.tsx", line: 9 }}
				layers={["front-copper"]}
				style={{ width: "1mm", height: "1mm" }}
			/>
		</Footprint>,
	);
	const cases: [boolean, Record<string, unknown>, string][] = [
		[false, { display: "block" }, "display must be flex"],
		[false, { flexDirection: "row-reverse" }, "row or column"],
		[false, { gap: "-1mm" }, "gap must not be negative"],
		[false, { gap: "1px" }, "length requires"],
		[false, { justifyContent: "space-between" }, "distributed spacing"],
		[false, { alignItems: "stretch" }, "stretch"],
		[false, { flexWrap: "wrap" }, "unsupported style"],
		[false, { display: undefined, gap: "1mm" }, "require display"],
		[true, { width: "5mm" }, "main-axis size"],
		[true, { height: "3mm" }, "cross-axis size"],
		[true, { width: "0mm" }, "positive"],
		[true, { left: "0mm" }, "flow children cannot"],
		[true, { position: "relative" }, "position: absolute"],
		[true, { display: "flex" }, "only containers"],
		[true, { flexGrow: 1 }, "unsupported style"],
		[true, { width: "3nm" }, "half-nanometre"],
		[true, { width: "9007199254740992nm" }, "exact JSON"],
		[true, { width: undefined }, "width must be a string"],
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
			const diagnostic = (error as PcbCompileError).diagnostic;
			// Main-axis overflow involves all flow children and belongs to the container.
			const container = !child || message === "main-axis size";
			expect(diagnostic.entity).toBe(container ? "bad-flex" : "bad-flex/P");
			expect(diagnostic.source?.file).toBe(container ? "flex.tsx" : "pad.tsx");
		}
	}
	const gaps = structuredClone(base);
	gaps.root.props.style = { ...(gaps.root.props.style as object), gap: "3mm" };
	const second = structuredClone(assertDefined(gaps.root.children[0]));
	second.props.name = "Q";
	gaps.root.children.push(second);
	await expect(compileFootprint(gaps, options)).rejects.toThrow(
		"children and gaps exceed",
	);
});
