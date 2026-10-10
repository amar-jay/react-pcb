
import React from 'react';
import {Board,Part,net,part,rect} from '@react-pcb/core';
import {testLayers} from '../packages/preview/src/__tests__/fixtures.ts';
import {footprint} from './footprint.ts';
await Bun.write(import.meta.dir+'/started.txt','ready'); await Bun.sleep(300);
export default function MyBoard(){return <Board outline={rect(0,0,20,20)} layers={testLayers} metadata={{title:"During build"}}>
<Part id={part('C1')} at={[5,5]} footprint={footprint} connect={{1:net('GND')}}/>
</Board>}
