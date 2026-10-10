import { useEffect, useRef, useState, type RefObject } from "react";
import {
	AlertCircle,
	ArrowDownToLine,
	Box,
	Check,
	CircuitBoard,
	Code2,
	Layers,
	Maximize,
	Moon,
	Network,
	PanelLeft,
	Plus,
	Minus,
	Ruler,
	Search,
	Sun,
	X,
} from "lucide-react";
import type { PreviewSnapshot } from "../../index.ts";
import { layerPresets, type LayerPresetId } from "../lib/layer-presets.ts";
import type { BoardView } from "../lib/scene-presentation.ts";
import { download, type SceneLayer } from "../lib/scene.ts";
import type { CanvasActions } from "./board-canvas.tsx";
import { IconButton } from "./icon-button.tsx";
import { useSidebar } from "./ui/sidebar";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "./ui/command";

type Props = {
	snapshot: PreviewSnapshot;
	canvas: RefObject<CanvasActions | null>;
	layers: SceneLayer[];
	visibility: Record<string, boolean>;
	theme: string;
	onToggleTheme: () => void;
	onSelect: (id: string) => void;
	onNet: (id: string) => void;
	onToggleLayer: (key: string, visible: boolean) => void;
	onExportSvg: () => void;
	onView: (view: BoardView) => void;
	onPreset: (preset: LayerPresetId) => void;
	onOverview: () => void;
	onDiagnostics: () => void;
	onFailure: () => void;
};

