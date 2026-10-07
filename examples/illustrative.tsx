import React from 'react';
import {
  Board,
  DifferentialPair,
  Keepout,
  Part,
  Route,
  RouteThrough,
  Zone,
  compile,
  net,
  pad,
  part,
  rect,
} from '@react-pcb/core';

const GND = net('GND');
const VBUS = net('VBUS');
const VCC_3V3 = net('3V3');
const USB_DP = net('USB_D+');
const USB_DM = net('USB_D-');

const U1 = part('U1');
const J1 = part('J1');
const C1 = part('C1');

export default function MyBoard() {
  return (
    <Board
      outline={rect(0, 0, 60, 40)}
      layers={4}
      metadata={{
        title: 'USB controller',
        revision: '0.1.0',
        description: 'Four-layer USB controller board',
      }}
    >
      <Part
        id={U1}
        mpn="STM32G0B1CBT6"
        footprint="LQFP-48"
        at={[30, 20]}
        connect={{VSS: GND, VDD: VCC_3V3, PA11: USB_DM, PA12: USB_DP}}
      />
      <Part
        id={J1}
        mpn="USB-C-RECEPTACLE"
        footprint="USB-C-16P"
        at={[5, 20]}
        connect={{GND, VBUS, DPlus: USB_DP, DMinus: USB_DM}}
      />
      <Part
        id={C1}
        value="100nF"
        footprint="0402"
        at={[27, 18]}
        connect={{1: VCC_3V3, 2: GND}}
      />

      <DifferentialPair
        positive={USB_DP}
        negative={USB_DM}
        width={0.18}
        gap={0.15}
        targetImpedance={90}
        from={[pad(J1, 'DPlus'), pad(J1, 'DMinus')]}
        to={[pad(U1, 'PA12'), pad(U1, 'PA11')]}
      >
        <RouteThrough region={rect(8, 16, 20, 8)} />
        <RouteThrough region={rect(24, 17, 4, 6)} />
      </DifferentialPair>

      <Route net={VCC_3V3} from={pad(C1, '1')} to={pad(U1, 'VDD')}>
        <RouteThrough region={rect(27, 17, 3, 3)} />
      </Route>

      <Zone net={GND} layers={['In1.Cu']} boundary="board" clearance={0.2} />
      <Keepout
        region={rect(0, 14, 8, 12)}
        disallow={['vias', 'copper']}
        except={[USB_DP, USB_DM]}
      />
    </Board>
  );
}

const result = await compile(<MyBoard />, {cwd: import.meta.dir + '/..'});
console.log(JSON.stringify(result, null, 2));
