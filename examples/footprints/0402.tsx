import React from 'react';
import {Footprint, FootprintGroup, Pad, type FootprintStyle} from '@react-pcb/core';

// Illustrative fixture: verify actual manufacturer land patterns before fabrication.
const padStyle: FootprintStyle = {
  position: 'absolute', width: '0.6mm', height: '0.7mm', left: '0mm', top: '0mm',
};
export function Positioned0402() {
  return <Footprint name="example:positioned-0402" style={{width: '1.6mm', height: '0.7mm', left: '-0.8mm', top: '-0.35mm'}}>
    <FootprintGroup style={{position: 'absolute', width: '1.6mm', height: '0.7mm', left: '0mm', top: '0mm'}}>
      <Pad name="1" style={padStyle} layers={['front-copper', 'front-mask', 'front-paste']} />
      <Pad name="2" style={{...padStyle, right: '0mm', left: undefined}} layers={['front-copper', 'front-mask', 'front-paste']} />
    </FootprintGroup>
  </Footprint>;
}
