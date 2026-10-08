import {expect, test} from 'bun:test';
import React from 'react';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {Board, Part, boardHtml, boardSvg, buildBoardPreview, exportBoardPreview, startBoardPreview,
  compile, definePhysicalFootprint, net, part, rect} from '../index.ts';
import {testLayers} from './fixtures.ts';

const cwd = resolve(import.meta.dir, '../../../..');
const options = {cwd, hideWarnings: true};
const footprint = definePhysicalFootprint({key:'preview:slot', features:[
  {id:'P',purpose:'pad',at:['1mm','2mm'],shape:{kind:'oval',size:['1mm','2mm']},layers:['front-copper','front-mask'],
    drill:{diameter:'0.6mm',slot:['0.6mm','1.6mm'],plated:true}},
]});

test('board projection uses exact placed geometry, concrete layers, stable IDs and browser-sized coordinates', async () => {
  const board = <Board outline={rect(0,0,60,40)} layers={testLayers}>
    <Part id={part('F')} at={[10,20]} rotation={90} footprint={footprint} connect={{P:net('GND')}} />
    <Part id={part('B')} at={[10,20]} rotation={90} side="back" footprint={footprint} connect={{P:net('GND')}} />
    <Part id={part('U')} footprint="unresolved" connect={{P:net('GND')}} />
  </Board>;
  const result = await compile(board,options);
  const original = JSON.stringify(result.ir);
  const output = await boardSvg(result.ir,options);
  expect(output.svg).toContain('data-units="mm"');
  expect(output.svg).toContain('width="60" height="40"');
  expect(output.svg).toContain('data-layer-id="copper/1"');
  expect(output.svg).toContain('data-layer-id="copper/2"');
  expect(output.svg).toContain('transform="translate(8 21) rotate(90)"');
  expect(output.svg).toContain('transform="translate(8 19) rotate(90)"');
  expect(output.svg).toContain('width="0.6" height="1.6" rx="0.3"');
  expect(output.diagnostics).toMatchObject([{code:'PCBPREVIEW002',entity:'U'}]);
  const reordered = {...result.ir,parts:[...result.ir.parts].toReversed()};
  expect((await boardSvg(reordered,options)).svg).toBe(output.svg);
  expect(JSON.stringify(result.ir)).toBe(original);
  const forged = structuredClone(result.ir);
  (forged.parts[0]!.physicalFeatures.P!.geometry.at as [number,number])[0] += 1;
  await expect(boardSvg(forged,options)).rejects.toThrow('does not match');
});

test('offline HTML embeds the actual board and safely handles markup in metadata', async () => {
  const title = '</script><script>globalThis.injected=true</script>';
  const html = await boardHtml(<Board outline={rect(0,0,10,10)} layers={testLayers} metadata={{title}}>
    <Part id={part('P1')} at={[5,5]} footprint={footprint} connect={{P:net('GND')}} />
  </Board>,options);
  const payload = html.match(/<script type="application\/json" id="preview-data">(.*?)<\/script>/s)![1]!;
  expect(payload).not.toContain('</script>');
  const parsed = JSON.parse(payload);
  expect(parsed.result.ir.board.metadata.title).toBe(title);
  expect(parsed.live).toBe(false);
  expect(parsed.projection.svg).toContain('data-part-id="P1"');
  expect(html).not.toContain('<script src=');
  expect(html).toContain('Save SVG');
});

