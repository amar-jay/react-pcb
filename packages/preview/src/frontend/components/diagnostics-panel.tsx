import type { CompilerDiagnostic } from "@react-pcb/core";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "./ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export function DiagnosticList({
	findings,
}: {
	findings: readonly CompilerDiagnostic[];
}) {
	const occurrences = new Map<string, number>();
	const entries = findings.map((item) => {
		const identity = JSON.stringify(item);
		const occurrence = occurrences.get(identity) ?? 0;
		occurrences.set(identity, occurrence + 1);
		return { item, key: `${identity}:${occurrence}` };
	});
	return (
		<div>
			{!findings.length && (
				<div className="grid place-items-center gap-2.5 px-4 py-13.75 text-[13px] text-muted-foreground [&>svg]:text-success">
					<CheckCircle2 />
					<p>No findings in this category.</p>
				</div>
			)}
			{entries.map(({ item, key }) => (
				<article
					className="flex items-start gap-3 border-b py-4 last:border-b-0 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-[#aa7a32] [&[data-severity=error]>svg]:text-destructive [&>div]:min-w-0 [&>div]:text-[13px] [&>div]:wrap-anywhere [&_p]:mt-1.75 [&_p]:leading-[1.65] [&_p]:whitespace-pre-wrap [&_small]:mt-1.5 [&_small]:block [&_small]:text-[12px] [&_small]:text-muted-foreground"
					data-severity={item.severity}
					key={key}
				>
					{item.severity === "error" ? (
						<AlertCircle size={17} />
					) : (
						<AlertTriangle size={17} />
					)}
					<div>
						<div className="flex flex-wrap items-baseline gap-2 font-mono text-[11px] leading-normal text-muted-foreground **:data-[slot=badge]:rounded-sm **:data-[slot=badge]:[font:inherit]">
							<Badge
								variant={item.severity === "error" ? "destructive" : "outline"}
							>
								{item.code}
							</Badge>
							{item.entity && <span>{item.entity}</span>}
						</div>
						<p>{item.message}</p>
						{item.source?.file && (
							<small>
								{item.source.file}
								{item.source.line ? `:${item.source.line}` : ""}
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

export { BuildFailureDialog } from "./build-failure-dialog.tsx";

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
	const errors = findings.filter((item) => item.severity === "error");
	const warnings = findings.filter((item) => item.severity === "warning");
	const ordered = [
		...errors,
		...findings.filter((item) => item.severity !== "error"),
	];
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				className="h-[min(620px,75dvh)] gap-0 p-0 animate-panel-bottom"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					document.getElementById("diagnostics-trigger")?.focus();
				}}
			>
				<SheetHeader className="pt-5.5 pr-12 pb-3.5 pl-6 max-md:pl-4">
					<SheetTitle className="flex items-center gap-2.5 text-[18px]">
						Diagnostics <Badge variant="secondary">{findings.length}</Badge>
					</SheetTitle>
					<SheetDescription>
						{failed
							? "Findings from the latest failed compilation."
							: "Compiler and manufacturing findings for the displayed board."}
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
						className="min-h-0 overflow-y-auto pb-5 scrollbar-thin"
					>
						<div id="diagnostic-list">
							<DiagnosticList findings={ordered} />
						</div>
					</TabsContent>
					<TabsContent
						value="errors"
						className="min-h-0 overflow-y-auto pb-5 scrollbar-thin"
					>
						<DiagnosticList findings={errors} />
					</TabsContent>
					<TabsContent
						value="warnings"
						className="min-h-0 overflow-y-auto pb-5 scrollbar-thin"
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
	const errors = findings.filter((item) => item.severity === "error").length;
	const warnings = findings.filter(
		(item) => item.severity === "warning",
	).length;
	return (
		<Button
			id="diagnostics-trigger"
			variant="ghost"
			className="flex h-11 min-w-0 flex-1 justify-between rounded-none px-2"
			onClick={onClick}
		>
			<span className="flex items-center gap-2">
				{errors ? (
					<AlertCircle size={15} />
				) : warnings ? (
					<AlertTriangle size={15} />
				) : (
					<CheckCircle2 size={15} />
				)}
				<span className="max-sm:sr-only">Diagnostics</span>
				<Badge
					id="diagnostic-count"
					className="px-1.5 py-px text-[11px]"
					variant="secondary"
				>
					{findings.length}
				</Badge>
			</span>
			<span
				className="flex items-center gap-2 text-[12px] font-normal text-muted-foreground data-[severity=warning]:text-[#997032] dark:data-[severity=warning]:text-[#d1ae73] data-[severity=error]:text-destructive max-md:text-[11px] max-sm:hidden"
				data-severity={errors ? "error" : warnings ? "warning" : "none"}
			>
				{errors
					? `${errors} errors${warnings ? ` · ${warnings} warnings` : ""}`
					: warnings
						? `${warnings} warnings`
						: "No findings"}
				<ChevronDown size={14} />
			</span>
		</Button>
	);
}
