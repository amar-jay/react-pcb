import type { CompilerDiagnostic } from "@react-pcb/core";
import {
	AlertCircle,
	Check,
	ChevronDown,
	Copy,
	Terminal,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { outlineGeometry } from "../lib/outline-diagnostic.ts";
import { ComponentIcon } from "./pcb-icons.tsx";
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

function FailureErrors({
	errors,
	onFinding,
}: {
	errors: readonly CompilerDiagnostic[];
	onFinding?: (finding: CompilerDiagnostic) => void;
}) {
	const groups = new Map<string, CompilerDiagnostic[]>();
	for (const error of errors) {
		const group = groups.get(error.code) ?? [];
		group.push(error);
		groups.set(error.code, group);
	}
	return (
		<div className="space-y-4">
			{[...groups].map(([code, findings]) => {
				const first = findings[0];
				const sharedHelp = first?.help;
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
									asChild={Boolean(
										onFinding &&
											findings.length === 1 &&
											outlineGeometry(first),
									)}
								>
									{onFinding &&
									findings.length === 1 &&
									first &&
									outlineGeometry(first) ? (
										<button
											type="button"
											className="cursor-pointer hover:underline"
											onClick={() => first && onFinding(first)}
											aria-label={`${code}: show ${first?.entity} on board`}
										>
											{code}
										</button>
									) : (
										code
									)}
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
									{onFinding && outlineGeometry(finding) && (
										<div className="pb-2 pl-11">
											<Button
												size="sm"
												variant="ghost"
												className="h-7 text-xs text-primary"
												onClick={() => onFinding(finding)}
											>
												Show on board
											</Button>
										</div>
									)}
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
	onFinding,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	findings: readonly CompilerDiagnostic[];
	log: string | null;
	retained: boolean;
	onDiagnostics: () => void;
	onFinding?: (finding: CompilerDiagnostic) => void;
}) {
	const focusCanvasOnClose = useRef(false);
	const locateFinding = onFinding
		? (finding: CompilerDiagnostic) => {
				focusCanvasOnClose.current = true;
				onFinding(finding);
			}
		: undefined;
	const errors = findings.filter((finding) => finding.severity === "error");
	const warnings = findings.filter(
		(finding) => finding.severity === "warning",
	).length;
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent
				className="flex max-h-[calc(100dvh-48px)] w-[calc(100vw-48px)] max-w-256 flex-col gap-0 overflow-hidden rounded-xl p-0 animate-panel-fade data-[size=default]:sm:max-w-256 max-sm:max-h-[calc(100dvh-24px)] max-sm:w-[calc(100vw-24px)]"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					const target = focusCanvasOnClose.current
						? document.getElementById("scene")
						: (document.getElementById("build-error") ??
							document.getElementById("scene"));
					focusCanvasOnClose.current = false;
					target?.focus({ preventScroll: true });
				}}
			>
				<Tabs
					defaultValue="errors"
					className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
				>
					<header className="flex shrink-0 items-start gap-3 border-b px-6 py-4 max-sm:px-4">
						<span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
							<AlertCircle className="size-4" aria-hidden="true" />
						</span>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<AlertDialogTitle className="text-[15px] leading-none font-semibold tracking-tight">
									Compilation failed
								</AlertDialogTitle>
								<Badge variant="destructive" className="text-[11px]">
									{errors.length} {errors.length === 1 ? "error" : "errors"}
								</Badge>
								{!!warnings && (
									<span className="text-[11px] text-muted-foreground">
										{warnings} {warnings === 1 ? "warning" : "warnings"}
									</span>
								)}
							</div>
							<AlertDialogDescription className="mt-1.5 text-[13px] leading-relaxed">
								{retained
									? "The canvas is still showing the last successful build. Fix the errors below to update it."
									: "No board is on the canvas yet. Fix the errors below to display it."}
							</AlertDialogDescription>
						</div>
						<TabsList
							aria-label="Compilation failure details"
							className="h-8! shrink-0"
						>
							<TabsTrigger value="errors" className="text-xs">
								Errors
							</TabsTrigger>
							{log && (
								<TabsTrigger value="output" className="text-xs">
									Compiler output
								</TabsTrigger>
							)}
						</TabsList>
						<AlertDialogCancel
							variant="ghost"
							size="icon"
							className="-mt-1 shrink-0 text-muted-foreground"
							aria-label="Close compilation failure"
						>
							<X className="size-4" />
						</AlertDialogCancel>
					</header>
					<TabsContent
						value="errors"
						className="h-[min(640px,68dvh)] min-h-0 flex-auto overflow-y-auto px-6 py-4 scrollbar-thin max-sm:px-4"
					>
						<FailureErrors errors={errors} onFinding={locateFinding} />
					</TabsContent>
					{log && (
						<TabsContent
							value="output"
							className="h-[min(640px,68dvh)] min-h-0 flex-auto px-6 py-4 max-sm:px-4"
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
