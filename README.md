The proposal is a declarative, constraint-driven PCB design framework in which engineers describe the electrical and physical intent of a board (components, nets, placement, stackup, differential pairs, impedance targets, keepouts, copper zones, routing corridors, clearances, and other constraints) using a composable JSX/TypeScript API, rather than manually drawing the final PCB geometry. Components and nets are first-class objects, while constructs such as DifferentialPair, RouteThrough, and Keepout specify requirements that a placement-and-routing engine must satisfy. The underlying compiler would resolve these constraints into concrete component positions, traces, vias, copper geometry, and ultimately manufacturing outputs such as Gerbers, effectively treating PCB design more like physical synthesis: the engineer specifies what the board must satisfy, and the system determines how to realize it.

Declarative footprint authoring is implemented through all six planned phases.
Footprints support exact physical units, absolute positioning, fixed Flexbox and
Grid layouts, deterministic SVG inspection, and explicit manufacturing profiles.
See the [physical/layout contract](docs/physical-footprints.md),
[manufacturing checks and coverage](docs/manufacturing-validation.md), and
[completion audit](docs/plan-completion.md) for the supported behavior and evidence.
The broader routing and fabrication synthesis described above remains future work.

```sh
bun install --frozen-lockfile
bun run check
bun run example
bun run board:inspect examples/basic.tsx --out /tmp/react-pcb-footprints
```

The basic example compiles three physical footprint definitions and returns scoped
footprint and board manufacturing reports. Board checks enforce placed copper
spacing and same-side inter-part courtyard reservations using the selected profile.
The inspection command derives unique footprints directly from the compiled board,
writes their canonical JSON and SVG alongside the board-selected manufacturing
reports, and generates an offline `index.html` with search and semantic layer toggles.
Examples need no separate inspection script or footprint list.
Illustrative dimensions and limits do not establish fabrication approval.

The [ESC footprint example](examples/esc/README.md) adds real component identities,
eight physical footprint definitions. Run `bun run example:esc` or generate its
gallery with `bun run board:inspect examples/esc/index.tsx --out dist/esc-inspect`.
The gallery retains the board’s selected reports; the ESC board currently selects
no manufacturing profile. Its documentation records datasheet dimensions,
authored aperture choices, source gaps, and the remaining electrical design.

To view board JSX in a browser or export one offline HTML file:

```sh
bun run board:dev examples/basic.tsx
bun run board:build examples/basic.tsx --out dist/index.html
```

The [`@react-pcb/preview` package](packages/preview/README.md) owns the board viewer,
HTML export, and local preview server. It includes layer toggles, zoom/pan, part
inspection, searchable parts, net highlighting, and compiler/manufacturing
diagnostics in a responsive React UI with light/dark themes and Amarjay shadcn
controls. Dev mode uses Bun's HTML bundler for UI HMR and reloads imported footprint changes
and shows compile errors while keeping the last valid board. See the
[board preview guide](docs/board-preview.md) for entry exports, watch options and
the programmatic API.

`bun run preview:build` builds the React site shell into `dist/`.

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

const frontCopper = copperLayer({id: 'copper/1', thickness: 0.035, usage: 'signal'});
const groundPlane = copperLayer({id: 'copper/2', thickness: 0.018, usage: 'plane'});
const powerPlane = copperLayer({id: 'copper/3', thickness: 0.018, usage: 'plane'});
const backCopper = copperLayer({id: 'copper/4', thickness: 0.035, usage: 'signal'});

const boardLayers = defineLayerSet({
  stackup: defineStackup([
    frontCopper,
    dielectricLayer({id: 'dielectric/1', material: 'FR-4', thickness: 0.18, epsilonR: 4.2, lossTangent: 0.02}),
    groundPlane,
    dielectricLayer({id: 'dielectric/2', material: 'FR-4', thickness: 1.0, epsilonR: 4.2, lossTangent: 0.02}),
    powerPlane,
    dielectricLayer({id: 'dielectric/3', material: 'FR-4', thickness: 0.18, epsilonR: 4.2, lossTangent: 0.02}),
    backCopper,
  ]),
  technical: [
    solderMaskLayer({id: 'solder-mask/front', side: 'front', expansion: 0.05}),
    solderMaskLayer({id: 'solder-mask/back', side: 'back', expansion: 0.05}),
    pasteLayer({id: 'paste/front', side: 'front'}),
    pasteLayer({id: 'paste/back', side: 'back'}),
    silkscreenLayer({id: 'silkscreen/front', side: 'front', color: 'white'}),
    silkscreenLayer({id: 'silkscreen/back', side: 'back', color: 'white'}),
    mechanicalLayer({id: 'mechanical/assembly/front', purpose: 'assembly', side: 'front'}),
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
        <RouteThrough key="connector-exit" region={rect(8, 16, 20, 8)} />
        <RouteThrough key="mcu-entry" region={rect(24, 17, 4, 6)} />
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

The first step is to design a tool-independent PCB IR that serves as the canonical representation of a board. The IR should describe the board without depending on JSX, a particular autorouter, KiCad, Gerber, or any PCB manufacturer. It should contain the board outline and layer stack, components and their exact selected parts (manufacturer, MPN, supplier/SKU and relevant specifications), footprints, pads, nets and connectivity, component placement, design rules, copper zones, keepouts, routing and electrical constraints such as differential pairs and impedance requirements, and any physical geometry that has already been explicitly resolved. The BOM should be derivable directly from the component and part information stored in the IR rather than maintained as a separate source of truth. Initially, the goal is not to implement routing or manufacturing output, but to define a sufficiently complete and stable representation so that future frontends can compile designs into it and future tools—autorouters, simulators, validators, exporters, and manufacturing backends—can operate on the same IR without changing its fundamental model.

PCB IR is a normalized, serializable representation of PCB design intent, connectivity, manufacturing-relevant component identity, constraints, and physical realization. It is independent of source syntax, EDA software, routing implementation, and fabrication output format. Everything that can be referenced has a stable ID. It serves as a human-readable, machine-processable blueprint for visualization, validation, and subsequent physical routing.


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
