import type { CompilerDiagnostic } from '@react-pcb/core';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

export function DiagnosticList({
  findings,
}: {
  findings: readonly CompilerDiagnostic[];
}) {
  return (
    <div>
      {!findings.length && (
        <div className="grid place-items-center gap-2.5 px-4 py-[55px] text-[13px] text-muted-foreground [&>svg]:text-success">
          <CheckCircle2 />
          <p>No findings in this category.</p>
        </div>
      )}
      {findings.map((item, index) => (
        <article
          className="flex items-start gap-3 border-b py-4 last:border-b-0 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-[#aa7a32] [&[data-severity=error]>svg]:text-destructive [&>div]:min-w-0 [&>div]:text-[13px] [&>div]:wrap-anywhere [&_p]:mt-[7px] [&_p]:leading-[1.65] [&_p]:whitespace-pre-wrap [&_small]:mt-1.5 [&_small]:block [&_small]:text-[12px] [&_small]:text-muted-foreground"
          data-severity={item.severity}
          key={`${item.code}:${item.entity}:${index}`}
        >
          {item.severity === 'error' ? (
            <AlertCircle size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
          <div>
            <div className="flex flex-wrap items-baseline gap-2 font-mono text-[11px] leading-normal text-muted-foreground [&_[data-slot=badge]]:rounded-sm [&_[data-slot=badge]]:[font:inherit]">
              <Badge
                variant={item.severity === 'error' ? 'destructive' : 'outline'}
              >
                {item.code}
              </Badge>
              {item.entity && <span>{item.entity}</span>}
            </div>
            <p>{item.message}</p>
            {item.source?.file && (
              <small>
                {item.source.file}
                {item.source.line ? `:${item.source.line}` : ''}
              </small>
            )}
            {item.help && (
              <p className="block text-[12px] text-muted-foreground">
                {item.help}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function BuildFailureDialog({
  open,
  onOpenChange,
  findings,
  log,
  retained,
  onDiagnostics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findings: readonly CompilerDiagnostic[];
  log: string | null;
  retained: boolean;
  onDiagnostics: () => void;
}) {
  const errors = findings.filter((finding) => finding.severity === 'error');
  const warnings = findings.filter(
    (finding) => finding.severity === 'warning',
  ).length;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="flex max-h-[calc(100dvh-48px)] w-[calc(100vw-32px)] max-w-[610px] flex-col gap-[18px] p-[26px] animate-panel-fade data-[size=default]:sm:max-w-[610px] max-md:max-h-[calc(100dvh-24px)] max-md:gap-3.5 max-md:p-5"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (
            document.getElementById('build-error') ??
            document.getElementById('scene')
          )?.focus();
        }}
      >
        <AlertDialogHeader className="flex flex-col items-start gap-2.5 text-left">
          <span className="mb-0.5 grid size-[46px] place-items-center rounded-xl bg-[color-mix(in_srgb,var(--destructive)_9%,var(--card))] text-destructive">
            <AlertCircle size={24} />
          </span>
          <AlertDialogTitle className="text-[21px] tracking-[-0.4px]">
            Board compilation failed
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-[1.7]">
            {retained
              ? 'Your last successful board is still available. Fix these errors in the source to update the preview.'
              : 'Fix these errors in the source to display your board.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-h-0 overflow-y-auto rounded-lg border px-4 [scrollbar-width:thin]">
          <DiagnosticList findings={errors} />
        </div>
        {log && (
          <Collapsible className="shrink-0">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2 p-0 text-[12px] text-muted-foreground [&[data-state=open]>svg]:rotate-180"
              >
                Full compiler output
                <ChevronDown size={14} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 max-h-[130px] overflow-y-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-[1.7] whitespace-pre-wrap wrap-anywhere">
                {log}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
        <AlertDialogFooter className="shrink-0 gap-2.5 pt-2 max-md:flex-col-reverse [&_button]:min-h-[38px] [&_button]:px-3.5 [&_button]:text-[13px]">
          <Button variant="outline" onClick={onDiagnostics}>
            View diagnostics{warnings ? ` (${warnings} warnings)` : ''}
          </Button>
          <AlertDialogCancel variant="default">
            {retained ? 'Inspect last build' : 'Dismiss'}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DiagnosticsPanel({
  open,
  onOpenChange,
  findings,
  failed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findings: readonly CompilerDiagnostic[];
  failed: boolean;
}) {
  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const ordered = [
    ...errors,
    ...findings.filter((item) => item.severity !== 'error'),
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[min(620px,75dvh)] gap-0 p-0 animate-panel-bottom"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById('diagnostics-trigger')?.focus();
        }}
      >
        <SheetHeader className="pt-[22px] pr-12 pb-3.5 pl-6 max-md:pl-4">
          <SheetTitle className="flex items-center gap-2.5 text-[18px]">
            Diagnostics <Badge variant="secondary">{findings.length}</Badge>
          </SheetTitle>
          <SheetDescription>
            {failed
              ? 'Findings from the latest failed compilation.'
              : 'Compiler and manufacturing findings for the displayed board.'}
          </SheetDescription>
        </SheetHeader>
        <Tabs
          defaultValue="all"
          className="min-h-0 flex-1 gap-3.5 px-6 max-md:px-4"
        >
          <TabsList aria-label="Filter diagnostics" className="shrink-0">
            <TabsTrigger value="all">All {findings.length}</TabsTrigger>
            <TabsTrigger value="errors">Errors {errors.length}</TabsTrigger>
            <TabsTrigger value="warnings">
              Warnings {warnings.length}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="all"
            className="min-h-0 overflow-y-auto pb-5 [scrollbar-width:thin]"
          >
            <div id="diagnostic-list">
              <DiagnosticList findings={ordered} />
            </div>
          </TabsContent>
          <TabsContent
            value="errors"
            className="min-h-0 overflow-y-auto pb-5 [scrollbar-width:thin]"
          >
            <DiagnosticList findings={errors} />
          </TabsContent>
          <TabsContent
            value="warnings"
            className="min-h-0 overflow-y-auto pb-5 [scrollbar-width:thin]"
          >
            <DiagnosticList findings={warnings} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function DiagnosticsTrigger({
  findings,
  onClick,
}: {
  findings: readonly CompilerDiagnostic[];
  onClick: () => void;
}) {
  const errors = findings.filter((item) => item.severity === 'error').length;
  const warnings = findings.filter(
    (item) => item.severity === 'warning',
  ).length;
  return (
    <Button
      id="diagnostics-trigger"
      variant="ghost"
      className="flex h-11 w-full justify-between rounded-none border-t border-t-border px-4 [&>span]:flex [&>span]:items-center [&>span]:gap-2"
      onClick={onClick}
    >
      <span>
        {errors ? (
          <AlertCircle size={15} />
        ) : warnings ? (
          <AlertTriangle size={15} />
        ) : (
          <CheckCircle2 size={15} />
        )}
        Diagnostics
        <Badge
          id="diagnostic-count"
          className="px-1.5 py-px text-[11px]"
          variant="secondary"
        >
          {findings.length}
        </Badge>
      </span>
      <span
        className="text-[12px] font-normal text-muted-foreground data-[severity=warning]:text-[#997032] dark:data-[severity=warning]:text-[#d1ae73] data-[severity=error]:text-destructive max-md:text-[11px]"
        data-severity={errors ? 'error' : warnings ? 'warning' : 'none'}
      >
        {errors
          ? `${errors} errors${warnings ? ` · ${warnings} warnings` : ''}`
          : warnings
            ? `${warnings} warnings`
            : 'No findings'}
        <ChevronDown size={14} />
      </span>
    </Button>
  );
}
