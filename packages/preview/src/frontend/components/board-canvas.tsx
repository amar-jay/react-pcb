import {
  useCallback,
  useImperativeHandle,
  type Ref,
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Crosshair, Maximize, Minus, Plus, Ruler, X } from 'lucide-react';
import type { BoardIr } from '@react-pcb/core';
import type { SceneLayer } from '../lib/scene.ts';
import { boardSize } from '../lib/scene.ts';
import {
  applyScenePresentation,
  type ScenePresentation,
} from '../lib/scene-presentation.ts';
import {
  rulerTicks,
  measureDistance,
  type RulerTick,
  type CanvasPoint,
} from '../lib/ruler.ts';
import {
  CanvasMeasurement,
  type CanvasViewport,
} from './canvas-measurement.tsx';
import { IconButton } from './icon-button.tsx';
import { Button } from './ui/button';

type View = [number, number, number, number];
export type CanvasActions = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleMeasurement: () => void;
  clearMeasurement: () => void;
};

type Props = {
  ref?: Ref<CanvasActions>;
  svg: string | null;
  ir: BoardIr | undefined;
  layers: SceneLayer[];
  visibility: Record<string, boolean>;
  selected: string | null;
  net: string;
  onSelect: (id: string) => void;
  statusControls: ReactNode;
  presentation: ScenePresentation;
};

