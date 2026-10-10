import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardInspection, InspectedFootprint } from '../../inspection.ts';
import {
  applyScenePresentation,
  analysisLayerColor,
  exportBoardSvg,
  type ScenePresentation,
} from '../lib/scene-presentation.ts';
import { download } from '../lib/scene.ts';
import { LayerList } from '../components/layer-controls.tsx';
import { LayerPresetSelect } from '../components/layer-preset-select.tsx';
import { presetVisibility, matchingLayerPreset } from '../lib/layer-presets.ts';
import { Button } from '../components/ui/button.tsx';
import { InspectionReport } from './report.tsx';

export function FootprintInspectionCard({
  item,
  snapshot,
  presentation,
}: {
  item: InspectedFootprint;
  snapshot: BoardInspection;
  presentation: ScenePresentation;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const svg = scene.current?.querySelector('svg');
    if (svg) applyScenePresentation(svg, item.layers, visibility, presentation);
  }, [item, visibility, presentation.view, presentation.theme]);
  const layers = useMemo(
    () =>
      item.layers.map((layer) => ({
        ...layer,
        color:
          presentation.view === 'analysis'
            ? analysisLayerColor(layer, presentation.theme === 'dark')
            : layer.color,
      })),
    [item, presentation.view, presentation.theme],
  );
  const components = [
    ...new Set(
      item.parts
        .map((part) => {
          const component =
            snapshot.result.ir.componentDefinitions[part.component];
          return [component?.manufacturer, component?.mpn ?? component?.value]
            .filter(Boolean)
            .join(' · ');
        })
        .filter(Boolean),
    ),
  ];
  const dimensions = item.physical
    ? item.physical.bounds.max2.map(
        (max, axis) => (max - item.physical!.bounds.min2[axis]!) / 2_000_000,
      )
    : null;
  const saveSvg = () => {
    if (item.svg)
      download(
        `${item.key.replace(/[^\w-]+/g, '-')}.svg`,
        exportBoardSvg(item.svg, item.layers, visibility, presentation),
        'image/svg+xml',
      );
  };
  return (
    <article
      data-footprint-key={item.key}
      className="min-w-0 overflow-hidden rounded-lg border bg-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-[13px] font-medium wrap-anywhere">
            {item.key}
          </h2>
          {components.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground wrap-anywhere">
              {components.join(' / ')}
            </p>
          )}
        </div>
        {dimensions && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {dimensions.map((value) => Number(value.toFixed(4))).join(' × ')} mm
          </span>
        )}
      </header>
      {item.svg ? (
        <div
          ref={scene}
          aria-label={`${item.key} footprint geometry`}
          className="h-[310px] p-5 [&_svg]:block [&_svg]:size-full max-sm:h-[270px]"
          dangerouslySetInnerHTML={{ __html: item.svg }}
        />
      ) : (
        <p className="px-4 py-8 text-[13px] text-muted-foreground">
          No canonical physical geometry is available for this footprint.
        </p>
      )}
      <div className="border-t px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
          <span className="text-muted-foreground">
            {item.parts.length} {item.parts.length === 1 ? 'part' : 'parts'}
          </span>
          {item.parts.map((part) => (
            <span
              key={part.id}
              className="font-mono"
              title={
                part.at
                  ? `${part.side} · ${part.rotation}° · ${part.at.join(', ')} ${snapshot.result.ir.units}`
                  : 'Unplaced'
              }
            >
              {part.id}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.svg && (
            <Button
              variant="outline"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              Layers
            </Button>
          )}
          {item.svg && (
            <Button variant="ghost" onClick={saveSvg}>
              Save SVG
            </Button>
          )}
          {item.files.geometry && (
            <Button asChild variant="ghost">
              <a href={item.files.geometry} download>
                Geometry JSON
              </a>
            </Button>
          )}
          <Button asChild variant="ghost">
            <a href={item.files.definition} download>
              Definition JSON
            </a>
          </Button>
          {item.report && (
            <Button asChild variant="ghost">
              <a href={item.files.manufacturing} download>
                Checks JSON
              </a>
            </Button>
          )}
        </div>
        {expanded && (
          <div className="mt-3 border-t pt-3">
            <LayerPresetSelect
              value={matchingLayerPreset(item.layers, visibility)}
              disabled={false}
              onSelect={(preset) =>
                setVisibility(presetVisibility(item.layers, preset))
              }
            />
            <div className="grid grid-cols-2 gap-x-2 max-sm:grid-cols-1">
              <LayerList
                items={layers}
                visibility={visibility}
                onToggle={(key, visible) =>
                  setVisibility((current) => ({ ...current, [key]: visible }))
                }
              />
            </div>
          </div>
        )}
        <div className="mt-3 border-t pt-3">
          <InspectionReport report={item.report} />
        </div>
      </div>
    </article>
  );
}
