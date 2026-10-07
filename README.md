The proposal is a declarative, constraint-driven PCB design framework in which engineers describe the electrical and physical intent of a board (components, nets, placement, stackup, differential pairs, impedance targets, keepouts, copper zones, routing corridors, clearances, and other constraints) using a composable JSX/TypeScript API, rather than manually drawing the final PCB geometry. Components and nets are first-class objects, while constructs such as DifferentialPair, RouteThrough, and Keepout specify requirements that a placement-and-routing engine must satisfy. The underlying compiler would resolve these constraints into concrete component positions, traces, vias, copper geometry, and ultimately manufacturing outputs such as Gerbers, effectively treating PCB design more like physical synthesis: the engineer specifies what the board must satisfy, and the system determines how to realize it.

**Illustrative JSX API**

```jsx
import {
  Board,
  Part,
  Route,
  RouteThrough,
  DifferentialPair,
  Zone,
  Keepout,
  Via,
  net,
  part,
  pad,
  point,
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
      layers={['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']}
    >
      <Part
        id={U1}
        mpn="STM32G0B1CBT6"
        footprint="LQFP-48"
        at={[30, 20]}
        connect={{
          VSS: GND,
          VDD: VCC_3V3,
          PA11: USB_DM,
          PA12: USB_DP,
        }}
      />

      <Part
        id={J1}
        mpn="USB-C-RECEPTACLE"
        footprint="USB-C-16P"
        at={[5, 20]}
        connect={{
          GND: GND,
          VBUS: VBUS,
          DPlus: USB_DP,
          DMinus: USB_DM,
        }}
      />

      <Part
        id={C1}
        value="100nF"
        footprint="0402"
        at={[27, 18]}
        connect={{
          1: VCC_3V3,
          2: GND,
        }}
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

      <Zone
        net={GND}
        layers={['In1.Cu']}
        boundary="board"
        clearance={0.2}
      />

      <Keepout
        region={rect(0, 14, 8, 12)}
        disallow={['vias', 'copper']}
        except={[USB_DP, USB_DM]}
      />
    </Board>
  );
}
```

The first step is to design a tool-independent PCB IR that serves as the canonical representation of a board. The IR should describe the board without depending on JSX, a particular autorouter, KiCad, Gerber, or any PCB manufacturer. It should contain the board outline and layer stack, components and their exact selected parts (manufacturer, MPN, supplier/SKU and relevant specifications), footprints, pads, nets and connectivity, component placement, design rules, copper zones, keepouts, routing and electrical constraints such as differential pairs and impedance requirements, and any physical geometry that has already been explicitly resolved. The BOM should be derivable directly from the component and part information stored in the IR rather than maintained as a separate source of truth. Initially, the goal is not to implement routing or manufacturing output, but to define a sufficiently complete and stable representation so that future frontends can compile designs into it and future tools—autorouters, simulators, validators, exporters, and manufacturing backends—can operate on the same IR without changing its fundamental model.