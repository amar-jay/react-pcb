export function WorkbenchFooter({ live }: { live: boolean }) {
  return (
    <footer className="flex min-h-9 items-center justify-between gap-3 px-7 text-[11px] text-muted-foreground max-md:min-h-[30px] max-md:px-3 max-md:text-[10px] [&>span]:flex [&>span]:items-center [&>span]:gap-[7px] max-md:[&>span:last-child]:hidden">
      <span>
        <span className="inline-block size-1.5 shrink-0 rounded-full bg-success group-data-[state=error]/status:bg-destructive group-data-[state=building]/status:bg-[#b18c44]" />
        {live
          ? 'Changes refresh automatically'
          : 'Self-contained board preview'}
      </span>
      <span>
        Placement preview
        <span className="mx-[5px] inline-block size-[3px] rounded-full bg-current" />
        Routing unresolved
      </span>
    </footer>
  );
}
