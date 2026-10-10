/** Source fixture evaluated in fresh workers and by the live preview watcher. */
export function constraintSource(
	mode:
		| "valid"
		| "edited"
		| "off-board"
		| "overlap"
		| "blocked"
		| "blocked-pair"
		| "anonymous"
		| "sub-nm" = "valid",
) {
	return `import {Board,Keepout,Zone,Route,RouteThrough,DifferentialPair,Part,part,pad,net,rect,definePhysicalFootprint} from '@react-pcb/core';
import {testLayers} from '../packages/preview/src/__tests__/fixtures.ts';
const p=net('SIG','sig'),n=net('RETURN','return'),a=part('A'),b=part('B');
const footprint=definePhysicalFootprint({key:'regression:terminals',features:[
{id:'P',purpose:'pad',at:['-1mm','0mm'],shape:{kind:'rect',size:['1mm','1mm']},layers:['front-copper']},
{id:'N',purpose:'pad',at:['1mm','0mm'],shape:{kind:'rect',size:['1mm','1mm']},layers:['front-copper']}]});
export default function ConstraintBoard(){return <Board outline={rect(0,0,20,15)} layers={testLayers}>
<Part id={a} at={[3,3]} footprint={footprint} connect={{P:p,N:n}}/>
<Part id={b} at={[17,12]} footprint={footprint} connect={{P:p,N:n}}/>
<Route key="signal" net={p} from={pad(a,'P')} to={pad(b,'P')} width={.2}>
<RouteThrough key="one" region={rect(${mode === "off-board" ? 30 : mode === "edited" ? 3 : 2},3,3,3)}/>
<RouteThrough key="two" region={rect(9,8,3,3)}/></Route>
<DifferentialPair key="pair" positive={p} negative={n} from={[pad(a,'P'),pad(a,'N')]} to={[pad(b,'P'),pad(b,'N')]} width={.2} gap={.15}>
<RouteThrough key="pair-visit" region={rect(15,10,3,3)}/></DifferentialPair>
<Keepout key="reservation" region={rect(${mode === "overlap" ? "1,2,2,2" : mode === "blocked" ? "1,2,5,5" : mode === "blocked-pair" ? "14,9,5,5" : "22,2,2,3"})} disallow={[${mode === "blocked" || mode === "blocked-pair" ? "'tracks'" : "'copper'"}]}/>
<Zone key="ground" net={p} layers={testLayers.stackup.entries.filter(l=>l.kind==='copper')} boundary={rect(${mode === "sub-nm" ? "0.0000001" : "-3"},-2,28,20)} clearance={.3}/>
${mode === "anonymous" ? '<Keepout region={rect(21,1,1,1)} disallow={["vias"]}/><Keepout region={rect(23,1,1,1)} disallow={["vias"]}/>' : ""}
${mode === "edited" ? '<Keepout key="inserted" region={rect(25,1,1,1)} disallow={["vias"]}/>' : ""}
</Board>}`;
}
