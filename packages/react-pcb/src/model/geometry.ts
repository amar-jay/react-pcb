import type {Point, Rect} from './types.ts';

export function point(x: number, y: number): Point {
  return Object.freeze({x, y});
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return Object.freeze({kind: 'rect', x, y, width, height});
}
