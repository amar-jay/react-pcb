import type { Point, Rect } from "./types.ts";
import { assertFinite, assertPositive } from "../validation/index.ts";

export function point(x: number, y: number): Point {
	assertFinite(x, "point x");
	assertFinite(y, "point y");
	return Object.freeze({ x, y });
}

export function rect(
	x: number,
	y: number,
	width: number,
	height: number,
): Rect {
	assertFinite(x, "rectangle x");
	assertFinite(y, "rectangle y");
	assertPositive(width, "rectangle width");
	assertPositive(height, "rectangle height");
	return Object.freeze({ kind: "rect", x, y, width, height });
}
