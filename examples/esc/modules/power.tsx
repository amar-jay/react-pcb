import {Module, part, usePart} from '@react-pcb/core';
import {Battery, BulkCapacitor, Shunt, type Net} from '../parts/index.ts';

const scope = 'power';

export const powerBattery = part('J1', `${scope}/J1`);
export const powerBulk = part('C1', `${scope}/C1`);
export const powerShunt = part('R1', `${scope}/R1`);

type PowerProps = {
  vbat: Net;
  ground: Net;
  shuntN: Net;
};

function PowerParts({vbat, ground, shuntN}: PowerProps) {
  const battery = usePart('J1');
  const bulk = usePart('C1');
  const shunt = usePart('R1');
  return (
    <>
      <Battery id={battery} at={[6, 13]} connect={{'+': vbat, '-': ground}} />
      <BulkCapacitor id={bulk} at={[9, 21]} connect={{1: vbat, 2: ground}} />
      <Shunt id={shunt} at={[6, 4.5]} rotation={90} connect={{1: ground, 2: shuntN}} />
    </>
  );
}

export function Power(props: PowerProps) {
  return (
    <Module name={scope}>
      <PowerParts {...props} />
    </Module>
  );
}
