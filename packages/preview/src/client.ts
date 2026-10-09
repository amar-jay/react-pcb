/// <reference lib="dom" />
import type {PreviewSnapshot} from './index.ts';

/** Serialized into offline HTML. Keep dependencies inside this function. */
export function previewClient() {
  let data = JSON.parse(document.querySelector('#preview-data')!.textContent!) as PreviewSnapshot;
  const get = (id: string) => document.getElementById(id)!;
  const text = (id: string, value: string) => { get(id).textContent = value; };
  const layerState = new Map<string, boolean>();
  let selected: string | null = null;
  let net = '';
  let viewport: number[] | null = null;
  let fit: number[] = [];
  let svg: SVGSVGElement | null = null;
  let drag: {x: number; y: number; view: number[]; moved: boolean} | null = null;

  function el(tag: string, content: string, className = '') {
    const node = document.createElement(tag); node.textContent = content; node.className = className; return node;
  }
  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function view(values: number[]) {
    if (!svg || values.some(v => !Number.isFinite(v)) || values[2]! <= 0 || values[3]! <= 0) return;
    viewport = values; svg.setAttribute('viewBox', values.join(' '));
    text('zoom-level', `${Math.round(fit[2]! / values[2]! * 100)}%`);
  }
  function zoom(factor: number, cx?: number, cy?: number) {
    if (!viewport || !svg) return;
    const [x,y,w,h] = viewport as [number,number,number,number];
    const scale = fit[2]! / (w * factor);
    if (scale < 0.1 || scale > 100) return;
    const px = cx ?? x+w/2; const py = cy ?? y+h/2;
    view([px+(x-px)*factor, py+(y-py)*factor, w*factor, h*factor]);
  }
  function highlight() {
    const ir = data.result?.ir;
    if (!svg || !ir) return;
    for (const feature of svg.querySelectorAll<SVGElement>('[data-part-id]')) {
      const part = ir.parts.find(p => p.id === feature.dataset.partId);
      const matches = !!net && !!part && Object.entries(part.pinMap).some(([pin, pads]) =>
        pads.includes(feature.dataset.featureId ?? '') && part.connections[pin] === net);
      feature.classList.toggle('selected', !!selected && part?.id === selected);
      feature.classList.toggle('net-match', matches);
      feature.classList.toggle('dimmed', !!net && !matches && feature.tagName !== 'text');
    }
    for (const button of get('parts').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.partId === selected));
    details();
  }
  function details() {
    const target = get('part-details'); target.replaceChildren();
    const ir = data.result?.ir;
    const part = ir?.parts.find(p => p.id === selected);
    if (!ir || !part) { target.append(el('p', 'Select a part on the board or in the list.', 'muted')); return; }
    const component = ir.componentDefinitions[part.component];
    target.append(el('h3', part.reference), el('p', component?.mpn ?? component?.value ?? part.component, 'part-name'));
    const line = (label: string, value: string) => {
      const row = el('div','','detail-row'); row.append(el('span',label,'muted'), el('span',value)); target.append(row);
    };
    line('Side', part.side); line('Placement', part.at ? `${part.at.join(', ')} ${ir.units} · ${part.rotation}°` : 'Unplaced');
    line('Footprint', part.footprint); line('Features', String(Object.keys(part.physicalFeatures).length));
    target.append(el('h4','Connections'));
    if (!Object.keys(part.connections).length) target.append(el('p','No connections declared.','muted'));
    for (const [pin,id] of Object.entries(part.connections)) {
      const button = el('button', `${pin} → ${ir.nets.find(n => n.id === id)?.name ?? id}`, 'connection') as HTMLButtonElement;
      button.onclick = () => { net = id; (get('net') as HTMLSelectElement).value = id; highlight(); };
      target.append(button);
    }
    const report = data.result?.manufacturingReports[part.footprint];
    target.append(el('h4','Manufacturing checks'));
    if (report) {
      target.append(el('p', `${report.profile.key} · ${report.conformsToCheckedRules ? 'Checked rules pass' : 'Rule failures'}`));
      for (const check of report.checks) {
        const row = el('div','','detail-row'); row.append(el('span',check.id), el('span',check.status,'check-status')); target.append(row);
      }
      target.append(el('p','Coverage is incomplete. See diagnostics.','muted'));
    } else target.append(el('p','No manufacturing report for this footprint.','muted'));
  }
  function render() {
    const ir = data.result?.ir;
    const title = typeof ir?.board.metadata.title === 'string' ? ir.board.metadata.title : 'Board preview';
    text('board-title',title); document.title = `${title} · react-pcb`;
    text('source', data.entry ? data.entry.split(/[\\/]/).pop()! : 'Board JSX');
    text('mode',data.live ? 'Live preview' : 'Offline preview');
    text('status',data.building ? 'Compiling…' : data.error ? 'Build failed' : 'Compiled');
    get('status').dataset.state = data.error ? 'error' : data.building ? 'building' : 'ready';
    const error = get('build-error'); error.hidden = !data.error;
    text('error-message',data.error ?? '');
    text('stale-label', data.error && ir ? 'Showing the last successful build' : '');
    text('summary', ir ? `${ir.parts.length} parts · ${ir.nets.length} nets · ${ir.units}` : 'Waiting for a valid board');
    const scene = get('scene');
    scene.innerHTML = data.projection?.svg ?? '';
    svg = scene.querySelector('svg');
    if (svg) {
      fit = svg.getAttribute('viewBox')!.split(' ').map(Number);
      view(viewport ?? fit);
      svg.addEventListener('wheel', event => {
        event.preventDefault();
        const matrix = svg!.getScreenCTM(); if (!matrix) return;
        const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
        zoom(event.deltaY > 0 ? 1.15 : 1/1.15, point.x, point.y);
      }, {passive: false});
      svg.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !viewport) return;
        drag = {x:event.clientX,y:event.clientY,view:[...viewport],moved:false};
        svg!.setPointerCapture(event.pointerId);
      });
      svg.addEventListener('pointermove', event => {
        if (!drag || !svg) return;
        const matrix = svg.getScreenCTM(); if (!matrix) return;
        const start = new DOMPoint(drag.x,drag.y).matrixTransform(matrix.inverse());
        const end = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
        if (Math.abs(event.clientX-drag.x)+Math.abs(event.clientY-drag.y)>4) drag.moved = true;
        view([drag.view[0]!+start.x-end.x,drag.view[1]!+start.y-end.y,drag.view[2]!,drag.view[3]!]);
      });
      svg.addEventListener('pointerup', event => {
        if (drag?.moved) { drag = null; return; }
        drag = null;
        const item = document.elementFromPoint(event.clientX,event.clientY)?.closest<SVGElement>('[data-part-id]');
        if (item?.dataset.partId) { selected = item.dataset.partId; highlight(); }
      });
      svg.addEventListener('pointercancel', () => { drag = null; });
    }
    const layers = get('layers'); layers.replaceChildren();
    const copperIds = ir?.board.layers.stackup.entries.filter(l => l.kind === 'copper').map(l => l.id) ?? [];
    const groups = svg?.querySelectorAll<SVGGElement>('g[data-layer-id],g[data-overlay]') ?? [];
    for (const group of groups) {
      const id = group.dataset.layerId ?? group.dataset.overlay!;
      const stateKey = `${group.dataset.layerId ? 'layer' : 'overlay'}:${id}`;
      const technical = ir?.board.layers.technical.find(l => l.id === id);
      const initial = group.dataset.overlay ? ['references','drills'].includes(id) :
        id === copperIds[0] || (technical?.kind === 'silkscreen' && technical.side === 'front');
      if (!layerState.has(stateKey)) layerState.set(stateKey,initial);
      group.style.display = layerState.get(stateKey) ? '' : 'none';
      const label = el('label','','layer');
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = layerState.get(stateKey)!;
      input.onchange = () => { layerState.set(stateKey,input.checked); group.style.display = input.checked ? '' : 'none'; };
      const swatch = el('span','','swatch'); swatch.style.background = group.getAttribute('stroke') ?? group.getAttribute('fill') ?? '#6379b8';
      if (swatch.style.background === 'none') swatch.style.background = '#6379b8';
      const name = group.dataset.overlay ? ({references:'Part references',drills:'Drills',constraints:'Constraint regions'}[id] ?? id) : id;
      label.append(input,swatch,el('span',name)); layers.append(label);
    }
    const selector = get('net') as HTMLSelectElement;
    selector.replaceChildren(new Option('All nets',''));
    for (const n of ir?.nets ?? []) selector.append(new Option(n.name,n.id));
    if (!ir?.nets.some(n => n.id === net)) net = '';
    selector.value = net;
    const list = get('parts'); list.replaceChildren();
    if (!ir?.parts.some(p => p.id === selected)) selected = null;
    for (const part of ir?.parts ?? []) {
      const button = el('button','','part') as HTMLButtonElement; button.dataset.partId = part.id;
      const name = ir?.componentDefinitions[part.component]?.mpn ?? ir?.componentDefinitions[part.component]?.value ?? part.footprint;
      button.append(el('strong',part.reference),el('span',name,'muted'),el('small',!part.at ? 'Unplaced' : !Object.keys(part.physicalFeatures).length ? 'No physical geometry' : part.side,'muted'));
      button.onclick = () => { selected = part.id; highlight(); }; list.append(button);
    }
    const findings = [...(data.result?.diagnostics ?? []), ...(data.projection?.diagnostics ?? [])];
    text('diagnostic-count',String(findings.length));
    const messages = get('diagnostic-list'); messages.replaceChildren();
    if (!findings.length) messages.append(el('p','No compiler findings.','muted'));
    for (const d of findings) {
      const row = el('div','','diagnostic');
      row.append(el('strong',`${d.severity} · ${d.code}${d.entity ? ' · '+d.entity : ''}`),el('p',d.message));
      if (d.source?.file) row.append(el('small',`${d.source.file}${d.source.line ? ':'+d.source.line : ''}`));
      if (d.help) row.append(el('p',d.help,'muted')); messages.append(row);
    }
    get('download-ir').toggleAttribute('disabled',!data.result);
    get('download-svg').toggleAttribute('disabled',!data.projection);
    highlight();
  }
  get('fit').onclick = () => view(fit);
  get('zoom-in').onclick = () => zoom(1/1.25);
  get('zoom-out').onclick = () => zoom(1.25);
  get('net').onchange = () => { net = (get('net') as HTMLSelectElement).value; highlight(); };
  get('download-ir').onclick = () => { if (data.result) download('board.json',JSON.stringify(data.result,null,2)+'\n','application/json'); };
  get('download-svg').onclick = () => { if (data.projection) download('board.svg',data.projection.svg,'image/svg+xml'); };
  render();
  if (data.live) {
    let fetching = false;
    setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const status = await (await fetch('/__preview/status', {cache:'no-store'})).json() as {version: number; building: boolean};
        if (status.version !== data.version) {
          data = await (await fetch('/__preview/data', {cache:'no-store'})).json() as PreviewSnapshot; render();
        } else text('status',status.building ? 'Compiling…' : data.error ? 'Build failed' : 'Compiled');
      } catch { text('status','Disconnected · retrying'); }
      finally { fetching = false; }
    }, 500);
  }
}
