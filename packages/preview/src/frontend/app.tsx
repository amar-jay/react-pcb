import { useEffect, useMemo, useState } from 'react';
import type { CompilerDiagnostic } from '@react-pcb/core';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ChevronDown,
  CheckCircle2,
  CircuitBoard,
  Code2,
  FileCode2,
  Moon,
  Network,
  Radio,
  Sun,
  X,
} from 'lucide-react';
import { usePreview } from './hooks/use-preview.ts';
import { download, sceneLayers } from './lib/scene.ts';
import { Inspector } from './components/inspector.tsx';
import { NavigationPanel } from './components/navigation-panel.tsx';
import { BoardCanvas } from './components/board-canvas.tsx';
import { IconButton } from './components/icon-button.tsx';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { TooltipProvider } from './components/ui/tooltip';

export function App() {
  const { snapshot, connection } = usePreview();
  const ir = snapshot.result?.ir;
  const [selected, setSelected] = useState<string | null>(null);
  const [net, setNet] = useState('');
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
  const part = ir?.parts.find((part) => part.id === selected);
  const activeNet = ir?.nets.some((item) => item.id === net) ? net : '';
  const title =
    typeof ir?.board.metadata.title === 'string'
      ? ir.board.metadata.title
      : 'Board preview';
  const filename = snapshot.entry.split(/[\\/]/).pop() || 'Board JSX';
  const findings: readonly CompilerDiagnostic[] = snapshot.error
    ? snapshot.buildDiagnostics?.length
      ? snapshot.buildDiagnostics
      : [
          {
            code: 'PCBPREVIEW003',
            severity: 'error',
            message: snapshot.error,
            entity: null,
          },
        ]
    : [
        ...(snapshot.result?.diagnostics ?? []),
        ...(snapshot.projection?.diagnostics ?? []),
      ];
  const errors = findings.filter((item) => item.severity === 'error').length;
  const orderedFindings = [...findings].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1,
  );
  const firstBuildError = snapshot.buildDiagnostics?.find(
    (item) => item.severity === 'error',
  );
  const buildErrorText = firstBuildError
    ? `${firstBuildError.code}: ${firstBuildError.message}`
    : snapshot.error;
  const warnings = findings.filter(
    (item) => item.severity === 'warning',
  ).length;
  const status =
    connection === 'disconnected'
      ? 'Disconnected'
      : connection === 'connecting'
        ? 'Connecting…'
        : snapshot.building
          ? 'Compiling…'
          : snapshot.error
            ? 'Build failed'
            : ir
              ? 'Compiled'
              : 'No board loaded';
  const buildState =
    connection === 'disconnected'
      ? 'error'
      : snapshot.building
        ? 'building'
        : snapshot.error
          ? 'error'
          : 'ready';

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

  return (
    <TooltipProvider delayDuration={350}>
      <div className="workbench-app">
        <header className="app-header" aria-label="PCB preview">
          <div className="brand">
            <span className="brand-mark">
              <CircuitBoard size={22} strokeWidth={1.6} />
            </span>
            <div className="brand-wordmark">
              <span>
                react<span className="brand-pcb">pcb</span>
              </span>
              <small>Board preview</small>
            </div>
          </div>
          <div className="header-project">
            <h1 id="board-title" title={title}>
              {title}
            </h1>
            <div className="header-path">
              <FileCode2 size={12} />
              <span id="source">{filename}</span>
            </div>
          </div>
          <div className="header-actions">
            <Badge
              id="status"
              className="build-status"
              role="status"
              variant={buildState === 'error' ? 'destructive' : 'secondary'}
              data-state={buildState}
            >
              <span className="status-dot" />
              {status}
            </Badge>
            <span id="mode" className="preview-mode">
              {snapshot.live ? <Radio size={14} /> : <FileCode2 size={14} />}
              {snapshot.live ? 'Live preview' : 'Offline preview'}
            </span>
            <span className="header-divider" />
            <IconButton
              label={
                theme === 'light'
                  ? 'Switch to dark theme'
                  : 'Switch to light theme'
              }
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon /> : <Sun />}
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="lg"
                  className="export-trigger"
                  disabled={!snapshot.result}
                >
                  <ArrowDownToLine />
                  Export
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8}>
                <DropdownMenuLabel>Export board</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  id="download-svg"
                  disabled={!snapshot.projection}
                  onSelect={() =>
                    snapshot.projection &&
                    download(
                      'board.svg',
                      snapshot.projection.svg,
                      'image/svg+xml',
                    )
                  }
                >
                  <CircuitBoard />
                  Save SVG
                </DropdownMenuItem>
                <DropdownMenuItem
                  id="download-ir"
                  disabled={!snapshot.result}
                  onSelect={() =>
                    snapshot.result &&
                    download(
                      'board.json',
                      JSON.stringify(snapshot.result, null, 2) + '\n',
                      'application/json',
                    )
                  }
                >
                  <Code2 />
                  Save IR
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="workspace-body">
          <NavigationPanel
            ir={ir}
            selected={part?.id ?? null}
            layers={layers}
            visibility={visibility}
            onSelect={setSelected}
            onToggle={(key, value) =>
              setVisibility((previous) => ({ ...previous, [key]: value }))
            }
          />

          <main className="canvas-panel">
            <div className="canvas-toolbar">
              <div>
                <CircuitBoard size={15} />
                <span>Board canvas</span>
                <Badge variant="outline">2D</Badge>
              </div>
              <label className="net-control">
                <Network size={13} />
                <select
                  id="net"
                  aria-label="Highlight net"
                  value={activeNet}
                  onChange={(event) => setNet(event.target.value)}
                >
                  <option value="">All nets</option>
                  {ir?.nets.map((net) => (
                    <option key={net.id} value={net.id}>
                      {net.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {snapshot.error && (
              <Alert
                id="build-error"
                variant="destructive"
                className="build-error"
              >
                <AlertCircle />
                <AlertTitle>Board compilation failed</AlertTitle>
                <AlertDescription>
                  <pre id="error-message">{buildErrorText}</pre>
                  {ir && (
                    <p id="stale-label">
                      Showing the last successful build. Fix the source to
                      refresh the board.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {connection === 'disconnected' && (
              <div className="connection-notice" role="status">
                Preview server disconnected. Reconnecting…
              </div>
            )}
            <BoardCanvas
              svg={snapshot.projection?.svg ?? null}
              ir={ir}
              layers={layers}
              visibility={visibility}
              selected={part?.id ?? null}
              net={activeNet}
              onSelect={setSelected}
            />
            <details className="diagnostics">
              <summary>
                <span>
                  {errors ? (
                    <AlertCircle size={16} />
                  ) : warnings ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Diagnostics
                  <Badge id="diagnostic-count" variant="secondary">
                    {findings.length}
                  </Badge>
                </span>
                <span
                  className="diagnostics-summary"
                  data-severity={
                    errors ? 'error' : warnings ? 'warning' : 'none'
                  }
                >
                  {errors
                    ? `${errors} errors${warnings ? ` · ${warnings} warnings` : ''}`
                    : warnings
                      ? `${warnings} warnings`
                      : 'No findings'}
                  <ChevronDown size={14} />
                </span>
              </summary>
              <div id="diagnostic-list" className="diagnostic-list">
                {!findings.length && (
                  <p className="empty-copy">No compiler findings.</p>
                )}
                {orderedFindings.map((item, index) => (
                  <div
                    className="diagnostic"
                    key={`${item.code}:${item.entity}:${index}`}
                  >
                    <Badge
                      variant={
                        item.severity === 'error' ? 'destructive' : 'outline'
                      }
                    >
                      {item.severity}
                    </Badge>
                    <div>
                      <strong>
                        {item.code}
                        {item.entity ? ` · ${item.entity}` : ''}
                      </strong>
                      <p>{item.message}</p>
                      {item.source?.file && (
                        <small>
                          {item.source.file}
                          {item.source.line ? `:${item.source.line}` : ''}
                        </small>
                      )}
                      {item.help && (
                        <p className="diagnostic-help">{item.help}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </main>

          <aside className="inspection-panel" aria-label="Part inspection">
            <div className="inspection-heading">
              <h2>{part ? 'Part inspection' : 'Board overview'}</h2>
              {part && (
                <IconButton
                  label="Clear part selection"
                  onClick={() => setSelected(null)}
                >
                  <X />
                </IconButton>
              )}
            </div>
            <div id="part-details" data-kind={part ? 'part' : 'board'}>
              <Inspector
                snapshot={snapshot}
                part={part}
                net={activeNet}
                onNet={setNet}
              />
            </div>
          </aside>
        </div>
        <footer className="app-footer">
          <span>
            <span className="status-dot" />
            {snapshot.live
              ? 'Changes refresh automatically'
              : 'Self-contained board preview'}
          </span>
          <span>
            Placement preview
            <span className="footer-dot" />
            Routing unresolved
          </span>
        </footer>
      </div>
    </TooltipProvider>
  );
}
