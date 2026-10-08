import React from 'react';
import {
  Board,
  DifferentialPair,
  Keepout,
  Module,
  Part,
  PcbCompileError,
  Route,
  RouteThrough,
  Zone,
  compile,
  copperLayer,
  defineLayerSet,
  defineStackup,
  dielectricLayer,
  mechanicalLayer,
  pad,
  pasteLayer,
  rect,
  renderFootprintDeclarations,
  silkscreenLayer,
  solderMaskLayer,
  useNet,
  usePart,
  type PartProps,
} from '@react-pcb/core';
import {Positioned0402} from './footprints/0402.tsx';
import {STM32G0B1CBT6} from './parts/STM32G0B1CBT6.ts';
import {USB4105GFA} from './parts/USB4105GFA.ts';

const frontCopper = copperLayer({thickness: 0.035, usage: 'signal'});
const groundPlane = copperLayer({thickness: 0.018, usage: 'plane'});
const powerPlane = copperLayer({thickness: 0.018, usage: 'plane'});
const backCopper = copperLayer({thickness: 0.035, usage: 'signal'});

const frontMask = solderMaskLayer({side: 'front', expansion: 0.05});
const backMask = solderMaskLayer({side: 'back', expansion: 0.05});
const frontPaste = pasteLayer({side: 'front'});
const backPaste = pasteLayer({side: 'back'});

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
    frontMask,
    backMask,
    frontPaste,
    backPaste,
    silkscreenLayer({side: 'front', color: 'white'}),
    silkscreenLayer({side: 'back', color: 'white'}),
    mechanicalLayer({id: 'mechanical/assembly/front', purpose: 'assembly', side: 'front'}),
    mechanicalLayer({purpose: 'fabrication', side: 'front'}),
    mechanicalLayer({purpose: 'fabrication', side: 'back'}),
    mechanicalLayer({purpose: 'courtyard', side: 'front'}),
    mechanicalLayer({purpose: 'courtyard', side: 'back'}),
  ],
});

// Reuse the illustrative JSX footprint; Rust resolves its layout during board compilation.
// Verify the land pattern against manufacturer data before fabrication.
const capacitorFootprint = await renderFootprintDeclarations(<Positioned0402 />);

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
        footprint={capacitorFootprint}
        pinMap={{1: '1', 2: '2'}}
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
      <Keepout
        region={rect(0, 14, 8, 12)}
        disallow={['vias', 'copper']}
      />
    </Board>
  );
}

try {
  const result = await compile(<MyBoard />, {cwd: import.meta.dir + '/..'});
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof PcbCompileError) {
    console.log(error.message);
    process.exit(1);
  }
  throw error;
}
