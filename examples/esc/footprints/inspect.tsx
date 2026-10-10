import React from 'react';
import {compile, compileFootprint, footprintSvg, validateBoardManufacturing, validateFootprintManufacturing} from '@react-pcb/core';
import {Esc} from '../board.tsx';
import {escFootprints, escInspectionProfile, footprintProfile} from './index.ts';

const options = {cwd: import.meta.dir + '/../../..', hideWarnings: true};
const output = process.argv[2] ?? '/tmp/react-pcb-esc-footprints';
const sections: string[] = [];
for (const [name, Component] of escFootprints) {
  const footprint = await compileFootprint(<Component />, options);
  const svg = await footprintSvg(footprint, options);
  const report = await validateFootprintManufacturing(footprint, footprintProfile(name), options);
  await Bun.write(`${output}/${name}.json`, JSON.stringify(footprint, null, 2) + '\n');
  await Bun.write(`${output}/${name}.svg`, svg);
  await Bun.write(`${output}/${name}.manufacturing.json`, JSON.stringify(report, null, 2) + '\n');
  sections.push(`<section><h2>${name}</h2><p>${report.conformsToCheckedRules ? 'Selected checks pass' : 'Check failures'} · <a href="${name}.json">Geometry</a> · <a href="${name}.manufacturing.json">Manufacturing report</a></p><div class="layers"></div>${svg}</section>`);
  if (!report.conformsToCheckedRules) throw new Error(`${name}: ${JSON.stringify(report.checks.filter(c => c.status === 'failed'))}`);
}
const result = await compile(<Esc />, options);
const boardReport = await validateBoardManufacturing(result.ir, escInspectionProfile, options);
await Bun.write(`${output}/board.json`, JSON.stringify(result.ir, null, 2) + '\n');
await Bun.write(`${output}/board.manufacturing.json`, JSON.stringify(boardReport, null, 2) + '\n');
await Bun.write(`${output}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>ESC footprint inspection</title>
<style>body{font:16px system-ui;background:#f6f7f9;color:#18202b;margin:32px}section{margin:32px 0}svg{display:block;background:white;width:720px;max-width:100%;height:auto;margin-top:16px}label{display:inline-block;margin:4px 16px 4px 0}</style>
<h1>ESC footprint inspection</h1><p>Component-side views; dimensions and sources are documented in the ESC README. Mask, paste, and courtyards include explicit authoring choices. Selected manufacturing checks do not establish circuit completeness.</p>
<p><a href="board.manufacturing.json">Placed-board report</a>: ${boardReport.conformsToCheckedRules ? 'selected checks pass' : 'check failures'}.</p>${sections.join('\n')}
<script>for(const section of document.querySelectorAll('section'))for(const group of section.querySelectorAll('svg > g')){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.onchange=()=>group.style.display=input.checked?'':'none';label.append(input,document.createTextNode(group.dataset.layer));section.querySelector('.layers').append(label);}</script></html>`);
if (!boardReport.conformsToCheckedRules) throw new Error(`board: ${JSON.stringify(boardReport.checks.filter(c => c.status === 'failed'))}`);
console.log(`${output}/index.html`);
