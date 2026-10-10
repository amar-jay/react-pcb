import React, { type ReactNode } from "react";
import { type DeclarationNode, renderDeclarations } from "../renderer/index.ts";
import type {
	FeaturePurpose,
	FootprintRole,
	PhysicalLength,
} from "./physical.ts";

export type FootprintSource = Readonly<{
	file: string;
	line?: number;
	column?: number;
}>;
export type FootprintTransform = Readonly<{
	translate?: readonly [PhysicalLength, PhysicalLength];
	rotate?: 0 | 90 | 180 | 270;
	reflectX?: boolean;
	reflectY?: boolean;
}>;
/** Fixed boxes only. Unsupported CSS is diagnosed by Rust, never ignored. */
export type FootprintStyle = Readonly<{
	position?: "absolute";
	display?: "flex" | "grid";
	flexDirection?: "row" | "column";
	gap?: PhysicalLength;
	justifyContent?: "flex-start" | "center" | "flex-end";
	alignItems?: "flex-start" | "center" | "flex-end" | "start" | "end";
	gridTemplateColumns?: readonly PhysicalLength[];
	gridTemplateRows?: readonly PhysicalLength[];
	justifyItems?: "start" | "center" | "end";
	gridColumn?: number;
	gridRow?: number;
	gridColumnSpan?: number;
	gridRowSpan?: number;
	width: PhysicalLength;
	height: PhysicalLength;
	left?: PhysicalLength;
	top?: PhysicalLength;
	right?: PhysicalLength;
	bottom?: PhysicalLength;
	borderRadius?: PhysicalLength;
	transform?: FootprintTransform;
}>;
type Common = {
	name?: string;
	style: FootprintStyle;
	source?: FootprintSource;
};
type Container = Common & { children?: ReactNode };
export type FootprintProps = Container & { name: string };
export type FootprintGroupProps = Container;
export type PadProps = Common & {
	shape?: "rect" | "rounded-rect" | "circle" | "oval";
	layers: readonly FootprintRole[];
	drill?: Readonly<{
		diameter: PhysicalLength;
		slot?: readonly [PhysicalLength, PhysicalLength];
		plated: boolean;
	}>;
};
export type HoleProps = Common & { plated: boolean };
export type GraphicProps = Common & {
	purpose: Exclude<FeaturePurpose, "pad" | "plated-hole" | "non-plated-hole">;
	shape?: PadProps["shape"];
	layers: readonly FootprintRole[];
	stroke?: PhysicalLength;
};
export function Footprint({ children, ...props }: FootprintProps) {
	return React.createElement("fp-footprint", props, children);
}
export function FootprintGroup({ children, ...props }: FootprintGroupProps) {
	return React.createElement("fp-group", props, children);
}
export function Pad(props: PadProps) {
	return React.createElement("fp-pad", props);
}
export function Hole(props: HoleProps) {
	return React.createElement("fp-hole", props);
}
export function Graphic(props: GraphicProps) {
	return React.createElement("fp-graphic", props);
}

/** Versioned frontend intent, independent of the final physical footprint schema. */
export type FootprintDeclarations = Readonly<{
	protocolVersion: 1;
	kind: "footprint-declarations";
	root: DeclarationNode;
}>;
export async function renderFootprintDeclarations(
	element: ReactNode,
): Promise<FootprintDeclarations> {
	const tree = await renderDeclarations(element);
	if (tree.children.length !== 1 || tree.children[0]?.type !== "fp-footprint") {
		throw new Error("footprint JSX must contain exactly one Footprint root");
	}
	// Snapshot the renderer's values and reject values JSON would silently discard.
	const json = JSON.stringify(tree.children[0], (_key, value: unknown) => {
		if (
			typeof value === "function" ||
			typeof value === "symbol" ||
			typeof value === "bigint" ||
			(typeof value === "number" && !Number.isFinite(value))
		) {
			throw new Error(
				"footprint declarations must contain serializable finite values",
			);
		}
		return value;
	});
	return {
		protocolVersion: 1,
		kind: "footprint-declarations",
		root: JSON.parse(json) as DeclarationNode,
	};
}
