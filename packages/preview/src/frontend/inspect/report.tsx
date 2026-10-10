import type {
  BoardManufacturingReport,
  ManufacturingReport,
} from '@react-pcb/core';
import { CircleCheck, CircleX } from 'lucide-react';
import { DetailRow } from '../components/inspector-section.tsx';

export function InspectionReport({
  report,
}: {
  report: ManufacturingReport | BoardManufacturingReport | null;
}) {
  if (!report)
    return (
      <p className="text-[12px] text-muted-foreground">
        No manufacturing profile selected.
      </p>
    );
  return (
    <details className="group/report text-[12px]">
      <summary className="flex cursor-pointer items-center gap-2 rounded-sm text-[12px] focus-visible:outline-2 focus-visible:outline-primary">
        {report.conformsToCheckedRules ? (
          <CircleCheck className="size-4 text-success" />
        ) : (
          <CircleX className="size-4 text-destructive" />
        )}
        <span>
          {report.conformsToCheckedRules
            ? 'Selected checks pass'
            : 'Selected checks failed'}
        </span>
        <span className="ml-auto text-muted-foreground">Details</span>
      </summary>
      <div className="mt-3 border-t pt-2">
        <p className="mb-2 break-all font-mono text-[11px] text-muted-foreground">
          {report.profile.key}
        </p>
        <dl>
          {report.checks.map((check) => (
            <DetailRow
              key={check.id}
              compact
              label={check.id.replaceAll('-', ' ')}
              value={check.status.replaceAll('-', ' ')}
              status={check.status}
            />
          ))}
        </dl>
        {report.checks
          .flatMap((check) => check.diagnostics)
          .map((diagnostic, index) => (
            <p
              key={`${diagnostic.code}/${diagnostic.entity}/${index}`}
              className="mt-2 text-[11px] leading-relaxed text-muted-foreground"
            >
              {diagnostic.message}
            </p>
          ))}
      </div>
    </details>
  );
}
