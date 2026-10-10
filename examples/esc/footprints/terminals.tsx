import React from 'react';
import {Footprint, Graphic, Pad} from '@react-pcb/core';
import {box, Documentation} from './shared.tsx';

// KiCad's official AMASS XT30UPB-M reference, translated to a midpoint origin.
// The housing's chamfer is conservatively enclosed by a fabrication rectangle.
export function XT30UPBFootprint() {
  return <Footprint name="esc:amass-xt30upb-m" style={{width: '12mm', height: '7mm'}}>
    <Pad name="1" shape="rect" layers={['all-copper']} drill={{diameter: '1.8mm', plated: true}}
      style={box(-2500, 0, 3000, 3000)} />
    <Pad name="2" shape="circle" layers={['all-copper']} drill={{diameter: '1.8mm', plated: true}}
      style={box(2500, 0, 3000, 3000)} />
    {[-2500, 2500].map((x, index) => <Graphic key={index} name={`mask-${index + 1}`} purpose="mask-opening"
      shape={index === 0 ? 'rect' : 'circle'} layers={['all-mask']} style={box(x, 0, 3100, 3100)} />)}
    <Documentation width={10200} height={5200} courtyardWidth={11400} courtyardHeight={6400} />
    <Graphic name="back-courtyard" purpose="courtyard" layers={['back-courtyard']}
      style={box(0, 0, 8700, 3700)} stroke="0.05mm" />
    <Graphic name="minus" purpose="silkscreen" layers={['front-silkscreen']} style={box(-2500, -2200, 800, 120)} />
    <Graphic name="plus-horizontal" purpose="silkscreen" layers={['front-silkscreen']} style={box(2500, -2200, 800, 120)} />
    <Graphic name="plus-vertical" purpose="silkscreen" layers={['front-silkscreen']} style={box(2500, -2200, 120, 800)} />
  </Footprint>;
}

// Board-owned solder terminal, not a purchased component with a datasheet.
export function PhaseTerminalFootprint() {
  return <Footprint name="esc:motor-wire-terminal-1.8mm" style={{width: '5mm', height: '5mm'}}>
    <Pad name="P" shape="circle" layers={['all-copper']} drill={{diameter: '1.8mm', plated: true}}
      style={box(0, 0, 3400, 3400)} />
    <Graphic name="mask" purpose="mask-opening" shape="circle" layers={['all-mask']}
      style={box(0, 0, 3500, 3500)} />
    <Graphic name="courtyard" purpose="courtyard" layers={['front-courtyard', 'back-courtyard']}
      style={box(0, 0, 3900, 3900)} stroke="0.05mm" />
  </Footprint>;
}
