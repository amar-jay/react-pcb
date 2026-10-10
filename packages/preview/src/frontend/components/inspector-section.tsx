import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export function InspectorSection({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-6 border-t pt-[22px]', className)}>
      <h4 className="mb-3.5 flex items-center justify-between gap-2 text-[14px] font-medium [&_small]:text-[11px] [&_small]:font-normal [&_small]:text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function DetailRow({
  label,
  value,
  status,
  compact = false,
}: {
  label: string;
  value: string;
  status?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5 text-[13px]',
        compact && 'gap-2.5 text-[12px]',
      )}
    >
      <dt className="text-muted-foreground wrap-anywhere">{label}</dt>
      <dd
        className={cn(
          'text-right font-mono text-[12px] [line-height:normal] wrap-anywhere data-[status=passed]:text-success data-[status=failed]:text-destructive data-[status=partial]:text-muted-foreground data-[status=skipped]:text-muted-foreground',
          compact && 'shrink-0 font-sans text-[11px]',
        )}
        data-status={status}
      >
        {value}
      </dd>
    </div>
  );
}
