import {
  ArrowDownToLine,
  ChevronDown,
  CircuitBoard,
  Code2,
} from 'lucide-react';
import type { PreviewSnapshot } from '../../index.ts';
import { download } from '../lib/scene.ts';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function ExportMenu({ snapshot }: { snapshot: PreviewSnapshot }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="default"
          className="h-[34px] flex-1 gap-2"
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
