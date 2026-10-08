import {Module, Route, pad, part, usePart} from '@react-pcb/core';
import {Capacitor, Controller, type Net} from '../parts/index.ts';

const scope = 'control';

export const controller = part('U2', `${scope}/U2`);

type ControlProps = {
  ground: Net;
  logic: Net;
  shuntN: Net;
  phaseA: Net;
  pwmHigh: Net;
  pwmLow: Net;
};

function ControlParts(props: ControlProps) {
  const mcu = usePart('U2');
  const logicCap = usePart('C2');
  return (
    <>
      <Controller
        id={mcu}
        at={[28, 5]}
        connect={{
          VDD: props.logic,
          VSS: props.ground,
          PWM_H: props.pwmHigh,
          PWM_L: props.pwmLow,
          SENSE_P: props.ground,
          SENSE_N: props.shuntN,
          PHASE: props.phaseA,
        }}
      />
      <Capacitor id={logicCap} at={[32, 5]} side="back" connect={{1: props.logic, 2: props.ground}} />
      <Route net={props.logic} from={pad(logicCap, '1')} to={pad(mcu, 'VDD')} width={0.25} />
    </>
  );
}

export function Control(props: ControlProps) {
  return (
    <Module name={scope}>
      <ControlParts {...props} />
    </Module>
  );
}
