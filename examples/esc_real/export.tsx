/** Supplemental BOM/connectivity export. Physical inspection/rendering uses the
 * repository preview CLI from HOWTO.md, never substitute pin drawings.
 */
import {mkdir,writeFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {compile} from "@react-pcb/core";
import {auditCircuit,nominalCalculations} from "./audit.ts";
import EscReal from "./board.tsx";
import {createCircuit} from "./circuit.ts";
import {physicalDevice} from "./footprints/index.ts";
import type {CircuitPart} from "./model.ts";

const csv=(row:unknown[])=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",");
export async function exportDesign(out=resolve(import.meta.dir,"generated")){
 const circuit=createCircuit(),audit=auditCircuit(circuit);
 if(audit.errors.length)throw new Error(audit.errors.join("\n"));
 const compiled=await compile(<EscReal circuit={circuit}/>,{cwd:resolve(import.meta.dir,"../.."),hideWarnings:true});
 await mkdir(out,{recursive:true});
 const groups=new Map<string,CircuitPart[]>();
 for(const p of circuit.parts){const key=`${p.device.key}:${p.populate?"fit":"dnp"}`;groups.set(key,[...(groups.get(key)??[]),p]);}
 const bom=[csv(["Quantity","References","Populate","Manufacturer","MPN","Value / requirement","Package","Selection status","Datasheet","Physical footprint","Functions"])];
 for(const parts of groups.values()){
  const p=parts[0]!;const def=p.device.definition;
  bom.push(csv([parts.length,parts.map(p=>p.reference).join(" "),p.populate?"YES":"DNP",def.manufacturer,def.mpn,def.value,def.package,
    def.mpn?"Candidate; engineering qualification pending":"MPN NOT SELECTED",def.datasheet?.url,physicalDevice(p.device).footprint.key,
    [...new Set(parts.map(p=>p.role))].join("; ")]));
 }
 const pinout=["# ESC pin-to-pad-to-net connectivity","","DNP lands remain in PCB IR. The population flag controls assembly; it does not delete geometry.",""];
 for(const p of circuit.parts){
  const binding=physicalDevice(p.device);
  pinout.push(`## ${p.reference}${p.populate?"":" (DNP)"}: ${p.device.definition.mpn??p.device.definition.value??"Test pad"}`,"",p.role,"",
    "| Physical land(s) | Logical pin | Net / no-connect |","| --- | --- | --- |");
  for(const [pin,pads] of Object.entries(binding.pinMap))pinout.push(`| ${Array.isArray(pads)?pads.join(", "):pads} | ${pin} | ${p.connections[pin]?.name??`NC: ${p.noConnect[pin]}`} |`);
  pinout.push("");
 }
 const endpoints=[...circuit.nets.values()].map(net=>({id:net.id,name:net.name,endpoints:circuit.parts.flatMap(p=>
   Object.entries(p.connections).filter(([,n])=>n.id===net.id).map(([pin])=>({part:p.id,reference:p.reference,populate:p.populate,pin,pad:physicalDevice(p.device).pinMap[pin]})))})).filter(n=>n.endpoints.length);
 const review={stage:"physical-placement",fabricationReady:false,physicalGeometryResolved:true,
  parts:{fitted:circuit.parts.filter(p=>p.populate).length,optionalDnp:circuit.parts.filter(p=>!p.populate).length,boardOwnedMounts:4},
  nets:{fitted:new Set(circuit.parts.filter(p=>p.populate).flatMap(p=>Object.values(p.connections).map(n=>n.id))).size,includingDnp:endpoints.length},
  audit,nominal:nominalCalculations(),pending:circuit.review,
  footprintEvidence:"../footprints/SOURCES.md",physicalInspection:"../../../dist/esc-real/inspect/index.html",
  noConnect:circuit.parts.filter(p=>Object.keys(p.noConnect).length).map(p=>({part:p.id,pins:p.noConnect})),
  boardManufacturingReport:compiled.boardManufacturingReport,
  compilerDiagnosticCounts:compiled.diagnostics.reduce<Record<string,number>>((counts,d)=>{counts[d.code]=(counts[d.code]??0)+1;return counts;},{}),
  externalAssembly:[
   "DC-rated fuse/holder, bidirectional main disconnect, reverse-polarity arrangement, precharge resistor and bypass",
   "6.8Ohm external brake resistor: >=529W instantaneous at60V; continuous/pulse/J rating from load; independent thermal fuse",
   "Brake and motor external 10k/B3435 thermistors; insulation/temperature rating from installation",
   "Heatsink, seven insulated TO247 mounting kits, TIM, four M3 chassis fasteners with matching washers",
   "DC/phase/brake wires/ferrules; five terminal wire assemblies; JST mating housings/crimps; SWD cable and strain relief",
  ],
 };
 for(const [name,content] of [
  ["bom.csv",bom.join("\n")+"\n"],["pinout.md",pinout.join("\n")+"\n"],["netlist.json",JSON.stringify(endpoints,null,2)+"\n"],
  ["review.json",JSON.stringify(review,null,2)+"\n"],["board.ir.json",JSON.stringify(compiled.ir,null,2)+"\n"],
  ["compiler-diagnostics.json",JSON.stringify(compiled.diagnostics,null,2)+"\n"],
 ] as [string,string][])await writeFile(resolve(out,name),content);
 // Remove artifacts from the earlier incorrect pin-drawing workflow.
 for(const section of new Set(circuit.parts.map(p=>p.section)))await rm(resolve(out,`${section}.svg`),{force:true});
 await rm(resolve(out,"index.html"),{force:true});
 return{out,...review.parts,nets:review.nets,diagnostics:review.compilerDiagnosticCounts};
}
if(import.meta.main)console.log(JSON.stringify(await exportDesign(process.argv[2]?resolve(process.argv[2]):undefined),null,2));
