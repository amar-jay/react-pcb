import type { CompilerDiagnostic } from "@react-pcb/core";
import {
	AlertCircle,
	Check,
	ChevronDown,
	Copy,
	Terminal,
	X,
} from "lucide-react";
import { useState } from "react";
import { BoardIcon, ComponentIcon } from "./pcb-icons.tsx";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "./ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

function errorSummary(finding: CompilerDiagnostic) {
	let message = finding.message.trimStart().split("\n")[0] ?? finding.message;
	// Keep the complete feature list in the expanded details.
	message = message.replace(/\s+\(features:[\s\S]*\)$/, "");
	if (finding.entity && message.startsWith(`part ${finding.entity} `)) {
		message = message.slice(`part ${finding.entity} `.length);
	}
	return message.charAt(0).toUpperCase() + message.slice(1);
}

function FailureErrors({ errors }: { errors: readonly CompilerDiagnostic[] }) {
	const groups = new Map<string, CompilerDiagnostic[]>();
	for (const error of errors) {
		const group = groups.get(error.code) ?? [];
		group.push(error);
		groups.set(error.code, group);
	}
	return (
		<div className="space-y-4">
			{[...groups].map(([code, findings]) => {
				const sharedHelp = findings[0]?.help;
				const hasSharedHelp =
					Boolean(sharedHelp) &&
					findings.every((finding) => finding.help === sharedHelp);
				const occurrences = new Map<string, number>();
				return (
					<section key={code} className="overflow-hidden rounded-lg border">
						<div className="border-b bg-muted/40 px-4 py-3">
							<div className="flex items-center justify-between gap-3">
								<Badge
									variant="destructive"
									className="rounded-sm font-mono text-[11px]"
								>
									{code}
								</Badge>
								<span className="text-xs text-muted-foreground">
									{findings.length} {findings.length === 1 ? "error" : "errors"}
								</span>
							</div>
							{hasSharedHelp && (
								<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
									{sharedHelp}
								</p>
							)}
						</div>
						{findings.map((finding) => {
							const identity = JSON.stringify(finding);
							const occurrence = occurrences.get(identity) ?? 0;
							occurrences.set(identity, occurrence + 1);
							const source = finding.source;
							return (
								<Collapsible
									key={`${identity}:${occurrence}`}
									className="border-b last:border-b-0"
								>
									<CollapsibleTrigger asChild>
										<button
											type="button"
											className="group/error flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
										>
											{finding.entity ? (
												<ComponentIcon className="mt-0.5 shrink-0 text-muted-foreground" />
											) : (
												<AlertCircle
													className="mt-0.5 size-4 shrink-0 text-destructive"
													aria-hidden="true"
												/>
											)}
											<span className="min-w-0 flex-1">
												{finding.entity && (
													<span className="block font-mono text-xs font-medium wrap-anywhere">
														{finding.entity}
													</span>
												)}
												<span className="mt-0.5 block line-clamp-2 text-[13px] leading-relaxed wrap-anywhere">
													{errorSummary(finding)}
												</span>
											</span>
											<ChevronDown
												className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/error:rotate-180"
												aria-hidden="true"
											/>
										</button>
									</CollapsibleTrigger>
									<CollapsibleContent className="px-4 pb-3">
										<div className="ml-7 rounded-md bg-muted/60 p-3 text-xs leading-relaxed">
											<p className="font-mono whitespace-pre-wrap wrap-anywhere">
												{finding.message}
											</p>
											{source?.file && (
												<p className="mt-2 font-mono text-[11px] text-muted-foreground wrap-anywhere">
													{source.file}
													{source.line === undefined ? "" : `:${source.line}`}
													{source.column === undefined
														? ""
														: `:${source.column}`}
												</p>
											)}
											{finding.help && !hasSharedHelp && (
												<p className="mt-2 text-muted-foreground">
													{finding.help}
												</p>
											)}
										</div>
									</CollapsibleContent>
								</Collapsible>
							);
						})}
					</section>
				);
			})}
		</div>
	);
}

