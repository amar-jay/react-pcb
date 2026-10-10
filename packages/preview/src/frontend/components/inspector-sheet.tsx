import { CircuitBoard, PanelRight } from 'lucide-react';
import type { IrPart } from '@react-pcb/core';
import type { PreviewSnapshot } from '../../index.ts';
import { Inspector } from './inspector.tsx';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';

export function InspectorSheet({
  snapshot,
  part,
  net,
  onNet,
  open,
  onOpenChange,
  compact,
  onBack,
}: {
  snapshot: PreviewSnapshot;
  part: IrPart | undefined;
  net: string;
  onNet: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compact: boolean;
  onBack: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={compact}>
      <SheetTrigger asChild>
        <Button
          id="overview-trigger"
          variant="outline"
          className="gap-2 px-3 max-md:px-2 max-md:text-[12px]"
        >
          <PanelRight size={15} />
          <span>{part ? part.reference : 'Board overview'}</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-[min(100vw,390px)] max-w-[390px] gap-0 animate-panel-right sm:max-w-[390px] data-[docked=true]:top-[86px] data-[docked=true]:right-4 data-[docked=true]:bottom-[50px] data-[docked=true]:h-auto data-[docked=true]:rounded-lg data-[docked=true]:border data-[docked=true]:shadow-[0_2px_3px_#171d3004]"
        data-docked={!compact}
        onInteractOutside={(event) => {
          if (!compact) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLButtonElement>('#overview-trigger')
            ?.focus();
        }}
      >
        <SheetHeader className="border-b pt-6 pr-11 pb-5 pl-[22px]">
          <SheetTitle className="text-[18px]">
            {part ? 'Part inspection' : 'Board overview'}
          </SheetTitle>
          <SheetDescription className="text-[12px] leading-[1.65]">
            {snapshot.error
              ? 'Details from the last successful build.'
              : part
                ? 'Placement, connections, and footprint checks.'
                : 'Dimensions, manufacturing checks, and layer stackup.'}
          </SheetDescription>
        </SheetHeader>
        {part && (
          <div className="px-3.5 pt-2.5 [&_button]:gap-2 [&_button]:text-[12px] [&_button]:text-muted-foreground">
            <Button variant="ghost" onClick={onBack}>
              <CircuitBoard size={14} />
              Back to board overview
            </Button>
          </div>
        )}
        <ScrollArea className="min-h-0 flex-1">
          <div
            id="part-details"
            className="min-h-0 flex-1 overflow-visible px-5 py-[22px] [scrollbar-width:thin]"
            data-kind={part ? 'part' : 'board'}
          >
            <Inspector
              snapshot={snapshot}
              part={part}
              net={net}
              onNet={onNet}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