test('projection preserves odd-nanometre edges, converts board units and separates overlay identities from layer IDs', async () => {
  const layers = {...testLayers,stackup:{...testLayers.stackup,entries:testLayers.stackup.entries.map(l=>
    l.id==='copper/1'?{...l,id:'drill'}:l)}};
  const tiny = definePhysicalFootprint({key:'preview:tiny',features:[
    {id:'T',purpose:'pad',at:['0nm','0nm'],shape:{kind:'circle',diameter:'3nm'},layers:['front-copper'],drill:{diameter:'1nm',plated:true}},
  ]});
  const board = await compile(<Board units="mil" outline={rect(-1,-2,100,50)} layers={layers}>
    <Part id={part('T1')} at={[10,20]} footprint={tiny} connect={{T:net('GND')}}/>
  </Board>,options);
  const projection = await boardSvg(board.ir,options);
  expect(projection.svg).toContain('x="-0.0254" y="-0.0508" width="2.54" height="1.27"');
  expect(projection.svg).toContain('r="0.0000015"');
  expect(projection.svg).toContain('r="0.0000005"');
  expect(projection.svg).toContain('translate(0.254 0.508)');
  const ids = [...projection.svg.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);
  expect(new Set(ids).size).toBe(ids.length);
});

const source = (title = 'Preview fixture', extraImport = '') => `
import React from 'react';
import {Board,Part,net,part,rect} from '@react-pcb/core';
import {testLayers} from '../packages/react-pcb/src/__tests__/fixtures.ts';
import {footprint} from './footprint.ts';
${extraImport}
export default function MyBoard(){return <Board outline={rect(0,0,20,20)} layers={testLayers} metadata={{title:${JSON.stringify(title)}}}>
<Part id={part('C1')} at={[5,5]} footprint={footprint} connect={{1:net('GND')}}/>
</Board>}
`;
const pad = (width: number) => `import {definePhysicalFootprint} from '@react-pcb/core';
export const footprint=definePhysicalFootprint({key:'preview:passive',features:[
{id:'1',purpose:'pad',at:['0mm','0mm'],shape:{kind:'rect',size:['${width}mm','1mm']},layers:['front-copper']} ]});`;

async function fixture() {
  const directory = await mkdtemp(join(cwd,'.preview-test-'));
  await Bun.write(join(directory,'board.tsx'),source());
  await Bun.write(join(directory,'footprint.ts'),pad(1));
  return {directory,entry:join(directory,'board.tsx')};
}

test('JSX entry exports offline HTML and imports are fresh on subsequent builds', async () => {
  const {directory,entry} = await fixture();
  try {
    const first = await buildBoardPreview(entry);
    expect(first.error).toBeNull();
    expect(first.dependencies).toContain(join(directory,'footprint.ts'));
    expect(first.dependencies.some(p=>p.endsWith('crates/pcbir/src/board_svg.rs'))).toBe(true);
    expect(first.projection?.svg).toContain('width="1" height="1"');
    await Bun.write(join(directory,'footprint.ts'),pad(2));
    const second = await buildBoardPreview(entry);
    expect(second.projection?.svg).toContain('width="2" height="1"');
    const file = await exportBoardPreview(entry,join(directory,'export','index.html'));
    const valid = await Bun.file(file).text();
    expect(valid).toContain('Preview fixture');
    await Bun.write(entry,'export default 123;');
    await expect(exportBoardPreview(entry,file)).rejects.toThrow('default-export');
    expect(await Bun.file(file).text()).toBe(valid);
  } finally {await rm(directory,{recursive:true,force:true});}
},15000);

async function until(predicate: () => boolean, message: string) {
  const deadline = Date.now()+10000;
  while (!predicate()) {
    if (Date.now()>deadline) throw new Error(message);
    await Bun.sleep(50);
  }
}