export function WorkbenchCommand({
	snapshot,
	canvas,
	layers,
	visibility,
	theme,
	onToggleTheme,
	onSelect,
	onNet,
	onToggleLayer,
	onPreset,
	onExportSvg,
	onView,
	onOverview,
	onDiagnostics,
	onFailure,
}: Props) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const pending = useRef<(() => void) | null>(null);
	const { toggleSidebar } = useSidebar();
	const ir = snapshot.result?.ir;
	const run = (action: () => void) => {
		pending.current = action;
		setOpen(false);
	};
	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			if (
				event.key.toLowerCase() !== "k" ||
				!(event.metaKey || event.ctrlKey) ||
				event.altKey ||
				event.repeat
			)
				return;
			// Keep another modal's focus trap intact.
			if (
				!open &&
				document.querySelector(
					'[role="alertdialog"], [role="dialog"][aria-modal="true"]',
				)
			)
				return;
			event.preventDefault();
			setOpen((previous) => !previous);
		};
		document.addEventListener("keydown", keydown);
		return () => document.removeEventListener("keydown", keydown);
	}, [open]);
	return (
		<>
			<IconButton
				id="command-trigger"
				ref={trigger}
				label="Search commands (Ctrl/Cmd+K)"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen(true)}
			>
				<Search />
			</IconButton>
			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title="Workbench commands"
				description="Search board actions, parts, nets and layers. Use arrow keys to choose and Enter to run."
				className="gap-0 bg-card"
				contentProps={{
					onCloseAutoFocus: (event) => {
						event.preventDefault();
						trigger.current?.focus({ preventScroll: true });
						const action = pending.current;
						pending.current = null;
						action?.();
					},
				}}
			>
				<CommandInput
					aria-label="Search commands"
					placeholder="Search commands, parts, nets…"
					className="pr-8"
				/>
				<CommandList className="max-h-[min(420px,65dvh)]">
					<CommandEmpty>No matching commands.</CommandEmpty>
					<CommandGroup heading="Canvas">
						<CommandItem
							disabled={!snapshot.projection}
							onSelect={() => run(() => canvas.current?.fit())}
						>
							<Maximize />
							Fit board
						</CommandItem>
						<CommandItem
							disabled={!snapshot.projection}
							onSelect={() => run(() => canvas.current?.zoomIn())}
						>
							<Plus />
							Zoom in
						</CommandItem>
						<CommandItem
							disabled={!snapshot.projection}
							onSelect={() => run(() => canvas.current?.zoomOut())}
						>
							<Minus />
							Zoom out
						</CommandItem>
						<CommandItem
							disabled={!snapshot.projection}
							keywords={["ruler", "measure"]}
							onSelect={() => run(() => canvas.current?.toggleMeasurement())}
						>
							<Ruler />
							Toggle distance measurement
						</CommandItem>
						<CommandItem
							disabled={!snapshot.projection}
							onSelect={() => run(() => canvas.current?.clearMeasurement())}
						>
							<X />
							Clear measurement
						</CommandItem>
					</CommandGroup>
					<CommandSeparator />
					<CommandGroup heading="Board view">
						<CommandItem
							keywords={["view"]}
							onSelect={() => run(() => onView("board"))}
						>
							<CircuitBoard />
							Board view
						</CommandItem>
						<CommandItem
							keywords={["view", "SVG"]}
							onSelect={() => run(() => onView("analysis"))}
						>
							<Code2 />
							Analysis view
						</CommandItem>
					</CommandGroup>
					<CommandSeparator />
					<CommandGroup heading="Layer presets">
						{layerPresets.map((preset) => (
							<CommandItem
								key={preset.id}
								value={`preset:${preset.id}`}
								keywords={[`Layer preset ${preset.label}`, preset.description]}
								disabled={!layers.length}
								onSelect={() => run(() => onPreset(preset.id))}
							>
								<Layers />
								{preset.label}
							</CommandItem>
						))}
					</CommandGroup>
					<CommandSeparator />
					<CommandGroup heading="Workbench">
						<CommandItem onSelect={() => run(toggleSidebar)}>
							<PanelLeft />
							Toggle design sidebar
						</CommandItem>
						<CommandItem onSelect={() => run(onOverview)}>
							<CircuitBoard />
							Board overview
						</CommandItem>
						<CommandItem onSelect={() => run(onDiagnostics)}>
							<AlertCircle />
							View diagnostics
						</CommandItem>
						{snapshot.error && (
							<CommandItem onSelect={() => run(onFailure)}>
								<AlertCircle />
								View compilation failure
							</CommandItem>
						)}
						<CommandItem
							keywords={["theme"]}
							onSelect={() => run(onToggleTheme)}
						>
							{theme === "dark" ? <Sun /> : <Moon />}Switch to{" "}
							{theme === "dark" ? "light" : "dark"} theme
						</CommandItem>
					</CommandGroup>
					<CommandSeparator />
					<CommandGroup heading="Export">
						<CommandItem
							disabled={!snapshot.projection}
							onSelect={() => run(onExportSvg)}
						>
							<ArrowDownToLine />
							Save SVG
						</CommandItem>
						<CommandItem
							disabled={!snapshot.result}
							onSelect={() =>
								run(
									() =>
										snapshot.result &&
										download(
											"board.json",
											JSON.stringify(snapshot.result, null, 2) + "\n",
											"application/json",
										),
								)
							}
						>
							<Code2 />
							Save IR
						</CommandItem>
					</CommandGroup>
					{!!ir?.parts.length && (
						<CommandGroup heading="Parts">
							{ir.parts.map((part) => (
								<CommandItem
									key={part.id}
									value={`part:${part.id}`}
									keywords={[
										`Inspect ${part.reference}`,
										ir.componentDefinitions[part.component]?.mpn ?? "",
									]}
									onSelect={() => run(() => onSelect(part.id))}
								>
									<Box />
									Inspect {part.reference}
									<span className="ml-auto truncate text-xs text-muted-foreground">
										{ir.componentDefinitions[part.component]?.mpn}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}
					{!!ir?.nets.length && (
						<CommandGroup heading="Nets">
							<CommandItem
								value="net:clear"
								keywords={["all nets", "clear highlight"]}
								onSelect={() => run(() => onNet(""))}
							>
								<Network />
								Clear net highlight
							</CommandItem>
							{ir.nets.map((net) => (
								<CommandItem
									key={net.id}
									value={`net:${net.id}`}
									keywords={[`Highlight ${net.name}`]}
									onSelect={() => run(() => onNet(net.id))}
								>
									<Network />
									Highlight {net.name}
								</CommandItem>
							))}
						</CommandGroup>
					)}
					{!!layers.length && (
						<CommandGroup heading="Layers">
							{layers.map((layer) => {
								const visible = visibility[layer.key] ?? layer.visible;
								return (
									<CommandItem
										key={layer.key}
										value={`layer:${layer.key}`}
										keywords={[`${visible ? "Hide" : "Show"} ${layer.name}`]}
										onSelect={() =>
											run(() => onToggleLayer(layer.key, !visible))
										}
									>
										<Layers />
										{visible ? "Hide" : "Show"} {layer.name}
										{visible && <Check className="ml-auto" />}
									</CommandItem>
								);
							})}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
