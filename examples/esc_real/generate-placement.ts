/** Reproducible initial floorplan, not a router or signal-integrity optimizer.
 * Source a missing/new part deliberately; runtime boards use the saved stable-ID
 * coordinates in placement.json. Review that diff and preview after regeneration.
 */
import {createCircuit} from "./circuit.ts";
import {courtyardBounds,physicalDevice} from "./footprints/index.ts";
import type {CircuitPart} from "./model.ts";

type Box=[number,number,number,number];
const anchors:Record<string,[number,number]>={
  J_DC:[153,12],J_BRAKE:[153,72],Q_BR:[139.92,48],U_BR_DRV:[145,60],U_BUS_CMP:[141,82],
  U_DRV:[65,64],U_MCU:[65,126],U_LATCH:[47,109],U_ENABLE:[65,108],U_RESET:[79,126],
  U_BUCK_AUX:[135,100],L_AUX:[154,100],U_BUCK_LOGIC:[135,124],L_LOGIC:[154,124],U_LDO:[121,129],
  J_HALL:[12,145],J_CMD:[39,145],J_UART:[57,145],J_SWD:[96,146],J_BR_TEMP:[113,145],J_CAN:[136,145],
  SW_RESET:[17,125],D_LED_STATUS:[28,125],D_LED_PWR:[28,132],TH_PWR:[121,48],
  R_BLEED1:[149,28],R_BLEED2:[158,28],
};
for(let i=0;i<6;i++)anchors[`C_BULK${i+1}`]=[26+i*18-3.75,14];
for(const [phase,cx] of [["U",30],["V",65],["W",100]] as const){
  Object.assign(anchors,{[`Q_${phase}H`]:[cx-5.08,33],[`Q_${phase}L`]:[cx-5.08,47],
    [`R_SHUNT_${phase}`]:[cx,58],[`J_${phase}`]:[cx-4.76,72],
    [`U_I_${phase}`]:[cx,84],[`U_OC_${phase}`]:[cx,95],
    [`R_GATE_${phase}H`]:[cx+11.5,33],[`R_GATE_${phase}L`]:[cx+11.5,47],
    [`R_GS_${phase}H`]:[cx+11.5,30],[`R_GS_${phase}L`]:[cx+11.5,44],
  });
}
const placed:Record<string,{at:[number,number];rotation:0}>={};
const occupied:Box[]=[[2.5,2.5,9.5,9.5],[170.5,2.5,177.5,9.5],[2.5,150.5,9.5,157.5],[170.5,150.5,177.5,157.5]];
const shifted=(b:Box,x:number,y:number):Box=>[b[0]+x,b[1]+y,b[2]+x,b[3]+y];
const free=(b:Box)=>b[0]>=1&&b[1]>=1&&b[2]<=179&&b[3]<=159&&occupied.every(a=>b[0]>=a[2]+.4||b[2]<=a[0]-.4||b[1]>=a[3]+.4||b[3]<=a[1]-.4);
function put(p:CircuitPart,at:[number,number]){
  const b=shifted(courtyardBounds(physicalDevice(p.device).footprint),...at);
  if(!free(b))throw new Error(`Anchor conflict: ${p.reference}: ${JSON.stringify(b)}`);
  occupied.push(b);placed[p.id]={at,rotation:0};
}
const circuit=createCircuit();
for(const p of circuit.parts)if(anchors[p.reference])put(p,anchors[p.reference]!);
function region(p:CircuitPart):{area:Box;target:[number,number]}{
  const ref=p.reference;
  if(p.section==="test"){
    const phase=ref.match(/_(U|V|W)(H|L)?$/)?.[1];
    if(phase){const x=phase==="U"?30:phase==="V"?65:100;return{area:[x-16,24,x+16,105],target:[x+12,ref.includes("G_")||ref.includes("KS_")?44:64]};}
    if(ref.includes("BR"))return{area:[124,44,173,89],target:[153,59]};
    return{area:[8,105,121,153],target:[99,119]};
  }
  if(p.section==="inverter"||p.section==="drive" && /_(U|V|W)(H|L)?$/.test(ref)){
    const phase=ref.match(/_(U|V|W)(H|L|HF|1|2)?$/)![1];const x=phase==="U"?30:phase==="V"?65:100;
    return{area:[x-16,24,x+16,65],target:[x+10,ref.endsWith("H")?36:ref.endsWith("L")?50:40]};
  }
  if(p.section==="drive")return{area:[45,53,85,69],target:[65,61]};
  if(p.section==="sense"){
    const phase=ref.match(/_(U|V|W)(P|N|HI|LO)?$/)?.[1];
    if(phase){const x=phase==="U"?30:phase==="V"?65:100;return{area:[x-16,62,x+16,103],target:[x,ref.includes("_V_")?67:84]};}
    return{area:[10,79,121,104],target:[112,85]};
  }
  if(p.section==="fault"){
    const phase=ref.match(/_(U|V|W)(P|N)?$/)?.[1];
    if(phase){const x=phase==="U"?30:phase==="V"?65:100;return{area:[x-16,89,x+16,103],target:[x,95]};}
    return{area:[35,103,93,117],target:[55,109]};
  }
  if(p.section==="control")return{area:[10,118,92,139],target:[65,126]};
  if(p.section==="supplies"){
    if(ref.includes("AUX"))return{area:[124,90,173,113],target:[135,100]};
    if(ref.includes("LOGIC"))return{area:[124,115,173,138],target:[135,124]};
    return{area:[105,114,128,138],target:[121,129]};
  }
  if(p.section==="brake")return{area:[124,44,173,89],target:[141,ref.includes("BR_")?60:82]};
  if(p.section==="interfaces")return{area:[10,134,169,157],target:[ref.includes("CAN")?141:ref.includes("HALL")?22:ref.includes("SWD")||ref.includes("SWCLK")?97:52,143]};
  if(p.section==="power")return{area:[138,24,171,35],target:[150,28]};
  throw new Error(`No placement region for ${p.id}`);
}
// Larger parts and local decouplers first. Sorting by stable reference makes
// unrelated source reordering irrelevant to the saved placement.
const rest=circuit.parts.filter(p=>!placed[p.id]).sort((a,b)=>{
 const aa=courtyardBounds(physicalDevice(a.device).footprint),bb=courtyardBounds(physicalDevice(b.device).footprint);
 return (bb[2]-bb[0])*(bb[3]-bb[1])-(aa[2]-aa[0])*(aa[3]-aa[1])||a.reference.localeCompare(b.reference);
});
for(const p of rest){
 const {area,target}=region(p),local=courtyardBounds(physicalDevice(p.device).footprint);
 let best:[number,number]|undefined,score=Infinity;
 for(let y=area[1];y<=area[3];y+=.5)for(let x=area[0];x<=area[2];x+=.5){
  const b=shifted(local,x,y);if(b[0]<area[0]||b[1]<area[1]||b[2]>area[2]||b[3]>area[3]||!free(b))continue;
  const s=(x-target[0])**2+(y-target[1])**2;if(s<score){score=s;best=[x,y];}
 }
 if(!best)throw new Error(`Region full: ${p.reference}: ${JSON.stringify(area)}`);
 put(p,best);
}
if(!process.argv.includes("--write"))throw new Error("Pass --write to regenerate the reviewed placement.json");
await Bun.write(`${import.meta.dir}/placement.json`,JSON.stringify(Object.fromEntries(Object.entries(placed).sort(([a],[b])=>a.localeCompare(b))),null,2)+"\n");
console.log(`Placed ${Object.keys(placed).length} circuit parts (including DNP) on 180 x 160mm floorplan.`);
