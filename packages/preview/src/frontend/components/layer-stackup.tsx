import type { BoardIr } from '@react-pcb/core';
import { cn } from '../lib/utils';
import { InspectorSection } from './inspector-section.tsx';

export function LayerStackup({ ir }: { ir: BoardIr }) {
  const stackup = ir.board.layers.stackup.entries;
  const copper = stackup.filter((layer) => layer.kind === 'copper');
  return (
    <InspectorSection
      title={
        <>
          Layer stackup <small>Front → back</small>
        </>
      }
      className="mt-5 pt-[18px]"
    >
      <div
        className="mb-3 flex flex-col gap-px rounded-md bg-muted px-3.5 py-1.5"
        aria-hidden="true"
      >
        {stackup.map((layer) => (
          <span
            key={layer.id}
            className={cn(
              'rounded-[1px]',
              layer.kind === 'copper'
                ? 'h-0.5 bg-[#ce9b68]'
                : 'h-[3px] border border-muted-foreground/15 bg-[color-mix(in_srgb,var(--muted-foreground)_18%,var(--card))]',
            )}
          />
        ))}
      </div>
      <div>
        {stackup.map((layer) => {
          const depth = copper.findIndex((item) => item.id === layer.id);
          const name =
            layer.kind === 'dielectric'
              ? layer.material
              : depth === 0
                ? 'Front copper'
                : depth === copper.length - 1
                  ? 'Back copper'
                  : `Inner copper ${depth}`;
          return (
            <div
              key={layer.id}
              title={layer.id}
              className="flex items-center gap-2.5 border-b py-[5px] last:border-0"
            >
              <span
                className={cn(
                  'h-[29px] w-[3px] shrink-0 rounded-[2px] bg-muted-foreground/35',
                  layer.kind === 'copper' && 'bg-[#ce9b68]',
                )}
              />
              <div className="min-w-0 flex-1">
                <strong className="block text-[13px] leading-[1.4] font-normal wrap-anywhere">
                  {name}
                </strong>
                <small className="mt-0.5 block text-[11px] leading-[1.35] text-muted-foreground">
                  {layer.kind === 'copper' ? layer.usage : 'Dielectric'}
                </small>
              </div>
              <span className="text-right font-mono text-[12px] [line-height:normal]">
                {layer.thickness}
                <small className="mt-0.5 block font-mono text-[10px] [line-height:normal] text-muted-foreground">
                  {ir.units}
                </small>
              </span>
            </div>
          );
        })}
      </div>
    </InspectorSection>
  );
}
