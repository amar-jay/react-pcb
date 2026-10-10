import {
  measureDistance,
  projectPoint,
  type CanvasPoint,
  type CanvasTransform,
} from '../lib/ruler.ts';

export type CanvasViewport = {
  transform: CanvasTransform;
  width: number;
  height: number;
};

export function CanvasMeasurement({
  start,
  end,
  viewport,
  complete,
}: {
  start: CanvasPoint;
  end: CanvasPoint;
  viewport: CanvasViewport;
  complete: boolean;
}) {
  const from = projectPoint(start, viewport.transform);
  const to = projectPoint(end, viewport.transform);
  const { length } = measureDistance(start, end);
  const left = Math.max(70, Math.min((from.x + to.x) / 2, viewport.width - 70));
  const top = Math.max(
    40,
    Math.min((from.y + to.y) / 2 - 14, viewport.height - 30),
  );
  return (
    <div
      className="pointer-events-none absolute inset-0 z-2 overflow-hidden"
      aria-hidden="true"
      data-measurement
      data-complete={complete}
    >
      <svg className="absolute inset-0 size-full overflow-visible text-primary">
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray={complete ? undefined : '5 4'}
        />
        <circle
          cx={from.x}
          cy={from.y}
          r={4}
          className="fill-primary stroke-card"
          strokeWidth={2}
        />
        <circle
          cx={to.x}
          cy={to.y}
          r={4}
          className="fill-primary stroke-card"
          strokeWidth={2}
        />
      </svg>
      <span
        data-measurement-label
        className="absolute -translate-x-1/2 -translate-y-full rounded-sm border bg-card px-2 py-1 font-mono text-[11px] text-foreground shadow-sm"
        style={{ left, top }}
      >
        {length.toFixed(3)} mm
      </span>
    </div>
  );
}
