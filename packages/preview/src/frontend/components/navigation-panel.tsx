import { LayerList, TechnicalLayers } from './layer-controls.tsx';
import { useEffect, useState } from 'react';
import { Box, CircuitBoard, Layers3, Network } from 'lucide-react';
import type { BoardIr } from '@react-pcb/core';
import type { SceneLayer } from '../lib/scene.ts';
import { PartsList } from './parts-list.tsx';
import { LayerGroup } from './layer-group.tsx';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

type Props = {
  ir: BoardIr | undefined;
  failed: boolean;
  selected: string | null;
  layers: SceneLayer[];
  visibility: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (key: string, visible: boolean) => void;
};

export function NavigationPanel({
  ir,
  failed,
  selected,
  layers,
  visibility,
  onSelect,
  onToggle,
}: Props) {
  const [tab, setTab] = useState<'layers' | 'parts'>('layers');
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
        onValueChange={(value) => setTab(value as 'layers' | 'parts')}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          className="mx-4 mb-3 flex w-[calc(100%-32px)] gap-1 rounded-lg border bg-muted p-1"
          aria-label="Design controls"
        >
          <TabsTrigger
            value="layers"
            className="min-w-0 flex-1 gap-[7px] rounded-[5px] text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_4px_#242b4010] data-[state=active]:[&>svg]:text-primary dark:data-[state=active]:bg-card"
          >
            <Layers3 />
            Layers
          </TabsTrigger>
          <TabsTrigger
            value="parts"
            className="min-w-0 flex-1 gap-[7px] rounded-[5px] text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_4px_#242b4010] data-[state=active]:[&>svg]:text-primary dark:data-[state=active]:bg-card"
          >
            <Box />
            Parts
            <small className="pl-0.5 font-mono text-[11px] [line-height:normal] text-muted-foreground">
              {ir?.parts.length ?? 0}
            </small>
          </TabsTrigger>
        </TabsList>
        <SidebarContent className="gap-0">
          <TabsContent
            value="layers"
            forceMount
            className="min-h-0 flex-1 px-4 pt-2 pb-4 [scrollbar-width:thin] data-[state=inactive]:hidden"
          >
            <div id="layers">
              <LayerGroup
                title="Copper"
                legend={
                  layers.filter((layer) => layer.category === 'copper').length
                }
              >
                <LayerList
                  items={layers.filter((layer) => layer.category === 'copper')}
                  visibility={visibility}
                  onToggle={onToggle}
                />
              </LayerGroup>
              <LayerGroup
                title="Technical"
                legend={<span title="F: front · B: back">F · B</span>}
              >
                <TechnicalLayers
                  items={layers.filter(
                    (layer) => layer.category === 'technical',
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
            className="min-h-0 flex-1 px-4 pt-2 pb-4 [scrollbar-width:thin] data-[state=inactive]:hidden"
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
      <SidebarFooter className="flex flex-row items-center justify-center gap-1.5 border-t bg-[color-mix(in_srgb,var(--muted)_35%,var(--card))] px-3.5 py-[15px] text-[12px] text-muted-foreground [&>svg]:size-3.5">
        <CircuitBoard size={14} />
        <span>{ir?.parts.length ?? 0} parts</span>
        <span className="mx-[5px] inline-block size-[3px] rounded-full bg-current" />
        <Network size={13} />
        <span>{ir?.nets.length ?? 0} nets</span>
      </SidebarFooter>
    </Sidebar>
  );
}
