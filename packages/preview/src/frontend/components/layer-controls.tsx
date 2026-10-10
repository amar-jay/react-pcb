import type { SceneLayer } from '../lib/scene.ts';
import { cn } from '../lib/utils';

type LayerControlsProps = {
  items: SceneLayer[];
  visibility: Record<string, boolean>;
  onToggle: (key: string, visible: boolean) => void;
};

export function LayerList({ items, visibility, onToggle }: LayerControlsProps) {
  return items.map((layer) => (
    <label
      key={layer.key}
      title={layer.id}
      className={cn(
        'flex min-h-[49px] cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-[7px] hover:bg-muted',
        layer.overlay && 'min-h-[38px]',
      )}
    >
      <input
        type="checkbox"
        className="m-0 size-[15px] shrink-0 cursor-pointer accent-primary"
        aria-label={layer.name}
        checked={visibility[layer.key] ?? layer.visible}
        onChange={(event) => onToggle(layer.key, event.target.checked)}
      />
      <span
        className={cn(
          'h-7 w-[3px] shrink-0 rounded-[3px] border border-[#343b4810]',
          layer.overlay && 'size-[9px]',
        )}
        style={{ background: layer.color }}
      />
      <span
        className={cn(
          'min-w-0 text-[14px] leading-[1.3] font-normal wrap-anywhere',
          layer.overlay && 'text-[13px]',
        )}
      >
        {layer.name}
        {!layer.overlay && (
          <small className="mt-[5px] block text-[11px] text-muted-foreground">
            {layer.category === 'copper'
              ? layer.detail.charAt(0).toUpperCase() + layer.detail.slice(1)
              : layer.detail}
          </small>
        )}
      </span>
    </label>
  ));
}

export function TechnicalLayers({
  items,
  visibility,
  onToggle,
}: LayerControlsProps) {
  return [...new Set(items.map((layer) => layer.group))].map((name) => {
    const pair = items.filter((layer) => layer.group === name);
    // Duplicate sides must remain independently addressable by their stable layer keys.
    if (new Set(pair.map((layer) => layer.side)).size < pair.length)
      return (
        <div key={name}>
          <h3 className="px-1.5 py-[7px] text-[13px] font-normal">{name}</h3>
          <LayerList items={pair} visibility={visibility} onToggle={onToggle} />
        </div>
      );
    return (
      <div
        key={name}
        className="flex min-h-[37px] items-center gap-[9px] px-1.5 py-[5px] text-[13px]"
      >
        <span
          className="size-[9px] shrink-0 rounded-[3px] border border-[#343b4820]"
          style={{ background: pair[0]!.color }}
        />
        <span>{name}</span>
        <div className="ml-auto grid grid-cols-[27px_27px] items-center gap-1">
          {pair.map((layer) => (
            <LayerSideToggle
              key={layer.key}
              layer={layer}
              checked={visibility[layer.key] ?? layer.visible}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
    );
  });
}

function LayerSideToggle({
  layer,
  checked,
  onToggle,
}: {
  layer: SceneLayer;
  checked: boolean;
  onToggle: LayerControlsProps['onToggle'];
}) {
  return (
    <label
      className="group/side relative cursor-pointer data-[side=front]:col-start-1 data-[side=front]:row-start-1 data-[side=back]:col-start-2 data-[side=back]:row-start-1 data-[side=shared]:col-span-full data-[side=shared]:justify-self-end"
      data-side={layer.side ?? 'shared'}
      title={`${layer.name} · ${layer.id}`}
    >
      <input
        type="checkbox"
        className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
        aria-label={layer.name}
        checked={checked}
        onChange={(event) => onToggle(layer.key, event.target.checked)}
      />
      <span className="grid h-[26px] w-[27px] place-items-center rounded-[5px] border bg-card font-mono text-[11px] [line-height:normal] text-muted-foreground peer-checked:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] peer-checked:bg-secondary peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary group-hover/side:border-primary">
        {layer.side === 'front' ? 'F' : layer.side === 'back' ? 'B' : '•'}
      </span>
    </label>
  );
}
