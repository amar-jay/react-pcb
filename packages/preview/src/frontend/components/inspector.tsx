import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  MousePointer2,
} from 'lucide-react';
import type { IrPart } from '@react-pcb/core';
import type { PreviewSnapshot } from '../../index.ts';
import { Badge } from './ui/badge';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

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
      <div className="inspector-empty">
        <Crosshair size={28} strokeWidth={1} />
        <h3>No board loaded</h3>
        <p>Board details appear after the source compiles.</p>
      </div>
    );
  const outline = ir.regions[ir.board.outline]?.geometry;
  const stackup = ir.board.layers.stackup.entries;
  const copper = stackup.filter((layer) => layer.kind === 'copper');
  const boardReport = snapshot.result?.boardManufacturingReport;
  if (!part)
    return (
      <>
        <div className="board-dimensions">
          <span className="inspector-caption">Board dimensions</span>
          <p>
            {outline ? (
              <>
                <strong>
                  {outline.width} <span>×</span> {outline.height}
                </strong>
                <small>{ir.units}</small>
              </>
            ) : (
              'Unresolved outline'
            )}
          </p>
          {outline && (
            <small className="board-origin">
              Origin {outline.x}, {outline.y} {ir.units}
            </small>
          )}
        </div>
        <dl className="board-metrics">
          <div>
            <dt>Parts</dt>
            <dd>{ir.parts.length}</dd>
          </div>
          <div>
            <dt>Nets</dt>
            <dd>{ir.nets.length}</dd>
          </div>
          <div>
            <dt>Copper layers</dt>
            <dd>{copper.length}</dd>
          </div>
          <div>
            <dt>Placed</dt>
            <dd>
              {ir.parts.filter((item) => item.at).length}
              <small> / {ir.parts.length}</small>
            </dd>
          </div>
        </dl>
        <div className="selection-hint">
          <MousePointer2 size={16} />
          <p>Select a part on the board or in the parts list to inspect it.</p>
        </div>
        {boardReport && (
          <section className="inspector-section board-check-section">
            <h4>
              {snapshot.error ? 'Last successful board checks' : 'Board checks'}
            </h4>
            <dl className="board-checks">
              {boardReport.checks
                .filter((check) => check.id !== 'unverified')
                .map((check) => (
                  <div className="detail-row" key={check.id}>
                    <dt>
                      {check.id === 'board-copper-spacing'
                        ? 'Copper spacing'
                        : 'Inter-part courtyards'}
                    </dt>
                    <dd data-status={check.status}>
                      {check.status.replaceAll('-', ' ')}
                    </dd>
                  </div>
                ))}
            </dl>
            <p className="scope-note">
              Placed copper and declared courtyard geometry.
            </p>
          </section>
        )}
        <section className="inspector-section stackup-section">
          <h4>
            Layer stackup <small>Front → back</small>
          </h4>
          <div className="stackup-diagram" aria-hidden="true">
            {stackup.map((layer) => (
              <span key={layer.id} className={layer.kind} />
            ))}
          </div>
          <div className="stackup-list">
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
                  className={`stackup-entry ${layer.kind}`}
                  title={layer.id}
                >
                  <span className="stackup-swatch" />
                  <div>
                    <strong>{name}</strong>
                    <small>
                      {layer.kind === 'copper' ? layer.usage : 'Dielectric'}
                    </small>
                  </div>
                  <span className="stackup-thickness">
                    {layer.thickness}
                    <small>{ir.units}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  const component = ir.componentDefinitions[part.component];
  const report = snapshot.result?.manufacturingReports[part.footprint];
  return (
    <>
      <div className="selected-part-heading">
        <h3>{part.reference}</h3>
        <Badge variant="outline">
          {part.side === 'front' ? 'Front' : 'Back'} side
        </Badge>
      </div>
      <p className="selected-part-name">
        {component?.mpn ?? component?.value ?? part.component}
      </p>
      {component?.manufacturer && (
        <p className="manufacturer">{component.manufacturer}</p>
      )}
      <section className="inspector-section">
        <h4>
          Placement <small>{ir.units}</small>
        </h4>
        {part.at ? (
          <dl className="placement-position">
            <div>
              <dt>X position</dt>
              <dd>{part.at[0]}</dd>
            </div>
            <div>
              <dt>Y position</dt>
              <dd>{part.at[1]}</dd>
            </div>
          </dl>
        ) : (
          <p className="empty-copy">Unplaced</p>
        )}
        <dl>
          <Detail label="Rotation" value={`${part.rotation}°`} />
          <Detail
            label="Physical features"
            value={String(Object.keys(part.physicalFeatures).length)}
          />
        </dl>
      </section>
      <section className="inspector-section">
        <h4>Footprint</h4>
        <p className="footprint-key">{part.footprint}</p>
      </section>
      <section className="inspector-section">
        <h4>
          Connections <small>{Object.keys(part.connections).length}</small>
        </h4>
        <div className="connections">
          {Object.entries(part.connections).map(([pin, id]) => (
            <button
              type="button"
              key={pin}
              aria-pressed={net === id}
              onClick={() => onNet(net === id ? '' : id)}
              title={`Highlight ${ir.nets.find((item) => item.id === id)?.name ?? id}`}
            >
              <span>{pin}</span>
              <ArrowRight size={14} />
              <span>{ir.nets.find((item) => item.id === id)?.name ?? id}</span>
            </button>
          ))}
          {!Object.keys(part.connections).length && (
            <p className="empty-copy">No connections declared.</p>
          )}
        </div>
      </section>
      <section className="inspector-section manufacturing-section">
        <h4>Footprint checks</h4>
        {report ? (
          <details
            className="manufacturing-report"
            key={`${part.id}:${part.footprint}:${report.conformsToCheckedRules}`}
            open={!report.conformsToCheckedRules}
          >
            <summary
              data-state={report.conformsToCheckedRules ? 'passed' : 'failed'}
            >
              {report.conformsToCheckedRules ? (
                <Check size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>
                {report.conformsToCheckedRules
                  ? 'Checked rules pass'
                  : 'Rule failures'}
              </span>
              <ChevronDown size={14} />
            </summary>
            <div className="report-details">
              <p className="report-profile">{report.profile.key}</p>
              <dl className="checks-list">
                {report.checks.map((check) => (
                  <div key={check.id} className="detail-row">
                    <dt>{check.id}</dt>
                    <dd data-status={check.status}>
                      {check.status.replaceAll('-', ' ')}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        ) : (
          <p className="empty-copy">No report for this footprint.</p>
        )}
        {report && (
          <p className="scope-note">
            Checks cover selected rules for this footprint.
          </p>
        )}
      </section>
    </>
  );
}
