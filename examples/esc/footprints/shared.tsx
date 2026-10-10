import React from 'react';
import {Graphic, type FootprintStyle} from '@react-pcb/core';

// Integer micrometres; component-side view, +x right and +y down.
// Roots start at (0, 0); absolute children may extend on either side of it.
export function box(x: number, y: number, width: number, height: number): FootprintStyle {
  return {position: 'absolute', left: `${x - width / 2}um`, top: `${y - height / 2}um`,
    width: `${width}um`, height: `${height}um`};
}

export function Documentation({width, height, courtyardWidth, courtyardHeight, y = 0}: {
  width: number; height: number; courtyardWidth: number; courtyardHeight: number; y?: number;
}) {
  return <>
    <Graphic name="body" purpose="fabrication" layers={['front-fabrication']}
      style={box(0, 0, width, height)} stroke="0.1mm" />
    <Graphic name="courtyard" purpose="courtyard" layers={['front-courtyard']}
      style={box(0, y, courtyardWidth, courtyardHeight)} stroke="0.05mm" />
  </>;
}

export function SmdOpenings({name, x, y, width, height}: {
  name: string; x: number; y: number; width: number; height: number;
}) {
  return <>
    <Graphic name={`mask-${name}`} purpose="mask-opening" layers={['front-mask']}
      style={box(x, y, width + 100, height + 100)} />
    <Graphic name={`paste-${name}`} purpose="paste-opening" layers={['front-paste']}
      style={box(x, y, width - 100, height - 100)} />
  </>;
}
