import type { BoardIr } from '@react-pcb/core';

export type SceneLayer = {
  key: string;
  id: string;
  name: string;
  color: string;
  overlay: boolean;
  visible: boolean;
  category: 'copper' | 'technical' | 'overlay';
  group: string;
  side: 'front' | 'back' | null;
  detail: string;
};

export function boardSize(ir: BoardIr) {
  const outline = ir.regions[ir.board.outline]?.geometry;
  return outline
    ? `${outline.width} × ${outline.height} ${ir.units}`
    : 'Unresolved outline';
}

export function sceneLayers(
  svg: string | null,
  ir: BoardIr | undefined,
): SceneLayer[] {
  if (!svg || !ir) return [];
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const copper = ir.board.layers.stackup.entries.filter(
    (layer) => layer.kind === 'copper',
  );
  return [
    ...document.querySelectorAll<SVGGElement>(
      'g[data-layer-id],g[data-overlay]',
    ),
  ].map((group) => {
    const overlay = !!group.dataset.overlay;
    const id = group.dataset.layerId ?? group.dataset.overlay!;
    const technical = ir.board.layers.technical.find(
      (layer) => layer.id === id,
    );
    const depth = copper.findIndex((layer) => layer.id === id);
    const name = overlay
      ? ({
          references: 'Part references',
          drills: 'Drills',
          constraints: 'Constraint regions',
        }[id] ?? id)
      : depth >= 0
        ? depth === 0
          ? 'Front copper'
          : depth === copper.length - 1
            ? 'Back copper'
            : `Inner copper ${depth}`
        : technical
          ? `${technical.side ? (technical.side === 'front' ? 'Front ' : 'Back ') : ''}${technical.kind === 'mechanical' ? technical.purpose : technical.kind.replace('-', ' ')}`
          : id;
    const side =
      depth === 0
        ? 'front'
        : depth > 0 && depth === copper.length - 1
          ? 'back'
          : (technical?.side ?? null);
    const category = overlay ? 'overlay' : depth >= 0 ? 'copper' : 'technical';
    const technicalName =
      technical?.kind === 'mechanical'
        ? technical.purpose
        : technical?.kind.replace('-', ' ');
    const groupName = technicalName
      ? technicalName.charAt(0).toUpperCase() + technicalName.slice(1)
      : id;
    const color = overlay
      ? ({ references: '#e8eddb', drills: '#263e34', constraints: '#c48bbc' }[
          id
        ] ?? '#a6adbd')
      : depth >= 0
        ? side === 'front'
          ? '#dfae77'
          : side === 'back'
            ? '#8dace1'
            : '#ad99d5'
        : technical?.kind === 'silkscreen'
          ? '#e8eddb'
          : technical?.kind === 'solder-mask'
            ? '#68aa98'
            : '#a4abc5';
    return {
      key: `${overlay ? 'overlay' : 'layer'}:${id}`,
      id,
      name,
      overlay,
      color,
      category,
      group:
        category === 'technical'
          ? groupName
          : category === 'copper'
            ? 'Copper'
            : 'Overlays',
      side,
      detail:
        depth >= 0
          ? `${copper[depth]!.usage} · ${copper[depth]!.thickness} ${ir.units}`
          : id,
      visible: overlay
        ? ['references', 'drills'].includes(id)
        : depth === 0 ||
          (technical?.kind === 'silkscreen' && technical.side === 'front'),
    };
  });
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
