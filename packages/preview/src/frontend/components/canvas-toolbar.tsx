import type { ReactNode } from 'react';
import type { BoardIr } from '@react-pcb/core';
import { CircuitBoard, Network } from 'lucide-react';
import { Badge } from './ui/badge';
import { SidebarTrigger } from './ui/sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export function CanvasToolbar({
  ir,
  net,
  onNet,
  children,
}: {
  ir: BoardIr | undefined;
  net: string;
  onNet: (id: string) => void;
  children: ReactNode;
}) {
  // Keep the reset option distinct from every canonical net ID.
  let allNetsValue = '__all__';
  while (ir?.nets.some((item) => item.id === allNetsValue)) allNetsValue += '_';
  return (
    <div className="flex h-[54px] shrink-0 items-center justify-between gap-3.5 border-b px-3 max-md:gap-1.5 max-md:px-2">
      <div className="flex min-w-0 items-center gap-[9px] text-[15px] font-medium max-[701px]:text-[14px] max-md:gap-1.5 [&>svg]:size-[17px] [&>svg]:text-muted-foreground">
        <SidebarTrigger aria-label="Toggle design sidebar" />
        <span className="mx-1 h-[22px] w-px bg-border" />
        <CircuitBoard size={15} />
        <span className="max-md:hidden">Board canvas</span>
        <Badge
          variant="outline"
          className="h-[22px] rounded-[5px] bg-muted px-1.5 font-mono text-[11px] leading-normal text-muted-foreground max-md:hidden"
        >
          2D
        </Badge>
      </div>
      <div className="flex items-center gap-2 max-md:gap-[5px]">
        <Select
          value={net || allNetsValue}
          onValueChange={(value) => onNet(value === allNetsValue ? '' : value)}
        >
          <SelectTrigger
            id="net"
            aria-label="Highlight net"
            className="data-[size=default]:h-[34px] min-w-[120px] max-w-[190px] text-[12px] max-md:min-w-0 max-md:max-w-[122px] max-md:px-2"
          >
            <Network size={14} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value={allNetsValue}>All nets</SelectItem>
            {ir?.nets.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {children}
      </div>
    </div>
  );
}
