The proposal is a declarative, constraint-driven PCB design framework in which engineers describe the electrical and physical intent of a board (components, nets, placement, stackup, differential pairs, impedance targets, keepouts, copper zones, routing corridors, clearances, and other constraints) using a composable JSX/TypeScript API, rather than manually drawing the final PCB geometry. Components and nets are first-class objects, while constructs such as DifferentialPair, RouteThrough, and Keepout specify requirements that a placement-and-routing engine must satisfy. The underlying compiler would resolve these constraints into concrete component positions, traces, vias, copper geometry, and ultimately manufacturing outputs such as Gerbers, effectively treating PCB design more like physical synthesis: the engineer specifies what the board must satisfy, and the system determines how to realize it.

**Illustrative JSX API**

```tsx
import {
  Board,
  DifferentialPair,
  Keepout,
  Module,
  Part,
  Route,
  RouteThrough,
  Zone,
  copperLayer,
  defineLayerSet,
  defineStackup,
  dielectricLayer,
  mechanicalLayer,
  pad,
  pasteLayer,
  rect,
  silkscreenLayer,
  solderMaskLayer,
  useNet,
  usePart,
  type PartProps,
} from '@react-pcb/core';
import {STM32G0B1CBT6} from './parts/STM32G0B1CBT6';
import {USB4105GFA} from './parts/USB4105GFA';

const frontCopper = copperLayer({thickness: 0.035, usage: 'signal'});
const groundPlane = copperLayer({thickness: 0.018, usage: 'plane'});
const powerPlane = copperLayer({thickness: 0.018, usage: 'plane'});
const backCopper = copperLayer({thickness: 0.035, usage: 'signal'});

const boardLayers = defineLayerSet({
  stackup: defineStackup([
    frontCopper,
    dielectricLayer({material: 'FR-4', thickness: 0.18, epsilonR: 4.2, lossTangent: 0.02}),
    groundPlane,
    dielectricLayer({material: 'FR-4', thickness: 1.0, epsilonR: 4.2, lossTangent: 0.02}),
    powerPlane,
    dielectricLayer({material: 'FR-4', thickness: 0.18, epsilonR: 4.2, lossTangent: 0.02}),
    backCopper,
  ]),
  technical: [
    solderMaskLayer({side: 'front', expansion: 0.05}),
    solderMaskLayer({side: 'back', expansion: 0.05}),
    pasteLayer({side: 'front'}),
    pasteLayer({side: 'back'}),
    silkscreenLayer({side: 'front', color: 'white'}),
    silkscreenLayer({side: 'back', color: 'white'}),
    mechanicalLayer({purpose: 'assembly', side: 'front'}),
  ],
});

type Net = PartProps['connect'][string];

type UsbControllerProps = {
  ground: Net;
  supply: Net;
  vbus: Net;
};

function UsbController({ground, supply, vbus}: UsbControllerProps) {
  const dataPlus = useNet('USB_D+');
  const dataMinus = useNet('USB_D-');
  const cc1 = useNet('CC1');
  const cc2 = useNet('CC2');
  const mcu = usePart('U1');
  const connector = usePart('J1');
  const decoupling = usePart('C1');

  return (
    <>
      <STM32G0B1CBT6
        id={mcu}
        at={[30, 20]}
        connect={{'VSS/VSSA': ground, 'VDD/VDDA': supply, PA11: dataMinus, PA12: dataPlus}}
      />
      <USB4105GFA
        id={connector}
        at={[5, 20]}
        rotation={270}
        connect={{GND: ground, VBUS: vbus, CC1: cc1, CC2: cc2, DPlus: dataPlus, DMinus: dataMinus}}
      />
      <Part
        id={decoupling}
        value="100nF"
        footprint="0402"
        at={[27, 18]}
        connect={{1: supply, 2: ground}}
      />

      <DifferentialPair
        positive={dataPlus}
        negative={dataMinus}
        width={0.18}
        gap={0.15}
        targetImpedance={90}
        from={[pad(connector, 'DPlus'), pad(connector, 'DMinus')]}
        to={[pad(mcu, 'PA12'), pad(mcu, 'PA11')]}
      >
        <RouteThrough region={rect(8, 16, 20, 8)} />
        <RouteThrough region={rect(24, 17, 4, 6)} />
      </DifferentialPair>

      <Route net={supply} from={pad(decoupling, '1')} to={pad(mcu, 'VDD/VDDA')}>
        <RouteThrough region={rect(27, 17, 3, 3)} />
      </Route>
    </>
  );
}

export default function MyBoard() {
  const ground = useNet('GND');
  const vbus = useNet('VBUS');
  const supply = useNet('3V3');

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
      <Module name="usb-controller">
        <UsbController ground={ground} supply={supply} vbus={vbus} />
      </Module>
      <Zone net={ground} layers={[groundPlane]} boundary="board" clearance={0.2} />
      <Keepout region={rect(0, 14, 8, 12)} disallow={['vias', 'copper']} />
    </Board>
  );
}
```

The first step is to design a tool-independent PCB IR that serves as the canonical representation of a board. The IR should describe the board without depending on JSX, a particular autorouter, KiCad, Gerber, or any PCB manufacturer. Definitions live once in `componentDefinitions`; placed occurrences live in `componentInstances` and reference a definition by key. Five equal capacitors therefore produce one definition and five instances. The compiler rejects two different definitions that claim the same key. The BOM is derivable directly from the definitions and their instances rather than maintained as a separate source of truth.

The IR should also contain the board outline and physical stackup, pads, nets, design rules, copper zones, keepouts, routing and electrical constraints such as differential pairs and impedance requirements, and any physical geometry that has already been explicitly resolved. Initially, the goal is not to implement routing or manufacturing output, but to define a sufficiently complete and stable representation so that future frontends can compile designs into it and future tools—autorouters, simulators, validators, exporters, and manufacturing backends—can operate on the same IR without changing its fundamental model.

**Illustrative PCB IR Tree**
```
PCB IR
├── units
├── board
│   ├── outline
│   ├── physical stackup
│   └── technical/fabrication layers
├── componentDefinitions
│   └── reusable definition by MPN or primitive key
├── componentInstances
│   ├── instance identity
│   ├── definition reference
│   ├── placement
│   └── connectivity
├── nets
├── routeConstraints
└── diagnostics
```