export function BoardCanvas({
  ref,
  svg: markup,
  ir,
  layers,
  visibility,
  selected,
  net,
  onSelect,
  statusControls,
  presentation,
}: Props) {
  const scene = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useRef<View | null>(null);
  const fitted = useRef<View | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    view: View;
    inverse: DOMMatrix;
    moved: boolean;
    measuring: boolean;
    selecting: boolean;
  } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measurementStart, setMeasurementStart] = useState<CanvasPoint | null>(
    null,
  );
  const [measurementEnd, setMeasurementEnd] = useState<CanvasPoint | null>(
    null,
  );
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport | null>(
    null,
  );
  const clearMeasurement = () => {
    setMeasurementStart(null);
    setMeasurementEnd(null);
  };
  const toggleMeasurement = () => {
    if (measuring && !measurementEnd) clearMeasurement();
    setMeasuring(!measuring);
  };
  const [zoomLevel, setZoomLevel] = useState(100);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [rulers, setRulers] = useState<{ x: RulerTick[]; y: RulerTick[] }>({
    x: [],
    y: [],
  });
  const measure = useCallback(() => {
    const matrix = scene.current?.querySelector('svg')?.getScreenCTM();
    const bounds = shell.current?.getBoundingClientRect();
    if (!matrix || !bounds) return;
    setCanvasViewport({
      transform: {
        a: matrix.a,
        b: matrix.b,
        c: matrix.c,
        d: matrix.d,
        e: matrix.e - bounds.left,
        f: matrix.f - bounds.top,
      },
      width: bounds.width,
      height: bounds.height,
    });
    setRulers({
      x: rulerTicks(matrix.a, matrix.e - bounds.left, bounds.width),
      y: rulerTicks(matrix.d, matrix.f - bounds.top, bounds.height),
    });
  }, []);
  const fitView = useMemo(() => {
    if (!markup) return null;
    return new DOMParser()
      .parseFromString(markup, 'image/svg+xml')
      .documentElement.getAttribute('viewBox')!
      .trim()
      .split(/\s+/)
      .map(Number) as View;
  }, [markup]);
  // SVG world coordinates use millimetres: keep a 1 mm grid anchored at (0, 0).
  const gridWidth = canvasViewport ? Math.abs(canvasViewport.transform.a) : 20;
  const gridHeight = canvasViewport ? Math.abs(canvasViewport.transform.d) : 20;
  const dotRadius = Math.min(1.1, gridWidth / 10, gridHeight / 10);

  const measurementTarget =
    measurementEnd ?? (measurementStart && measuring ? cursor : null);
  const measurement =
    measurementStart && measurementTarget
      ? measureDistance(measurementStart, measurementTarget)
      : null;

  useEffect(() => {
    setMeasurementStart(null);
    setMeasurementEnd(null);
    if (!markup) setMeasuring(false);
  }, [markup]);

  const getSvg = () => scene.current?.querySelector('svg');
  const view = useCallback(
    (values: View) => {
      const svg = scene.current?.querySelector('svg');
      if (
        !svg ||
        values.some((value) => !Number.isFinite(value)) ||
        values[2] <= 0 ||
        values[3] <= 0
      )
        return;
      viewport.current = values;
      svg.setAttribute('viewBox', values.join(' '));
      measure();
      if (fitted.current)
        setZoomLevel(Math.round((fitted.current[2] / values[2]) * 100));
    },
    [measure],
  );
  const zoom = useCallback(
    (factor: number, point?: { x: number; y: number }) => {
      if (!viewport.current || !fitted.current) return;
      const [x, y, w, h] = viewport.current;
      const scale = fitted.current[2] / (w * factor);
      if (scale < 0.1 || scale > 100) return;
      const px = point?.x ?? x + w / 2;
      const py = point?.y ?? y + h / 2;
      view([
        px + (x - px) * factor,
        py + (y - py) * factor,
        w * factor,
        h * factor,
      ]);
    },
    [view],
  );
  const fit = () => {
    if (fitted.current) view([...fitted.current]);
  };

  useImperativeHandle(ref, () => {
    const run = (action: () => void) => () => {
      action();
      scene.current?.focus({ preventScroll: true });
    };
    return {
      fit: run(fit),
      zoomIn: run(() => zoom(1 / 1.25)),
      zoomOut: run(() => zoom(1.25)),
      toggleMeasurement: run(toggleMeasurement),
      clearMeasurement: run(clearMeasurement),
    };
  });

  useLayoutEffect(() => {
    const svg = getSvg();
    if (!svg || !fitView) return;
    fitted.current = fitView;
    view(viewport.current ?? fitted.current);
  }, [fitView, markup, view]);

  useLayoutEffect(() => {
    const svg = getSvg();
    if (!svg || !ir) return;
    applyScenePresentation(svg, layers, visibility, presentation);
    const parts = new Map(ir.parts.map((part) => [part.id, part]));
    for (const feature of svg.querySelectorAll<SVGElement>('[data-part-id]')) {
      const part = parts.get(feature.dataset.partId!);
      const matches =
        !!net &&
        !!part &&
        Object.entries(part.pinMap).some(
          ([pin, pads]) =>
            pads.includes(feature.dataset.featureId ?? '') &&
            part.connections[pin] === net,
        );
      feature.classList.toggle('selected', !!selected && part?.id === selected);
      feature.classList.toggle('net-match', matches);
      feature.classList.toggle(
        'dimmed',
        !!net && !matches && feature.tagName !== 'text',
      );
    }
  }, [
    markup,
    ir,
    layers,
    visibility,
    selected,
    net,
    presentation.view,
    presentation.theme,
  ]);

  useEffect(() => {
    if (!shell.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(shell.current);
    if (scene.current) observer.observe(scene.current);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const matrix = getSvg()?.getScreenCTM();
      if (!matrix) return;
      event.preventDefault();
      zoom(
        event.deltaY > 0 ? 1.15 : 1 / 1.15,
        new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        ),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom]);

  return (
    <>
      <div
        id="canvas-surface"
        className="relative min-h-[340px] flex-1 overflow-hidden bg-canvas bg-[radial-gradient(var(--canvas-dot)_var(--canvas-dot-radius),transparent_var(--canvas-dot-radius))] max-[701px]:min-h-[400px]"
        ref={shell}
        style={
          {
            '--canvas-dot-radius': `${dotRadius}px`,
            backgroundSize: `${gridWidth}px ${gridHeight}px`,
            backgroundPosition: canvasViewport
              ? `${canvasViewport.transform.e - gridWidth / 2}px ${canvasViewport.transform.f - gridHeight / 2}px`
              : '0px 0px',
          } as CSSProperties
        }
      >
        <div
          className="absolute top-0 left-0 z-2 grid size-7 place-items-center border-r border-b bg-card font-mono text-[10px] leading-normal text-muted-foreground"
          aria-hidden="true"
        >
          mm
        </div>
        <div
          className="pointer-events-none absolute z-1 overflow-hidden bg-[color-mix(in_srgb,var(--card)_75%,var(--canvas))] font-mono text-[10px] leading-normal text-muted-foreground inset-x-0 top-0 h-7 border-b [&>span]:absolute [&>span]:inset-y-0 [&>span]:flex [&>span]:items-center [&>span]:border-l [&>span]:border-muted-foreground/30 [&>span]:pl-[5px]"
          aria-hidden="true"
        >
          {rulers.x.map((tick) => (
            <span key={tick.value} style={{ left: tick.position }}>
              {tick.label}
            </span>
          ))}
        </div>
        <div
          className="pointer-events-none absolute z-1 overflow-hidden bg-[color-mix(in_srgb,var(--card)_75%,var(--canvas))] font-mono text-[10px] leading-normal text-muted-foreground top-0 bottom-0 left-0 w-7 border-r [&>span]:absolute [&>span]:inset-x-0 [&>span]:border-t [&>span]:border-muted-foreground/30 [&>span]:pt-1 [&>span]:pl-[3px] [&>span]:text-[9px]"
          aria-hidden="true"
        >
          {rulers.y.map((tick) => (
            <span key={tick.value} style={{ top: tick.position }}>
              {tick.label}
            </span>
          ))}
        </div>
        {measurementStart && measurementTarget && canvasViewport && (
          <CanvasMeasurement
            start={measurementStart}
            end={measurementTarget}
            viewport={canvasViewport}
            complete={Boolean(measurementEnd)}
          />
        )}
        {ir && (
          <div className="absolute top-[45px] right-[38px] font-mono text-[11px] leading-normal text-canvas-text max-[1401px]:hidden">
            {boardSize(ir)}
          </div>
        )}
        <div
          id="scene"
          data-view={presentation.view}
          ref={scene}
          className="absolute top-[66px] right-[42px] bottom-[54px] left-[54px] touch-none cursor-grab data-[measuring=true]:cursor-crosshair data-[measuring=true]:[&_[data-part-id]]:cursor-crosshair data-[dragging=true]:cursor-grabbing focus-visible:rounded-[2px] focus-visible:outline-offset-[5px] max-[701px]:top-[72px] max-[701px]:right-3 max-[701px]:bottom-[62px] max-[701px]:left-10 [&_svg]:block [&_svg]:size-full [&_svg]:overflow-visible data-[view=board]:[&_svg]:drop-shadow-[0_9px_12px_#233d3426] [&_[data-part-id]]:cursor-pointer [&_.selected]:[filter:drop-shadow(0_0_0.18px_#c6e6ff)_drop-shadow(0_0_0.28px_#8fc3ef)] [&_.net-match]:drop-shadow-[0_0_0.4px_#fff0af] [&_.dimmed]:opacity-[0.19] data-[view=analysis]:[&_.dimmed]:opacity-50 data-[view=analysis]:[&_.selected]:[filter:drop-shadow(0_0_0.1px_#555bd5)_drop-shadow(0_0_0.2px_#555bd5)]"
          data-measuring={measuring}
          tabIndex={0}
          role="region"
          aria-label="Board canvas. Drag to pan, scroll to zoom. Arrow keys pan; plus and minus zoom; F fits the board. R toggles distance measurement; Escape clears it. Alt-drag pans while measuring."
          onKeyDown={(event) => {
            if (event.key.toLowerCase() === 'r' && markup) {
              event.preventDefault();
              toggleMeasurement();
              return;
            }
            if (event.key === 'Escape' && (measuring || measurementStart)) {
              event.preventDefault();
              clearMeasurement();
              setMeasuring(false);
              return;
            }
            if (!viewport.current) return;
            const [x, y, w, h] = viewport.current;
            const moves: Record<string, View> = {
              ArrowLeft: [x - w / 20, y, w, h],
              ArrowRight: [x + w / 20, y, w, h],
              ArrowUp: [x, y - h / 20, w, h],
              ArrowDown: [x, y + h / 20, w, h],
            };
            if (moves[event.key]) {
              event.preventDefault();
              view(moves[event.key]!);
            } else if (['+', '=', '-'].includes(event.key)) {
              event.preventDefault();
              zoom(event.key === '-' ? 1.25 : 1 / 1.25);
            } else if (event.key.toLowerCase() === 'f') {
              event.preventDefault();
              fit();
            }
          }}
          onPointerDown={(event) => {
            if (![0, 1].includes(event.button) || !viewport.current) return;
            event.preventDefault();
            const matrix = getSvg()?.getScreenCTM();
            if (!matrix) return;
            scene.current?.focus({ preventScroll: true });
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              view: [...viewport.current],
              inverse: matrix.inverse(),
              moved: false,
              measuring: measuring && event.button === 0 && !event.altKey,
              selecting: !measuring && event.button === 0 && !event.altKey,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!drag.current.measuring)
              event.currentTarget.dataset.dragging = 'true';
          }}
          onPointerMove={(event) => {
            const matrix = getSvg()?.getScreenCTM();
            if (matrix) {
              const point = new DOMPoint(
                event.clientX,
                event.clientY,
              ).matrixTransform(matrix.inverse());
              setCursor({ x: point.x, y: point.y });
            }
            const active = drag.current;
            if (!active) return;
            const start = new DOMPoint(active.x, active.y).matrixTransform(
              active.inverse,
            );
            const end = new DOMPoint(
              event.clientX,
              event.clientY,
            ).matrixTransform(active.inverse);
            if (
              Math.abs(event.clientX - active.x) +
                Math.abs(event.clientY - active.y) >
              4
            )
              active.moved = true;
            if (active.measuring) return;
            view([
              active.view[0] + start.x - end.x,
              active.view[1] + start.y - end.y,
              active.view[2],
              active.view[3],
            ]);
          }}
          onPointerUp={(event) => {
            const active = drag.current;
            drag.current = null;
            delete event.currentTarget.dataset.dragging;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            if (!active || active.moved) return;
            if (active.measuring) {
              const point = new DOMPoint(
                event.clientX,
                event.clientY,
              ).matrixTransform(active.inverse);
              const next = { x: point.x, y: point.y };
              if (!measurementStart || measurementEnd) {
                setMeasurementStart(next);
                setMeasurementEnd(null);
              } else {
                setMeasurementEnd(next);
              }
              return;
            }
            if (!active.selecting) return;
            const item = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<SVGElement>('[data-part-id]');
            if (item?.dataset.partId) onSelect(item.dataset.partId);
          }}
          onPointerCancel={(event) => {
            drag.current = null;
            delete event.currentTarget.dataset.dragging;
          }}
          onPointerLeave={() => setCursor(null)}
          dangerouslySetInnerHTML={{ __html: markup ?? '' }}
        />
        {!markup && (
          <div className="pointer-events-none absolute top-[38%] right-[15%] left-[15%] text-center text-canvas-text [&>svg]:mx-auto [&>svg]:mb-4 [&>svg]:text-primary [&_h2]:text-[18px] [&_h2]:font-medium [&_h2]:text-foreground [&_p]:mt-2 [&_p]:text-[13px]">
            <Crosshair size={32} strokeWidth={1} />
            <h2>No board loaded</h2>
            <p>A compiled board will appear here.</p>
          </div>
        )}
        <div
          className="absolute bottom-[19px] left-1/2 z-3 flex -translate-x-1/2 items-center rounded-[9px] border bg-card px-1.5 py-[5px] whitespace-nowrap shadow-[0_4px_12px_#202c3f16] max-[701px]:bottom-[17px] max-[701px]:p-1 [&_[data-slot=button]]:gap-2 [&_[data-slot=button]]:text-[12px]"
          aria-label="Canvas controls"
        >
          <IconButton
            id="zoom-out"
            label="Zoom out"
            onClick={() => zoom(1.25)}
            disabled={!markup}
          >
            <Minus />
          </IconButton>
          <span
            id="zoom-level"
            className="min-w-[58px] px-[5px] text-center font-mono text-[12px] leading-normal max-[701px]:min-w-[50px]"
          >
            {zoomLevel}%
          </span>
          <IconButton
            id="zoom-in"
            label="Zoom in"
            onClick={() => zoom(1 / 1.25)}
            disabled={!markup}
          >
            <Plus />
          </IconButton>
          <span className="mx-2.5 h-5 w-px bg-border max-[701px]:mx-[5px]" />
          <Button
            id="fit"
            aria-label="Fit board"
            variant="ghost"
            size="lg"
            onClick={fit}
            disabled={!markup}
          >
            <Maximize />
            <span className="max-sm:hidden">Fit board</span>
          </Button>
          <span className="mx-2 h-5 w-px bg-border max-[701px]:mx-1" />
          <IconButton
            id="measure-toggle"
            label="Measure distance (R)"
            aria-pressed={measuring}
            className="aria-pressed:bg-secondary aria-pressed:text-primary"
            onClick={toggleMeasurement}
            disabled={!markup}
          >
            <Ruler />
          </IconButton>
          {measurementStart && (
            <IconButton
              id="clear-measurement"
              label="Clear measurement"
              onClick={clearMeasurement}
            >
              <X />
            </IconButton>
          )}
        </div>
      </div>
      <div
        id="canvas-status-bar"
        className="flex min-h-11 shrink-0 items-center gap-2 border-t px-3"
      >
        {statusControls}
        {measuring || measurementStart ? (
          <output
            aria-label="Measured distance"
            className="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
            title={
              measurement
                ? `ΔX ${measurement.dx.toFixed(3)} mm · ΔY ${measurement.dy.toFixed(3)} mm`
                : undefined
            }
          >
            {measurement
              ? `${measurement.length.toFixed(3)} mm`
              : measurementStart
                ? 'Pick end point'
                : 'Pick start point'}
          </output>
        ) : (
          <output
            aria-label="Cursor coordinates"
            className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground max-sm:gap-1"
          >
            X{' '}
            <span
              className="min-w-[29px] max-w-[64px] truncate text-foreground max-sm:min-w-5 max-sm:max-w-10"
              title={cursor?.x.toFixed(2)}
            >
              {cursor ? cursor.x.toFixed(2) : '—'}
            </span>
            <span className="mx-0.5 h-[11px] w-px bg-border" />Y{' '}
            <span
              className="min-w-[29px] max-w-[64px] truncate text-foreground max-sm:min-w-5 max-sm:max-w-10"
              title={cursor?.y.toFixed(2)}
            >
              {cursor ? cursor.y.toFixed(2) : '—'}
            </span>
            <span className="max-sm:hidden">mm</span>
          </output>
        )}
      </div>
    </>
  );
}
