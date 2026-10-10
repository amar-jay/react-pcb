import type { BoardIr } from "@react-pcb/core";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import type { PreviewSnapshot } from "../../index.ts";
import type { LayerPresetId } from "../lib/layer-presets.ts";
import type { SceneLayer } from "../lib/scene.ts";
import { ExportMenu } from "./export-menu.tsx";
import { IconButton } from "./icon-button.tsx";
import { LayerList, TechnicalLayers } from "./layer-controls.tsx";
import { LayerGroup } from "./layer-group.tsx";
import { LayerPresetSelect } from "./layer-preset-select.tsx";
import { PartsList } from "./parts-list.tsx";
import { ComponentIcon, LayerStackIcon } from "./pcb-icons.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarTrigger,
	useSidebar,
} from "./ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type Props = {
	ir: BoardIr | undefined;
	snapshot: PreviewSnapshot;
	theme: string;
	onToggleTheme: () => void;
	failed: boolean;
	selected: string | null;
	layers: SceneLayer[];
	visibility: Record<string, boolean>;
	onSelect: (id: string) => void;
	preset: LayerPresetId | "custom";
	onExportSvg: () => void;
	onPreset: (preset: LayerPresetId) => void;
	onToggle: (key: string, visible: boolean) => void;
};

export function NavigationPanel({
	ir,
	snapshot,
	theme,
	onToggleTheme,
	failed,
	selected,
	layers,
	visibility,
	onSelect,
	onToggle,
	preset,
	onPreset,
	onExportSvg,
}: Props) {
	const [tab, setTab] = useState<"layers" | "parts">("layers");
	const { setOpenMobile } = useSidebar();
	useEffect(() => {
		if (failed) setOpenMobile(false);
	}, [failed, setOpenMobile]);
	return (
		<Sidebar aria-label="Board navigation">
			<SidebarHeader className="flex flex-row items-center justify-between gap-2.5 px-5 pt-4 pb-3">
				<h2 className="text-[16px] font-semibold tracking-[-0.2px]">Design</h2>
				<SidebarTrigger aria-label="Close design sidebar" />
			</SidebarHeader>
			<Tabs
				value={tab}
				onValueChange={(value) => setTab(value as "layers" | "parts")}
				className="min-h-0 flex-1 gap-0"
			>
				<TabsList
					className="mx-4 mb-3 flex w-[calc(100%-32px)] gap-1 rounded-lg border bg-muted p-1"
					aria-label="Design controls"
				>
					<TabsTrigger
						value="layers"
						className="min-w-0 flex-1 gap-1.75 rounded-[5px] text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_4px_#242b4010] data-[state=active]:[&>svg]:text-primary dark:data-[state=active]:bg-card"
					>
						<LayerStackIcon />
						Layers
					</TabsTrigger>
					<TabsTrigger
						value="parts"
						className="min-w-0 flex-1 gap-1.75 rounded-[5px] text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_4px_#242b4010] data-[state=active]:[&>svg]:text-primary dark:data-[state=active]:bg-card"
					>
						<ComponentIcon />
						Parts
						<small className="pl-0.5 font-mono text-[11px] leading-[normal] text-muted-foreground">
							{ir?.parts.length ?? 0}
						</small>
					</TabsTrigger>
				</TabsList>
				<SidebarContent className="gap-0">
					<TabsContent
						value="layers"
						forceMount
						className="min-h-0 flex-1 px-4 pt-2 pb-4 scrollbar-thin data-[state=inactive]:hidden"
					>
						<LayerPresetSelect
							value={preset}
							onSelect={onPreset}
							disabled={!layers.length}
						/>
						<div id="layers">
							<LayerGroup
								title="Copper"
								legend={
									layers.filter((layer) => layer.category === "copper").length
								}
							>
								<LayerList
									items={layers.filter((layer) => layer.category === "copper")}
									visibility={visibility}
									onToggle={onToggle}
								/>
							</LayerGroup>
							<LayerGroup title="Technical">
								<TechnicalLayers
									items={layers.filter(
										(layer) => layer.category === "technical",
									)}
									visibility={visibility}
									onToggle={onToggle}
								/>
							</LayerGroup>
							<LayerGroup title="Overlays">
								<LayerList
									items={layers.filter((layer) => layer.overlay)}
									visibility={visibility}
									onToggle={onToggle}
								/>
							</LayerGroup>
						</div>
						{!layers.length && (
							<p className="py-2.5 text-[13px] leading-[1.7] text-muted-foreground">
								Layers appear after the board compiles.
							</p>
						)}
					</TabsContent>
					<TabsContent
						value="parts"
						forceMount
						className="min-h-0 flex-1 px-4 pt-2 pb-4 scrollbar-thin data-[state=inactive]:hidden"
					>
						<PartsList
							ir={ir}
							selected={selected}
							onSelect={(id) => {
								setOpenMobile(false);
								onSelect(id);
							}}
						/>
					</TabsContent>
				</SidebarContent>
			</Tabs>
			<SidebarFooter className="gap-3 border-t px-4 py-3">
				<div className="flex items-center gap-2">
					<ExportMenu snapshot={snapshot} onExportSvg={onExportSvg} />
					<IconButton
						label={
							theme === "light"
								? "Switch to dark theme"
								: "Switch to light theme"
						}
						onClick={onToggleTheme}
					>
						{theme === "light" ? <Moon /> : <Sun />}
					</IconButton>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
