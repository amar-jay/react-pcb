import React from 'react';
import {Footprint, Graphic, Pad, type FootprintStyle} from '@react-pcb/core';

export const LQFP48_FOOTPRINT_KEY = 'LQFP-48_7x7mm_P0.5mm';

// ST DS13560 Rev 6, Figure 44 (page 136). Integer micrometres,
// component-side view, body-centered origin, +y down. See docs/footprints/LQFP48.md.
function box(x: number, y: number, width: number, height: number): FootprintStyle {
  return {position: 'absolute', width: `${width}um`, height: `${height}um`,
    left: `${x - width / 2 + 5100}um`, top: `${y - height / 2 + 5100}um`};
}

export function LQFP48Footprint() {
  return <Footprint name={LQFP48_FOOTPRINT_KEY}
    style={{width: '10.2mm', height: '10.2mm', left: '-5.1mm', top: '-5.1mm'}}>
    {Array.from({length: 48}, (_, index) => {
      const side = Math.floor(index / 12);
      const along = -2750 + (index % 12) * 500;
      const [x, y]: [number, number] = side === 0 ? [-4250, along] : side === 1 ? [along, 4250]
        : side === 2 ? [4250, -along] : [-along, -4250];
      return <Pad key={index + 1} name={String(index + 1)}
        style={box(x, y, side % 2 === 0 ? 1200 : 300, side % 2 === 0 ? 300 : 1200)}
        layers={['front-copper', 'front-mask', 'front-paste']} />;
    })}
    <Graphic name="body" purpose="fabrication" layers={['front-fabrication']}
      style={box(0, 0, 7000, 7000)} stroke="0.1mm" />
    <Graphic name="pin-1-fabrication" purpose="fabrication" layers={['front-fabrication']}
      shape="circle" style={box(-2900, -2900, 400, 400)} />
    <Graphic name="courtyard" purpose="courtyard" layers={['front-courtyard']}
      style={box(0, 0, 10200, 10200)} stroke="0.05mm" />
    {([-1, 1] as const).flatMap(x => ([-1, 1] as const).map(y => <React.Fragment key={`${x}/${y}`}>
      <Graphic name={`silk-${x}-${y}-horizontal`} purpose="silkscreen" layers={['front-silkscreen']}
        style={box(x * 3385, y * 3610, 570, 120)} />
      <Graphic name={`silk-${x}-${y}-vertical`} purpose="silkscreen" layers={['front-silkscreen']}
        style={box(x * 3610, y * 3385, 120, 570)} />
    </React.Fragment>))}
    <Graphic name="pin-1-silkscreen" purpose="silkscreen" layers={['front-silkscreen']}
      shape="circle" style={box(-4250, -3450, 350, 350)} />
  </Footprint>;
}
