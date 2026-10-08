import {compileFootprint, definePhysicalFootprint, footprintSvg} from '@react-pcb/core';

// Illustrative geometry for inspection, not verified manufacturer land patterns.
const fixtures = [
  definePhysicalFootprint({key: 'example:passive', features: [
    {id: '1', purpose: 'pad', at: ['-0.5mm', '0mm'], shape: {kind: 'rounded-rect', size: ['0.6mm', '0.7mm'], radius: '0.1mm'}, layers: ['front-copper', 'front-mask', 'front-paste']},
    {id: '2', purpose: 'pad', at: ['0.5mm', '0mm'], shape: {kind: 'rect', size: ['0.6mm', '0.7mm']}, layers: ['front-copper', 'front-mask', 'front-paste']},
    {id: 'body', purpose: 'silkscreen', at: ['0mm', '0mm'], shape: {kind: 'rect', size: ['0.3mm', '0.5mm']}, stroke: '0.05mm', layers: ['front-silkscreen']},
  ]}),
  definePhysicalFootprint({key: 'example:header', features: [
    {id: '1', purpose: 'pad', at: ['0mm', '0mm'], shape: {kind: 'rect', size: ['1.6mm', '1.6mm']}, layers: ['all-copper', 'all-mask'], drill: {diameter: '0.8mm', plated: true}},
    {id: '2', purpose: 'pad', at: ['2.54mm', '0mm'], shape: {kind: 'oval', size: ['1.6mm', '2mm']}, rotation: 90, layers: ['all-copper', 'all-mask'], drill: {diameter: '0.8mm', plated: true}},
    {id: 'mount', purpose: 'non-plated-hole', at: ['5.08mm', '0mm'], shape: {kind: 'circle', diameter: '1mm'}, drill: {diameter: '1mm', plated: false}},
    {id: 'mask', purpose: 'mask-opening', at: ['2.54mm', '0mm'], shape: {kind: 'circle', diameter: '2.2mm'}, layers: ['front-mask']},
    {id: 'paste', purpose: 'paste-opening', at: ['0mm', '2mm'], shape: {kind: 'oval', size: ['1mm', '0.5mm']}, layers: ['front-paste']},
    {id: 'outline', purpose: 'courtyard', at: ['2.54mm', '0.6mm'], shape: {kind: 'rect', size: ['7mm', '4mm']}, stroke: '0.1mm', layers: ['front-courtyard']},
  ]}),
];

const output = process.argv[2] ?? '/tmp/react-pcb-footprints';
const previews: string[] = [];
for (const declaration of fixtures) {
  const ir = await compileFootprint(declaration, {cwd: import.meta.dir + '/../..'});
  const name = declaration.key.split(':')[1]!;
  await Bun.write(`${output}/${name}.json`, JSON.stringify(ir, null, 2) + '\n');
  const svg = await footprintSvg(ir, {cwd: import.meta.dir + '/../..'});
  await Bun.write(`${output}/${name}.svg`, svg);
  previews.push(`<section><h2>${name}</h2><div class="layers"></div>${svg}</section>`);
  console.log(`${output}/${name}.svg`);
}

await Bun.write(`${output}/index.html`, `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Footprint inspection</title>
<style>body{font:16px system-ui;margin:32px;background:#f6f7f9;color:#18202b}section{margin-bottom:40px}svg{display:block;width:720px;max-width:100%;height:auto;margin-top:20px;background:white}label{display:inline-block;margin:4px 16px 4px 0}</style>
<h1>Footprint inspection</h1><p>Illustrative geometry. Toggle semantic layers to inspect pads, openings, and drills independently.</p>
${previews.join('\n')}
<script>
for (const section of document.querySelectorAll('section')) {
  for (const group of section.querySelectorAll('svg > g')) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true;
    input.onchange = () => { group.style.display = input.checked ? '' : 'none'; };
    label.append(input, document.createTextNode(group.dataset.layer));
    section.querySelector('.layers').append(label);
  }
}
</script></html>`);
console.log(`${output}/index.html`);
