import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Crosshair, Maximize, Minus, Plus, MousePointer2} from 'lucide-react';
import type {BoardIr} from '@react-pcb/core';
import type {SceneLayer} from '../lib/scene.ts';
import {IconButton} from './icon-button.tsx';
import {Button} from './ui/button';

type View = [number, number, number, number];
type Props = {
  svg: string | null;
  ir: BoardIr | undefined;
  layers: SceneLayer[];
  visibility: Record<string, boolean>;
  selected: string | null;
  net: string;
  onSelect: (id: string) => void;
};

export function BoardCanvas({svg: markup, ir, layers, visibility, selected, net, onSelect}: Props) {
  const scene = useRef<HTMLDivElement>(null);
  const viewport = useRef<View | null>(null);
  const fitted = useRef<View | null>(null);
  const drag = useRef<{x: number; y: number; view: View; inverse: DOMMatrix; moved: boolean} | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [cursor, setCursor] = useState<{x: number; y: number} | null>(null);
  const getSvg = () => scene.current?.querySelector('svg');
  const view = useCallback((values: View) => {
    const svg = scene.current?.querySelector('svg');
    if (!svg || values.some(value => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) return;
    viewport.current = values;
    svg.setAttribute('viewBox', values.join(' '));
    if (fitted.current) setZoomLevel(Math.round(fitted.current[2] / values[2] * 100));
  }, []);
  const zoom = useCallback((factor: number, point?: {x: number; y: number}) => {
    if (!viewport.current || !fitted.current) return;
    const [x,y,w,h] = viewport.current;
    const scale = fitted.current[2] / (w * factor);
    if (scale < 0.1 || scale > 100) return;
    const px = point?.x ?? x + w / 2; const py = point?.y ?? y + h / 2;
    view([px + (x - px) * factor, py + (y - py) * factor, w * factor, h * factor]);
  }, [view]);
  const fit = () => {if (fitted.current) view([...fitted.current]);};

  useLayoutEffect(() => {
    const svg = getSvg();
    if (!svg) return;
    fitted.current = svg.getAttribute('viewBox')!.trim().split(/\s+/).map(Number) as View;
    view(viewport.current ?? fitted.current);
  }, [markup, view]);

  useLayoutEffect(() => {
    const svg = getSvg();
    if (!svg || !ir) return;
    for (const group of svg.querySelectorAll<SVGGElement>('g[data-layer-id],g[data-overlay]')) {
      const key = `${group.dataset.layerId ? 'layer' : 'overlay'}:${group.dataset.layerId ?? group.dataset.overlay}`;
      const layer = layers.find(layer => layer.key === key);
      group.style.display = (visibility[key] ?? layer?.visible) ? '' : 'none';
    }
    const parts = new Map(ir.parts.map(part => [part.id, part]));
    for (const feature of svg.querySelectorAll<SVGElement>('[data-part-id]')) {
      const part = parts.get(feature.dataset.partId!);
      const matches = !!net && !!part && Object.entries(part.pinMap).some(([pin, pads]) =>
        pads.includes(feature.dataset.featureId ?? '') && part.connections[pin] === net);
      feature.classList.toggle('selected', !!selected && part?.id === selected);
      feature.classList.toggle('net-match', matches);
      feature.classList.toggle('dimmed', !!net && !matches && feature.tagName !== 'text');
    }
  }, [markup, ir, layers, visibility, selected, net]);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const matrix = getSvg()?.getScreenCTM();
      if (!matrix) return;
      event.preventDefault();
      zoom(event.deltaY > 0 ? 1.15 : 1 / 1.15, new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()));
    };
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom]);

  return <div className="canvas-shell">
    <div className="canvas-label"><span className="view-dot" />Front view<span className="canvas-label-separator" />Placement</div>
    <div id="scene" ref={scene} className="board-scene" tabIndex={0} role="region" aria-label="Board canvas. Drag to pan, scroll to zoom. Arrow keys pan; plus and minus zoom; F fits the board."
      onKeyDown={event => {
        if (!viewport.current) return;
        const [x,y,w,h] = viewport.current;
        const moves: Record<string, View> = {ArrowLeft:[x-w/20,y,w,h],ArrowRight:[x+w/20,y,w,h],ArrowUp:[x,y-h/20,w,h],ArrowDown:[x,y+h/20,w,h]};
        if (moves[event.key]) {event.preventDefault(); view(moves[event.key]!);}
        else if (['+', '=', '-'].includes(event.key)) {event.preventDefault(); zoom(event.key === '-' ? 1.25 : 1 / 1.25);}
        else if (event.key.toLowerCase() === 'f') {event.preventDefault(); fit();}
      }}
      onPointerDown={event => {
        if (event.button !== 0 || !viewport.current) return;
        const matrix = getSvg()?.getScreenCTM(); if (!matrix) return;
        scene.current?.focus({preventScroll:true});
        drag.current = {x:event.clientX,y:event.clientY,view:[...viewport.current],inverse:matrix.inverse(),moved:false};
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = 'true';
      }}
      onPointerMove={event => {
        const matrix = getSvg()?.getScreenCTM();
        if (matrix) {
          const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
          setCursor({x:point.x,y:point.y});
        }
        const active = drag.current;
        if (!active) return;
        const start = new DOMPoint(active.x,active.y).matrixTransform(active.inverse);
        const end = new DOMPoint(event.clientX,event.clientY).matrixTransform(active.inverse);
        if (Math.abs(event.clientX-active.x)+Math.abs(event.clientY-active.y)>4) active.moved = true;
        view([active.view[0]+start.x-end.x,active.view[1]+start.y-end.y,active.view[2],active.view[3]]);
      }}
      onPointerUp={event => {
        const active = drag.current;
        drag.current = null;
        delete event.currentTarget.dataset.dragging;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (!active || active.moved) return;
        const item = document.elementFromPoint(event.clientX,event.clientY)?.closest<SVGElement>('[data-part-id]');
        if (item?.dataset.partId) onSelect(item.dataset.partId);
      }}
      onPointerCancel={event => {drag.current = null; delete event.currentTarget.dataset.dragging;}}
      onPointerLeave={() => setCursor(null)}
      dangerouslySetInnerHTML={{__html: markup ?? ''}} />
    {!markup && <div className="canvas-empty"><Crosshair size={32} strokeWidth={1}/><h2>No board loaded</h2><p>A compiled board will appear here.</p></div>}
    <div className="canvas-tools" aria-label="Canvas controls">
      <IconButton id="zoom-out" label="Zoom out" onClick={() => zoom(1.25)} disabled={!markup}><Minus /></IconButton>
      <span id="zoom-level" className="zoom-level">{zoomLevel}%</span>
      <IconButton id="zoom-in" label="Zoom in" onClick={() => zoom(1/1.25)} disabled={!markup}><Plus /></IconButton>
      <span className="tool-divider" />
      <Button id="fit" variant="ghost" size="lg" onClick={fit} disabled={!markup}><Maximize />Fit board</Button>
    </div>
    <div className="canvas-footer"><span><MousePointer2 size={12}/><span>Drag to pan · scroll to zoom</span></span>
      <span className="coordinates">{cursor ? `X ${cursor.x.toFixed(2)}  Y ${cursor.y.toFixed(2)} mm` : 'Coordinates in mm'}</span>
    </div>
  </div>;
}
