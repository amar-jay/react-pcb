import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  MousePointer2,
} from 'lucide-react';
import type { BoardIr, IrPart } from '@react-pcb/core';
import type { PreviewSnapshot } from '../../index.ts';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { InspectorSection, DetailRow } from './inspector-section.tsx';
import { LayerStackup } from './layer-stackup.tsx';

export function Inspector({
  snapshot,
  part,
  net,
  onNet,
}: {
  snapshot: PreviewSnapshot;
  part: IrPart | undefined;
  net: string;
  onNet: (id: string) => void;
}) {
  const ir = snapshot.result?.ir;
  if (!ir)
    return (
      <div className="py-[30px] text-center text-muted-foreground">
        <Crosshair size={28} strokeWidth={1} className="mx-auto mb-4" />
        <h3 className="text-[16px] text-foreground">No board loaded</h3>
        <p className="mt-2 text-[13px] leading-[1.7]">
          Board details appear after the source compiles.
        </p>
      </div>
    );
  return part ? (
    <PartDetails
      snapshot={snapshot}
      ir={ir}
      part={part}
      net={net}
      onNet={onNet}
    />
  ) : (
    <BoardOverview snapshot={snapshot} ir={ir} />
  );
}

function BoardOverview({
  snapshot,
  ir,
}: {
  snapshot: PreviewSnapshot;
  ir: BoardIr;
}) {
  const outline = ir.regions[ir.board.outline]?.geometry;
  const copper = ir.board.layers.stackup.entries.filter(
    (layer) => layer.kind === 'copper',
  );
  const report = snapshot.result?.boardManufacturingReport;
  const metrics = [
    { label: 'Parts', value: ir.parts.length },
    { label: 'Nets', value: ir.nets.length },
    { label: 'Copper layers', value: copper.length },
    {
      label: 'Placed',
      value: ir.parts.filter((item) => item.at).length,
      total: ir.parts.length,
    },
  ];
  return (
    <>
      <Card className="rounded-lg bg-muted py-4">
        <CardContent>
          <span className="text-[12px] text-muted-foreground">
            Board dimensions
          </span>
          <p className="mt-[5px] flex flex-wrap items-baseline gap-[9px]">
            {outline ? (
              <>
                <strong className="font-mono text-[25px] leading-[1.5] font-normal tracking-[-1px] wrap-anywhere">
                  {outline.width}{' '}
                  <span className="text-[19px] text-muted-foreground">×</span>{' '}
                  {outline.height}
                </strong>
                <small className="font-mono text-[12px] [line-height:normal] text-muted-foreground">
                  {ir.units}
                </small>
              </>
            ) : (
              'Unresolved outline'
            )}
          </p>
          {outline && (
            <small className="mt-1 block font-mono text-[11px] leading-[1.5] text-muted-foreground wrap-anywhere">
              Origin {outline.x}, {outline.y} {ir.units}
            </small>
          )}
        </CardContent>
      </Card>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3">
        {metrics.map(({ label, value, total }) => (
          <div key={label}>
            <dt className="text-[12px] text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-mono text-[21px] leading-[1.4]">
              {value}
              {total !== undefined && (
                <small className="text-[13px] text-muted-foreground">
                  {' '}
                  / {total}
                </small>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex gap-2.5 border-t pt-4 text-muted-foreground">
        <MousePointer2 size={16} className="mt-[3px] shrink-0" />
        <p className="text-[12px] leading-[1.7]">
          Select a part on the board or in the parts list to inspect it.
        </p>
      </div>
      {report && (
        <InspectorSection
          title={
            snapshot.error ? 'Last successful board checks' : 'Board checks'
          }
        >
          <dl>
            {report.checks
              .filter((check) => check.id !== 'unverified')
              .map((check) => (
                <DetailRow
                  key={check.id}
                  label={
                    check.id === 'board-copper-spacing'
                      ? 'Copper spacing'
                      : 'Inter-part courtyards'
                  }
                  value={check.status.replaceAll('-', ' ')}
                  status={check.status}
                />
              ))}
          </dl>
          <p className="mt-2.5 text-[11px] leading-[1.7] text-muted-foreground">
            Placed copper and declared courtyard geometry.
          </p>
        </InspectorSection>
      )}
      <LayerStackup ir={ir} />
    </>
  );
}

function PartDetails({
  snapshot,
  ir,
  part,
  net,
  onNet,
}: {
  snapshot: PreviewSnapshot;
  ir: BoardIr;
  part: IrPart;
  net: string;
  onNet: (id: string) => void;
}) {
  const component = ir.componentDefinitions[part.component];
  const report = snapshot.result?.manufacturingReports[part.footprint];
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 font-mono text-[30px] leading-[1.3] wrap-anywhere">
          {part.reference}
        </h3>
        <Badge
          variant="outline"
          className="rounded-[5px] px-[7px] py-1 text-[11px] text-muted-foreground"
        >
          {part.side === 'front' ? 'Front' : 'Back'} side
        </Badge>
      </div>
      <p className="mt-2.5 text-[15px] wrap-anywhere">
        {component?.mpn ?? component?.value ?? part.component}
      </p>
      {component?.manufacturer && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {component.manufacturer}
        </p>
      )}
      <InspectorSection
        title={
          <>
            Placement <small>{ir.units}</small>
          </>
        }
      >
        {part.at ? (
          <dl className="mb-3 grid grid-cols-2 gap-2.5">
            {part.at.map((position, index) => (
              <div key={index} className="min-w-0 rounded-md bg-muted p-3">
                <dt className="text-[11px] text-muted-foreground">
                  {index === 0 ? 'X' : 'Y'} position
                </dt>
                <dd className="font-mono text-[19px] leading-[1.6] wrap-anywhere">
                  {position}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="py-2.5 text-[13px] leading-[1.7] text-muted-foreground">
            Unplaced
          </p>
        )}
        <dl>
          <DetailRow label="Rotation" value={`${part.rotation}°`} />
          <DetailRow
            label="Physical features"
            value={String(Object.keys(part.physicalFeatures).length)}
          />
        </dl>
      </InspectorSection>
      <InspectorSection title="Footprint">
        <p className="rounded-md border bg-muted px-3 py-2.5 font-mono text-[12px] leading-[1.7] wrap-anywhere">
          {part.footprint}
        </p>
      </InspectorSection>
      <InspectorSection
        title={
          <>
            Connections <small>{Object.keys(part.connections).length}</small>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          {Object.entries(part.connections).map(([pin, id]) => (
            <ConnectionButton
              key={pin}
              pin={pin}
              name={ir.nets.find((item) => item.id === id)?.name ?? id}
              active={net === id}
              onClick={() => onNet(net === id ? '' : id)}
            />
          ))}
          {!Object.keys(part.connections).length && (
            <p className="py-2.5 text-[13px] leading-[1.7] text-muted-foreground">
              No connections declared.
            </p>
          )}
        </div>
      </InspectorSection>
      <InspectorSection title="Footprint checks">
        {report ? (
          <details
            className="group/report overflow-hidden rounded-md border"
            key={`${part.id}:${part.footprint}:${report.conformsToCheckedRules}`}
            open={!report.conformsToCheckedRules}
          >
            <summary
              className="flex list-none items-center gap-2 bg-[color-mix(in_srgb,var(--success)_5%,var(--card))] p-[11px] text-[12px] text-success data-[state=failed]:bg-[color-mix(in_srgb,var(--destructive)_5%,var(--card))] data-[state=failed]:text-destructive [&::-webkit-details-marker]:hidden"
              data-state={report.conformsToCheckedRules ? 'passed' : 'failed'}
            >
              {report.conformsToCheckedRules ? (
                <Check size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span className="flex-1">
                {report.conformsToCheckedRules
                  ? 'Checked rules pass'
                  : 'Rule failures'}
              </span>
              <ChevronDown size={14} className="group-open/report:rotate-180" />
            </summary>
            <div className="border-t p-3">
              <p className="mb-2 font-mono text-[11px] leading-[1.7] text-muted-foreground wrap-anywhere">
                {report.profile.key}
              </p>
              <dl>
                {report.checks.map((check) => (
                  <DetailRow
                    key={check.id}
                    label={check.id}
                    value={check.status.replaceAll('-', ' ')}
                    status={check.status}
                    compact
                  />
                ))}
              </dl>
            </div>
          </details>
        ) : (
          <p className="py-2.5 text-[13px] leading-[1.7] text-muted-foreground">
            No report for this footprint.
          </p>
        )}
        {report && (
          <p className="mt-2.5 text-[11px] leading-[1.7] text-muted-foreground">
            Checks cover selected rules for this footprint.
          </p>
        )}
      </InspectorSection>
    </>
  );
}

function ConnectionButton({
  pin,
  name,
  active,
  onClick,
}: {
  pin: string;
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-[39px] w-full items-center gap-2.5 rounded-md border bg-card px-[11px] py-2 text-left hover:border-primary aria-pressed:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] aria-pressed:bg-secondary"
      aria-pressed={active}
      onClick={onClick}
      title={`Highlight ${name}`}
    >
      <span className="min-w-[26px] font-mono text-[12px] [line-height:normal] text-muted-foreground wrap-anywhere">
        {pin}
      </span>
      <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
      <span className="ml-auto min-w-0 text-[13px] text-primary wrap-anywhere">
        {name}
      </span>
    </button>
  );
}
