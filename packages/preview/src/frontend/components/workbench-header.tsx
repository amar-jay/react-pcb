import {
  ArrowDownToLine,
  ChevronDown,
  CircuitBoard,
  Code2,
  FileCode2,
  Moon,
  Radio,
  Sun,
} from 'lucide-react';
import type { PreviewSnapshot } from '../../index.ts';
import type { PreviewConnection } from '../hooks/use-preview.ts';
import { download } from '../lib/scene.ts';
import { IconButton } from './icon-button.tsx';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function WorkbenchHeader({
  snapshot,
  connection,
  title,
  theme,
  onToggleTheme,
}: {
  snapshot: PreviewSnapshot;
  connection: PreviewConnection;
  title: string;
  theme: string;
  onToggleTheme: () => void;
}) {
  const ir = snapshot.result?.ir;
  const filename = snapshot.entry.split(/[\\/]/).pop() || 'Board JSX';
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
  return (
    <header
      className="flex h-[72px] shrink-0 items-center gap-7 border-b bg-card px-7 max-md:h-auto max-md:min-h-[100px] max-md:flex-wrap max-md:gap-3 max-md:px-4 max-md:py-3"
      aria-label="PCB preview"
    >
      <div className="flex w-56 shrink-0 items-center gap-3 max-[1101px]:w-auto max-md:w-9">
        <span className="grid size-[42px] place-items-center rounded-xl border border-primary/14 bg-secondary text-primary max-md:size-9 max-md:rounded-[9px]">
          <CircuitBoard size={22} strokeWidth={1.6} />
        </span>
        <div className="max-md:hidden">
          <span className="text-[21px] leading-[1.2] font-semibold tracking-[-0.7px]">
            react<span className="font-normal">pcb</span>
          </span>
          <small className="mt-1 block text-[11px] text-muted-foreground">
            Board preview
          </small>
        </div>
      </div>
      <div className="min-w-0 flex-1 border-l pl-[26px] max-md:border-0 max-md:p-0">
        <h1
          id="board-title"
          title={title}
          className="truncate text-[19px] leading-[1.3] font-semibold tracking-[-0.45px] max-md:text-[17px]"
        >
          {title}
        </h1>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[11px] [line-height:normal] text-muted-foreground">
          <FileCode2 size={12} className="shrink-0" />
          <span id="source" className="truncate">
            {filename}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 max-[1101px]:gap-2 max-md:w-full max-md:justify-end">
        <Badge
          id="status"
          className="group/status h-7 gap-[7px] rounded-md bg-[color-mix(in_srgb,var(--success)_9%,var(--card))] px-2.5 text-[12px] font-normal text-success data-[state=error]:bg-[color-mix(in_srgb,var(--destructive)_9%,var(--card))] data-[state=error]:text-destructive data-[state=building]:bg-[#f4eddb] data-[state=building]:text-[#9a7835] max-md:mr-auto"
          role="status"
          variant={buildState === 'error' ? 'destructive' : 'secondary'}
          data-state={buildState}
        >
          <span className="inline-block size-1.5 shrink-0 rounded-full bg-success group-data-[state=error]/status:bg-destructive group-data-[state=building]/status:bg-[#b18c44]" />
          {status}
        </Badge>
        <span
          id="mode"
          className="flex items-center gap-[7px] text-[12px] text-muted-foreground max-[1101px]:hidden [&>svg]:text-success"
        >
          {snapshot.live ? <Radio size={14} /> : <FileCode2 size={14} />}
          {snapshot.live ? 'Live preview' : 'Offline preview'}
        </span>
        <span className="h-6 w-px bg-border max-md:hidden" />
        <IconButton
          label={
            theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
          }
          onClick={onToggleTheme}
        >
          {theme === 'light' ? <Moon /> : <Sun />}
        </IconButton>
        <ExportMenu snapshot={snapshot} />
      </div>
    </header>
  );
}

function ExportMenu({ snapshot }: { snapshot: PreviewSnapshot }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="lg"
          className="h-[38px] gap-[9px] rounded-[7px] px-3.5 shadow-[0_2px_3px_#32387112]"
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
            download('board.svg', snapshot.projection.svg, 'image/svg+xml')
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
  );
}
