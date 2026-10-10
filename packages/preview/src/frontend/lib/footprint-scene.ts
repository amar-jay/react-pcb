import type { FootprintRole } from '@react-pcb/core';
import { boardLayerColor } from './scene-presentation.ts';
import type { SceneLayer } from './scene.ts';

const roles: Record<
  FootprintRole,
  {
    name: string;
    kind: string;
    side: SceneLayer['side'];
    allSides?: boolean;
    purpose?: string;
  }
> = {
  'front-copper': { name: 'Front copper', kind: 'copper', side: 'front' },
  'back-copper': { name: 'Back copper', kind: 'copper', side: 'back' },
  'all-copper': {
    name: 'All copper',
    kind: 'copper',
    side: null,
    allSides: true,
  },
  'front-mask': { name: 'Front mask', kind: 'solder-mask', side: 'front' },
  'back-mask': { name: 'Back mask', kind: 'solder-mask', side: 'back' },
  'all-mask': {
    name: 'All mask',
    kind: 'solder-mask',
    side: null,
    allSides: true,
  },
  'front-paste': { name: 'Front paste', kind: 'paste', side: 'front' },
  'back-paste': { name: 'Back paste', kind: 'paste', side: 'back' },
  'front-silkscreen': {
    name: 'Front silkscreen',
    kind: 'silkscreen',
    side: 'front',
  },
  'back-silkscreen': {
    name: 'Back silkscreen',
    kind: 'silkscreen',
    side: 'back',
  },
  'front-courtyard': {
    name: 'Front courtyard',
    kind: 'mechanical',
    side: 'front',
    purpose: 'courtyard',
  },
  'back-courtyard': {
    name: 'Back courtyard',
    kind: 'mechanical',
    side: 'back',
    purpose: 'courtyard',
  },
  'front-fabrication': {
    name: 'Front fabrication',
    kind: 'mechanical',
    side: 'front',
    purpose: 'fabrication',
  },
  'back-fabrication': {
    name: 'Back fabrication',
    kind: 'mechanical',
    side: 'back',
    purpose: 'fabrication',
  },
};

/** Semantic footprint roles remain separate from concrete board layer IDs. */
export function footprintSceneLayer(role: string): SceneLayer {
  const metadata =
    role === 'drill'
      ? { name: 'Drills', kind: 'drills', side: null }
      : roles[role as FootprintRole];
  if (!metadata) throw new Error(`Unsupported footprint layer role: ${role}`);
  const overlay = role === 'drill';
  const id = overlay ? 'drills' : role;
  const layer: SceneLayer = {
    ...metadata,
    id,
    key: `${overlay ? 'overlay' : 'layer'}:${id}`,
    overlay,
    category: overlay
      ? 'overlay'
      : metadata.kind === 'copper'
        ? 'copper'
        : 'technical',
    color: '',
    visible: true,
    group: overlay
      ? 'Overlays'
      : metadata.kind === 'copper'
        ? 'Copper'
        : 'Technical',
    detail: role,
  };
  layer.color = boardLayerColor(layer);
  return layer;
}
