import {expect, test} from 'bun:test';
import React from 'react';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {Board, Part, compile, definePhysicalFootprint, net, part, rect} from '@react-pcb/core';
import {boardHtml, boardSvg, buildBoardPreview, exportBoardPreview, startBoardPreview} from '@react-pcb/preview';
import {testLayers} from './fixtures.ts';

const cwd = resolve(import.meta.dir, '../../../..');
const options = {cwd, hideWarnings: true};

test('core can be bundled without loading preview or server code', async () => {
  const loaded: string[] = [];
  const build = await Bun.build({entrypoints: [Bun.resolveSync('@react-pcb/core', cwd)], target: 'bun', packages: 'external', plugins: [{
    name: 'verify-core-boundary',
    setup(builder) {
      builder.onLoad({filter: /.*/}, args => { loaded.push(args.path); return undefined; });
    },
  }]});
  expect(build.success).toBe(true);
  expect(loaded.some(path => path.endsWith('/compiler/index.ts'))).toBe(true);
  expect(loaded.some(path => path.includes('/packages/preview/') || path.includes('/src/preview/'))).toBe(false);
});

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
  expect(html).not.toContain('data-bun-dev-server-script');
  expect(html).toContain('data:font/woff2;base64,');
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
import {testLayers} from '../packages/preview/src/__tests__/fixtures.ts';
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

test('workspace CLI exports HTML and serves the board through the installed preview package', async () => {
  const {directory,entry} = await fixture();
  let server: ReturnType<typeof Bun.spawn> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const output = join(directory,'cli','index.html');
    const build = Bun.spawn([process.execPath,'run','board:build',entry,'--out',output], {cwd,stdout:'pipe',stderr:'pipe'});
    const [stdout,stderr,code] = await Promise.all([new Response(build.stdout).text(),new Response(build.stderr).text(),build.exited]);
    expect({code,stderr: code === 0 ? '' : stderr}).toEqual({code:0,stderr:''});
    expect(stdout).toContain(output);
    expect(await Bun.file(output).text()).toContain('Preview fixture');

    const running = Bun.spawn([process.execPath,'run','board:dev',entry,'--port','0'], {cwd,stdout:'pipe',stderr:'pipe'});
    server = running;
    const reader = running.stdout.getReader();
    const url = await Promise.race([
      (async () => {
        let text = '';
        const decoder = new TextDecoder();
        while (true) {
          const {value,done} = await reader.read();
          if (done) throw new Error('Preview CLI exited before serving a URL');
          text += decoder.decode(value,{stream:true});
          const match = text.match(/Board preview: (http:\/\/\S+)/);
          if (match) return match[1]!;
        }
      })(),
      new Promise<never>((_,reject) => { timeout = setTimeout(() => reject(new Error('Preview CLI did not start')),10000); }),
    ]);
    reader.releaseLock();
    const shell = await (await fetch(url)).text();
    expect(shell).toContain('id="root"');
    expect(shell).toContain('data-bun-dev-server-script');
    const state = await (await fetch(new URL('/__preview/data',url))).json();
    expect(state.result.ir.board.metadata.title).toBe('Preview fixture');
    expect(state.error).toBeNull();
    expect(state.result.ir.parts[0].id).toBe('C1');
  } finally {
    clearTimeout(timeout);
    if (server) {server.kill('SIGTERM'); await server.exited;}
    await rm(directory,{recursive:true,force:true});
  }
},20000);

test('live preview reloads imported geometry and recovers from compiler, syntax, and missing-import errors', async () => {
  const {directory,entry} = await fixture();
  const server = await startBoardPreview(entry,{port:0,pollInterval:30});
  try {
    expect(server.snapshot.error).toBeNull();
    const response = await fetch(server.url);
    const shell = await response.text();
    expect(shell).toContain('preview-data');
    const stylesheet = shell.match(/<link rel="stylesheet" href="([^"]+)"/)![1]!;
    const script = shell.match(/src="([^"]+)" data-bun-dev-server-script/)![1]!;
    const css = await fetch(new URL(stylesheet,server.url));
    expect(css.status).toBe(200);
    expect(await css.text()).toContain('.workbench-app');
    expect((await fetch(new URL(script,server.url))).status).toBe(200);
    expect((await fetch(new URL('/__preview/data',server.url))).headers.get('cache-control')).toBe('no-store');
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

test('board collisions reach live diagnostics on initial failure and stale-scene rebuilds, then clear on recovery', async () => {
  const {directory,entry} = await fixture();
  const board = (x:number) => `import React from 'react';
import {Board,Part,part,net,rect,defineLayerSet,mechanicalLayer,definePhysicalFootprint} from '@react-pcb/core';
import {testLayers} from '../packages/preview/src/__tests__/fixtures.ts';
const layers=defineLayerSet({...testLayers,technical:[...testLayers.technical,mechanicalLayer({id:'reserved/front',purpose:'courtyard',side:'front'})]});
const fp=definePhysicalFootprint({key:'collision:land',features:[
{id:'P',purpose:'pad',at:['0mm','0mm'],shape:{kind:'rect',size:['1mm','1mm']},layers:['front-copper']},
{id:'court',purpose:'courtyard',at:['0mm','0mm'],shape:{kind:'rect',size:['2mm','2mm']},layers:['front-courtyard'],stroke:'0.05mm'}]});
export default function BoardView(){return <Board outline={rect(0,0,10,10)} layers={layers} manufacturingProfile={{schemaVersion:1,key:'preview:board',minCopperFeature:'0.1mm',minCopperSpacing:'0.2mm',minDrillDiameter:'0.1mm',minAnnularRing:'0mm',minCourtyardClearance:'0mm'}}>
<Part id={part('A')} footprint={fp} at={[2,2]} connect={{P:net('A')}}/><Part id={part('B')} footprint={fp} at={[${x},2]} connect={{P:net('B')}}/></Board>;}`;
  let server: Awaited<ReturnType<typeof startBoardPreview>> | undefined;
  try {
    await Bun.write(entry,board(2.5));
    const failed = await buildBoardPreview(entry);
    expect(failed.result).toBeNull();
    expect(failed.buildDiagnostics?.filter(d=>d.code==='PCBMFG002')).toHaveLength(2);
    server = await startBoardPreview(entry,{port:0,pollInterval:30});
    const running = server;
    expect(running.snapshot.result).toBeNull();
    expect(running.snapshot.buildDiagnostics?.some(d=>d.help?.includes('board-copper-spacing'))).toBe(true);
    await Bun.write(entry,board(6));
    await until(()=>!running.snapshot.error && !!running.snapshot.result,'collision did not recover');
    const good = running.snapshot.projection!.svg;
    expect(running.snapshot.result!.boardManufacturingReport?.conformsToCheckedRules).toBe(true);
    await Bun.write(entry,board(2.5));
    await until(()=>!!running.snapshot.error,'collision rebuild did not fail');
    expect(running.snapshot.projection!.svg).toBe(good);
    const state = await (await fetch(new URL('/__preview/data',running.url))).json();
    expect(state.buildDiagnostics.filter((d:{code:string})=>d.code==='PCBMFG002')).toHaveLength(2);
    expect(state.buildDiagnostics.some((d:{help?:string})=>d.help?.includes('inter-part-courtyard'))).toBe(true);
    await Bun.write(entry,board(6));
    await until(()=>!running.snapshot.error,'collision rebuild did not recover');
    expect(running.snapshot.buildDiagnostics).toEqual([]);
  } finally {await server?.stop();await rm(directory,{recursive:true,force:true});}
},15000);
