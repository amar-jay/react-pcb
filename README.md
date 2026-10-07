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
  definePart,
  copperLayer,
  dielectricLayer,
  defineStackup,
  defineLayerSet,
  solderMaskLayer,
  pasteLayer,
  silkscreenLayer,
  mechanicalLayer,
  net,
  part,
  pad,
  point,
  rect,
} from '@react-pcb/core';
import {USB4105GFA} from './parts/USB4105GFA';

const frontCopper = copperLayer('F.Cu', {thickness: 0.035, role: 'signal'});
const groundPlane = copperLayer('In1.Cu', {thickness: 0.018, role: 'plane'});
const powerPlane = copperLayer('In2.Cu', {thickness: 0.018, role: 'plane'});
const backCopper = copperLayer('B.Cu', {thickness: 0.035, role: 'signal'});

const boardLayers = defineLayerSet({
  stackup: defineStackup([
    frontCopper,
    dielectricLayer('Prepreg 1', {material: 'FR-4', thickness: 0.18, epsilonR: 4.2}),
    groundPlane,
    dielectricLayer('Core', {material: 'FR-4', thickness: 1.0, epsilonR: 4.2}),
    powerPlane,
    dielectricLayer('Prepreg 2', {material: 'FR-4', thickness: 0.18, epsilonR: 4.2}),
    backCopper,
  ]),
  artwork: [
    solderMaskLayer('F.Mask', {side: 'front'}),
    solderMaskLayer('B.Mask', {side: 'back'}),
    pasteLayer('F.Paste', {side: 'front'}),
    pasteLayer('B.Paste', {side: 'back'}),
    silkscreenLayer('F.Silkscreen', {side: 'front'}),
    silkscreenLayer('B.Silkscreen', {side: 'back'}),
    mechanicalLayer('Edge.Cuts', {purpose: 'board-outline'}),
  ],
});

const STM32G0B1CBT6 = definePart({
  manufacturer: 'STMicroelectronics',
  mpn: 'STM32G0B1CBT6',
  package: 'LQFP48 7x7 mm',
  footprint: 'LQFP-48_7x7mm_P0.5mm',
  datasheet: {
    url: 'https://www.st.com/resource/en/datasheet/stm32g0b1cb.pdf',
    document: 'DS13560',
    revision: '6',
    page: 38,
  },
  pinoutCoverage: 'partial',
  pins: {
    'VDD/VDDA': {pad: '6', electricalType: 'power-input', required: true},
    'VSS/VSSA': {pad: '7', electricalType: 'power-input', required: true},
    PA11: {pad: '33', electricalType: 'bidirectional', functions: ['GPIO', 'USB_DM']},
    PA12: {pad: '34', electricalType: 'bidirectional', functions: ['GPIO', 'USB_DP']},
  },
});

const GND = net('GND');
const VBUS = net('VBUS');
const VCC_3V3 = net('3V3');
const USB_DP = net('USB_D+');
const USB_DM = net('USB_D-');
const USB_CC1 = net('USB_CC1');
const USB_CC2 = net('USB_CC2');

const U1 = part('U1');
const J1 = part('J1');
const C1 = part('C1');

export default function MyBoard() {
  return (
    <Board
      outline={rect(0, 0, 60, 40)}
      layers={boardLayers}
      metadata={{
        title: 'USB controller',
        revision: '0.1.0',
        description: 'Four-layer USB controller board',
      }}
    >
      <STM32G0B1CBT6
        id={U1}
        at={[30, 20]}
        connect={{
          'VSS/VSSA': GND,
          'VDD/VDDA': VCC_3V3,
          PA11: USB_DM,
          PA12: USB_DP,
        }}
      />

      <USB4105GFA
        id={J1}
        at={[5, 20]}
        connect={{
          GND,
          VBUS,
          CC1: USB_CC1,
          CC2: USB_CC2,
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

      <Route net={VCC_3V3} from={pad(C1, '1')} to={pad(U1, 'VDD/VDDA')}>
        <RouteThrough region={rect(27, 17, 3, 3)} />
      </Route>

      <Zone
        net={GND}
        layers={[groundPlane]}
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

**Illustrative PCB IR Tree**
```
PCB IR
├── board
│   ├── outline
│   ├── physical stackup
│   └── technical/fabrication layers
├── parts
│   ├── identity / BOM
│   ├── component definition
│   ├── placement
│   └── connectivity
├── nets
├── routeConstraints
└── diagnostics
```