test('live preview reloads imported geometry and recovers from compiler, syntax, and missing-import errors', async () => {
  const {directory,entry} = await fixture();
  const server = await startBoardPreview(entry,{port:0,pollInterval:30});
  try {
    expect(server.snapshot.error).toBeNull();
    const response = await fetch(server.url);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('preview-data');
    expect((await fetch(new URL('/missing',server.url))).status).toBe(404);
    expect((await fetch(server.url,{method:'POST'})).status).toBe(405);
    await Bun.write(join(directory,'footprint.ts'),pad(3));
    await until(()=>!!server.snapshot.projection?.svg.includes('width="3" height="1"'),'dependency did not reload');
    const good = server.snapshot.projection!.svg;
    let version = server.snapshot.version;
    await Bun.write(join(directory,'footprint.ts'),pad(-1));
    await until(()=>server.snapshot.version>version && !!server.snapshot.error,'invalid geometry did not report an error');
    expect(server.snapshot.error).toContain('invalid dimensions');
    expect(server.snapshot.projection!.svg).toBe(good);
    version = server.snapshot.version;
    await Bun.write(entry,'export default function Board( {');
    await until(()=>server.snapshot.version>version && !!server.snapshot.error,'syntax error did not reload');
    expect(server.snapshot.projection!.svg).toBe(good);
    await Bun.write(join(directory,'footprint.ts'),pad(4));
    await Bun.write(entry,source('Recovered'));
    await until(()=>!server.snapshot.error && server.snapshot.result?.ir.board.metadata.title==='Recovered','syntax error did not recover');
    expect(server.snapshot.projection!.svg).toContain('width="4" height="1"');
    version = server.snapshot.version;
    await Bun.write(entry,source('New dependency',"import {flag} from './new-folder/flag.ts'; console.log(flag);"));
    await until(()=>server.snapshot.version>version && !!server.snapshot.error,'missing import did not fail');
    await mkdir(join(directory,'new-folder'));
    await Bun.write(join(directory,'new-folder','flag.ts'),'export const flag=true;');
    await until(()=>!server.snapshot.error && server.snapshot.result?.ir.board.metadata.title==='New dependency','created dependency did not recover');
    const state = await (await fetch(new URL('/__preview/data',server.url))).json();
    expect(state.version).toBe(server.snapshot.version);
    expect(state.error).toBeNull();
  } finally {await server.stop();await rm(directory,{recursive:true,force:true});}
},30000);

test('explicit watch directories reload runtime data and the server can start with an invalid board', async () => {
  const {directory,entry} = await fixture();
  await mkdir(join(directory,'data'));
  const dataFile = join(directory,'data','title.txt');
  await Bun.write(dataFile,'Dynamic title');
  await Bun.write(entry,'export default ???');
  const server = await startBoardPreview(entry,{port:0,pollInterval:30,watch:[join(directory,'data')]});
  try {
    expect(server.snapshot.error).toBeTruthy();
    expect(server.snapshot.result).toBeNull();
    await Bun.write(entry,source('Preview fixture',"const title=await Bun.file(import.meta.dir+'/data/title.txt').text();")
      .replace('"Preview fixture"','title'));
    await until(()=>server.snapshot.result?.ir.board.metadata.title==='Dynamic title','initial error did not recover');
    await Bun.write(dataFile,'Updated dynamic title');
    await until(()=>server.snapshot.result?.ir.board.metadata.title==='Updated dynamic title','explicit data directory did not reload');
  } finally {await server.stop();await rm(directory,{recursive:true,force:true});}
},20000);

test('a dependency edited during the first compile triggers a fresh build before startup finishes', async () => {
  const {directory,entry} = await fixture();
  const signal = join(directory,'started.txt');
  await Bun.write(entry,source('During build',"await Bun.write(import.meta.dir+'/started.txt','ready'); await Bun.sleep(300);"));
  const starting = startBoardPreview(entry,{port:0,pollInterval:30});
  let server: Awaited<typeof starting> | undefined;
  try {
    await until(()=>existsSync(signal),'entry did not start');
    await Bun.write(join(directory,'footprint.ts'),pad(7));
    server = await starting;
    expect(server.snapshot.version).toBeGreaterThanOrEqual(2);
    expect(server.snapshot.projection?.svg).toContain('width="7" height="1"');
  } finally {
    server ??= await starting;
    await server.stop();await rm(directory,{recursive:true,force:true});
  }
},20000);