function CompilerOutput({ log }: { log: string }) {
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
		"idle",
	);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(log);
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
	};
	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/30">
			<div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
				<span className="flex items-center gap-2 text-xs text-muted-foreground">
					<Terminal className="size-3.5" aria-hidden="true" />
					Compiler output
				</span>
				<Button variant="ghost" className="gap-1.5 text-xs" onClick={copy}>
					{copyState === "copied" ? (
						<Check className="size-3.5" />
					) : (
						<Copy className="size-3.5" />
					)}
					{copyState === "copied"
						? "Copied"
						: copyState === "failed"
							? "Retry copy"
							: "Copy output"}
				</Button>
			</div>
			<pre className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap wrap-anywhere scrollbar-thin">
				{log}
			</pre>
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
	const errors = findings.filter((finding) => finding.severity === "error");
	const warnings = findings.filter(
		(finding) => finding.severity === "warning",
	).length;
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent
				className="flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-180 flex-col gap-0 overflow-hidden rounded-xl p-0 animate-panel-fade data-[size=default]:sm:max-w-180 max-sm:max-h-[calc(100dvh-24px)] max-sm:w-[calc(100vw-24px)]"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					(
						document.getElementById("build-error") ??
						document.getElementById("scene")
					)?.focus();
				}}
			>
				<header className="shrink-0 border-b px-6 pt-5 pb-4 max-sm:px-4">
					<div className="flex items-start gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
							<AlertCircle className="size-5" aria-hidden="true" />
						</span>
						<div className="min-w-0 flex-1">
							<AlertDialogTitle className="text-xl tracking-tight">
								Compilation failed
							</AlertDialogTitle>
							<AlertDialogDescription className="mt-1 text-[13px] leading-relaxed">
								{retained
									? "Fix the errors below to update the preview."
									: "Fix the errors below to display your board."}
							</AlertDialogDescription>
						</div>
						<AlertDialogCancel
							variant="ghost"
							size="icon"
							className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
							aria-label="Close compilation failure"
						>
							<X className="size-4" />
						</AlertDialogCancel>
					</div>
					<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
						<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<BoardIcon size={14} />
							{retained
								? "Last successful build shown"
								: "No board preview available"}
						</span>
						<div className="flex items-center gap-2">
							<Badge variant="destructive" className="text-[11px]">
								{errors.length} {errors.length === 1 ? "error" : "errors"}
							</Badge>
							{!!warnings && (
								<span className="text-xs text-muted-foreground">
									{warnings} {warnings === 1 ? "warning" : "warnings"}
								</span>
							)}
						</div>
					</div>
				</header>
				<Tabs
					defaultValue="errors"
					className="min-h-0 flex-1 gap-3 overflow-hidden px-6 py-4 max-sm:px-4"
				>
					<div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
						<TabsList aria-label="Compilation failure details" className="h-8!">
							<TabsTrigger value="errors" className="text-xs">
								Errors
							</TabsTrigger>
							{log && (
								<TabsTrigger value="output" className="text-xs">
									Compiler output
								</TabsTrigger>
							)}
						</TabsList>
						<span className="text-[11px] text-muted-foreground max-sm:hidden">
							Select an error for details
						</span>
					</div>
					<TabsContent
						value="errors"
						className="h-[min(360px,44dvh)] min-h-0 flex-auto overflow-y-auto pr-1 scrollbar-thin"
					>
						<FailureErrors errors={errors} />
					</TabsContent>
					{log && (
						<TabsContent
							value="output"
							className="h-[min(360px,44dvh)] min-h-0 flex-auto"
						>
							<CompilerOutput key={log} log={log} />
						</TabsContent>
					)}
				</Tabs>
				<AlertDialogFooter className="shrink-0 flex-row justify-between! gap-2 border-t bg-muted/25 px-6 py-4 max-sm:px-4 [&_button]:h-9 [&_button]:px-3 [&_button]:text-xs">
					<Button variant="outline" onClick={onDiagnostics}>
						View diagnostics
					</Button>
					<AlertDialogCancel variant="default">
						{retained ? "Inspect last build" : "Dismiss"}
					</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
