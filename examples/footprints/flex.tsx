import React from 'react';
import {Footprint, FootprintGroup, Graphic, Pad} from '@react-pcb/core';

// Small analytic fixtures; dimensions are illustrative land patterns.
export function Flex0402() {
  return <Footprint name="example:flex-0402" style={{width: '1.6mm', height: '0.7mm', left: '-0.8mm', top: '-0.35mm', display: 'flex', gap: '0.4mm'}}>
    <Pad name="1" style={{width: '0.6mm', height: '0.7mm'}} layers={['front-copper', 'front-mask', 'front-paste']} />
    <Pad name="2" style={{width: '0.6mm', height: '0.7mm'}} layers={['front-copper', 'front-mask', 'front-paste']} />
  </Footprint>;
}

export function FlexSoicRow() {
  return <Footprint name="example:flex-soic-row" style={{width: '4mm', height: '5.21mm', left: '-2mm', top: '-2.605mm'}}>
    <FootprintGroup style={{position: 'absolute', width: '1.5mm', height: '5.21mm', left: '0mm', top: '0mm', display: 'flex', flexDirection: 'column', gap: '0.62mm', justifyContent: 'center', alignItems: 'center'}}>
      {[1, 2, 3, 4].map(n => <Pad key={n} name={String(n)} layers={['front-copper', 'front-mask', 'front-paste']} style={{width: '1.5mm', height: '0.65mm'}} />)}
    </FootprintGroup>
    <Graphic name="body" purpose="fabrication" layers={['front-fabrication']} stroke="0.1mm"
      style={{position: 'absolute', width: '2mm', height: '5mm', right: '0mm', top: '0.105mm'}} />
  </Footprint>;
}
