import {ReactNode} from 'react';

type ChildrenType = {children?: ReactNode};
type PointType = Readonly<{x: number; y: number}>;
type RectType = Readonly<{kind: 'rect'; x: number; y: number; width: number; height: number}>;
type RegionType = RectType;
type NetType = Readonly<{kind: 'net'; id: string; name: string}>;
type PartType = Readonly<{kind: 'part'; id: string; reference: string}>;
type PinType = Readonly<{kind: 'pin'; part: PartType; name: string}>;

export type Children = ChildrenType;
export type Point = PointType;
export type Rect = RectType;
export type Region = RegionType;
export type Net = NetType;
export type Part = PartType;
export type Pin = PinType;

declare global {
	type Children = ChildrenType;
	type Point = PointType;
	type Rect = RectType;
	type Region = RegionType;
	type Net = NetType;
	type Part = PartType;
	type Pin = PinType;
}