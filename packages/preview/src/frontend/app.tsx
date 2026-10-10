import { useEffect, useMemo, useState, useRef } from 'react';
import { usePreview } from './hooks/use-preview.ts';
import { useIsMobile } from './hooks/use-mobile';
import {
  matchingLayerPreset,
  presetVisibility,
  type LayerPresetId,
} from './lib/layer-presets.ts';
import { sceneLayers } from './lib/scene.ts';
import { previewFindings } from './lib/findings.ts';
import { NavigationPanel } from './components/navigation-panel.tsx';
import { WorkbenchCommand } from './components/workbench-command.tsx';
import { BoardCanvas, type CanvasActions } from './components/board-canvas.tsx';
import { PreviewStatus } from './components/preview-status.tsx';
import { CanvasToolbar } from './components/canvas-toolbar.tsx';
import { InspectorSheet } from './components/inspector-sheet.tsx';
import {
  BuildFailureDialog,
  DiagnosticsPanel,
  DiagnosticsTrigger,
} from './components/diagnostics-panel.tsx';
import { SidebarProvider } from './components/ui/sidebar';
import { TooltipProvider } from './components/ui/tooltip';

export function App() {
  const { snapshot, connection } = usePreview();
  const canvas = useRef<CanvasActions>(null);
  const ir = snapshot.result?.ir;
  const [selected, setSelected] = useState<string | null>(null);
  const [net, setNet] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [failureOpen, setFailureOpen] = useState(false);
  const compactInspector = useIsMobile(1280);
  const selectPart = (id: string | null) => {
    setSelected(id);
    if (id) setInspectorOpen(true);
  };
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('react-pcb-theme') === 'dark'
        ? 'dark'
        : 'light';
    } catch {
      return 'light';
    }
  });
  const layers = useMemo(
    () => sceneLayers(snapshot.projection?.svg ?? null, ir),
    [snapshot.projection?.svg, ir],
  );
  const [chosenPreset, setChosenPreset] = useState<LayerPresetId | null>(null);
  const applyPreset = (preset: LayerPresetId) => {
    setChosenPreset(preset);
    setVisibility(presetVisibility(layers, preset));
  };
  const toggleLayer = (key: string, visible: boolean) => {
    setChosenPreset(null);
    setVisibility((previous) => ({ ...previous, [key]: visible }));
  };
  useEffect(() => {
    if (chosenPreset) setVisibility(presetVisibility(layers, chosenPreset));
  }, [layers, chosenPreset]);
  const preset = chosenPreset ?? matchingLayerPreset(layers, visibility);
  const part = ir?.parts.find((part) => part.id === selected);
  const activeNet = ir?.nets.some((item) => item.id === net) ? net : '';
  const title =
    typeof ir?.board.metadata.title === 'string'
      ? ir.board.metadata.title
      : 'Board preview';
  const findings = previewFindings(snapshot);

  useEffect(() => {
    document.title = `${title} · react-pcb`;
  }, [title]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('react-pcb-theme', theme);
    } catch {
      /* Storage can be disabled in offline viewers. */
    }
  }, [theme]);
  useEffect(() => {
    if (selected && !ir?.parts.some((part) => part.id === selected))
      setSelected(null);
    if (net && !ir?.nets.some((item) => item.id === net)) setNet('');
  }, [ir, selected, net]);

  useEffect(() => {
    setFailureOpen(false);
    if (snapshot.error) {
      setInspectorOpen(false);
      setDiagnosticsOpen(false);
    }
  }, [snapshot.version, snapshot.error]);

  return (
    <TooltipProvider delayDuration={350}>
      <div
        className="group/workbench flex h-dvh min-h-[520px] flex-col"
        data-inspector-open={inspectorOpen && !compactInspector}
      >
        <SidebarProvider className="[--sidebar-width:264px]! relative min-h-0 flex-1 overflow-hidden [&_[data-slot=sidebar-container]]:absolute [&_[data-slot=sidebar-container]]:inset-y-0 [&_[data-slot=sidebar-container]]:h-full [&_[data-slot=sidebar-inner]]:border-r">
          <NavigationPanel
            ir={ir}
            snapshot={snapshot}
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            failed={Boolean(snapshot.error)}
            selected={part?.id ?? null}
            layers={layers}
            visibility={visibility}
            onSelect={selectPart}
            onToggle={toggleLayer}
            preset={preset}
            onPreset={applyPreset}
          />

          <main className="mx-4 my-3.5 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card group-data-[inspector-open=true]/workbench:mr-[422px] max-md:m-2">
            <CanvasToolbar
              ir={ir}
              title={title}
              entry={snapshot.entry}
              net={activeNet}
              onNet={setNet}
            >
              <WorkbenchCommand
                snapshot={snapshot}
                canvas={canvas}
                layers={layers}
                visibility={visibility}
                theme={theme}
                onToggleTheme={() =>
                  setTheme(theme === 'light' ? 'dark' : 'light')
                }
                onSelect={selectPart}
                onNet={setNet}
                onToggleLayer={toggleLayer}
                onPreset={applyPreset}
                onOverview={() => {
                  setSelected(null);
                  setInspectorOpen(true);
                }}
                onDiagnostics={() => setDiagnosticsOpen(true)}
                onFailure={() => setFailureOpen(true)}
              />
              <InspectorSheet
                snapshot={snapshot}
                part={part}
                net={activeNet}
                onNet={setNet}
                open={inspectorOpen}
                onOpenChange={setInspectorOpen}
                compact={compactInspector}
                onBack={() => setSelected(null)}
              />
            </CanvasToolbar>
            {connection === 'disconnected' && (
              <div
                className="bg-secondary px-5 py-3 text-[13px] text-secondary-foreground"
                role="status"
              >
                Preview server disconnected. Reconnecting…
              </div>
            )}
            <BoardCanvas
              ref={canvas}
              svg={snapshot.projection?.svg ?? null}
              ir={ir}
              layers={layers}
              visibility={visibility}
              selected={part?.id ?? null}
              net={activeNet}
              onSelect={selectPart}
              statusControls={
                <>
                  <PreviewStatus
                    snapshot={snapshot}
                    connection={connection}
                    onViewFailure={() => setFailureOpen(true)}
                  />
                  <DiagnosticsTrigger
                    findings={findings}
                    onClick={() => setDiagnosticsOpen(true)}
                  />
                </>
              }
            />
          </main>
        </SidebarProvider>
        <BuildFailureDialog
          open={failureOpen}
          onOpenChange={setFailureOpen}
          findings={findings}
          log={snapshot.error}
          retained={Boolean(ir)}
          onDiagnostics={() => {
            setFailureOpen(false);
            setDiagnosticsOpen(true);
          }}
        />
        <DiagnosticsPanel
          open={diagnosticsOpen}
          onOpenChange={setDiagnosticsOpen}
          findings={findings}
          failed={Boolean(snapshot.error)}
        />
      </div>
    </TooltipProvider>
  );
}
