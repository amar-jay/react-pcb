import { useEffect, useState } from 'react';
import { Moon, Sun, Search } from 'lucide-react';
import type { BoardInspection } from '../../inspection.ts';
import type { BoardView } from '../lib/scene-presentation.ts';
import { Button } from '../components/ui/button.tsx';
import { Input } from '../components/ui/input.tsx';
import { TooltipProvider } from '../components/ui/tooltip.tsx';
import { BoardViewSelect } from '../components/board-view-select.tsx';
import { FootprintInspectionCard } from './card.tsx';
import { InspectionReport } from './report.tsx';

export function InspectionApp({ snapshot }: { snapshot: BoardInspection }) {
  const [view, setView] = useState<BoardView>('analysis');
  const [theme, setTheme] = useState('light');
  const [search, setSearch] = useState('');
  const metadata = snapshot.result.ir.board.metadata;
  const title =
    typeof metadata.title === 'string'
      ? metadata.title
      : snapshot.result.ir.board.id;
  useEffect(() => {
    document.title = `${title} · Footprint inspection`;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [title, theme]);
  const needle = search.trim().toLowerCase();
  const visible = snapshot.footprints.filter((item) =>
    [
      item.key,
      ...item.parts.flatMap((part) => [
        part.id,
        part.reference,
        ...Object.values(
          snapshot.result.ir.componentDefinitions[part.component] ?? {},
        ).filter((value) => typeof value === 'string'),
      ]),
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
  const presentation = { view, theme };
  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-10 border-b bg-card px-5 py-3 max-sm:px-3">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-medium wrap-anywhere">
                {title}{' '}
                <span className="font-normal text-muted-foreground">
                  / Footprints
                </span>
              </h1>
              <p
                className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                title={snapshot.entry}
              >
                {snapshot.entry}
              </p>
            </div>
            <BoardViewSelect value={view} onChange={setView} />
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={
                theme === 'light'
                  ? 'Switch to dark theme'
                  : 'Switch to light theme'
              }
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon /> : <Sun />}
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1480px] px-5 py-5 max-sm:px-3">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-muted-foreground">
              {snapshot.footprints.length}{' '}
              {snapshot.footprints.length === 1 ? 'footprint' : 'footprints'} ·{' '}
              {snapshot.result.ir.parts.length} parts · Component-side view
            </span>
            <div className="relative ml-auto w-[300px] max-sm:w-full">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search footprints"
                placeholder="Find a footprint or part…"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <section
            aria-label="Board inspection files and checks"
            className="mb-5 rounded-lg border bg-card px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1">
                <Button asChild variant="ghost">
                  <a href={snapshot.files.board} download>
                    Board JSON
                  </a>
                </Button>
                <Button asChild variant="ghost">
                  <a href={snapshot.files.svg} download>
                    Board SVG
                  </a>
                </Button>
                <Button asChild variant="ghost">
                  <a href={snapshot.files.manifest} download>
                    Manifest
                  </a>
                </Button>
                {snapshot.result.boardManufacturingReport && (
                  <Button asChild variant="ghost">
                    <a href={snapshot.files.manufacturing} download>
                      Checks JSON
                    </a>
                  </Button>
                )}
              </div>
              <div className="min-w-0">
                <InspectionReport
                  report={snapshot.result.boardManufacturingReport}
                />
              </div>
            </div>
            {snapshot.diagnostics.length > 0 && (
              <details className="mt-2 border-t pt-2 text-[12px]">
                <summary className="cursor-pointer text-muted-foreground">
                  {snapshot.diagnostics.length} diagnostics
                </summary>
                <div className="mt-2 space-y-2">
                  {snapshot.diagnostics.map((diagnostic, index) => (
                    <p key={index} className="text-[11px] leading-relaxed">
                      <span className="font-mono text-muted-foreground">
                        {diagnostic.code}
                        {diagnostic.entity ? ` · ${diagnostic.entity}` : ''}
                      </span>{' '}
                      {diagnostic.message}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </section>
          {visible.length ? (
            <div className="grid grid-cols-2 items-start gap-5 max-lg:grid-cols-1">
              {visible.map((item) => (
                <FootprintInspectionCard
                  key={item.key}
                  item={item}
                  snapshot={snapshot}
                  presentation={presentation}
                />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-[13px] text-muted-foreground">
              {snapshot.footprints.length
                ? 'No footprints match your search.'
                : 'This board has no parts to inspect.'}
            </p>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
