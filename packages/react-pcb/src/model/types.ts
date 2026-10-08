import type {ReactNode} from 'react';

export type Children = {children?: ReactNode};
export type Point = Readonly<{x: number; y: number}>;
export type Rect = Readonly<{kind: 'rect'; x: number; y: number; width: number; height: number}>;
export type Region = Rect;
export type Net = Readonly<{kind: 'net'; id: string; name: string}>;
export type Part = Readonly<{kind: 'part'; id: string; reference: string}>;
export type Pin = Readonly<{kind: 'pin'; part: Part; name: string}>;
