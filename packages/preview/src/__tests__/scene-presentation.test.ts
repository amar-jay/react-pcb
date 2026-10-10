import { expect, test } from 'bun:test';
import { DOMParser } from 'linkedom';
import {
  analysisLayerColor,
  applyScenePresentation,
  exportBoardSvg,
} from '../frontend/lib/scene-presentation.ts';
import type { SceneLayer } from '../frontend/lib/scene.ts';
const layer = (
  kind: string,
  side: SceneLayer['side'] = null,
  purpose?: string,
): SceneLayer => ({
  key: 'layer:stable',
  id: 'stable',
  name: 'Display name',
  color: '#fff',
  category: kind === 'copper' ? 'copper' : 'technical',
  overlay: false,
  visible: true,
  kind,
  side,
  purpose,
  group: '',
  detail: '',
});
const luminance = (hex: string) => {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
};
test('analysis feature colors contrast with the substrate in both themes', () => {
  const features = [
    layer('copper', 'front'),
    layer('copper', 'back'),
    layer('copper'),
    layer('silkscreen'),
    layer('mechanical', 'front', 'fabrication'),
    layer('mechanical', 'back', 'courtyard'),
  ];
  for (const dark of [false, true]) {
    const background = luminance(dark ? '#172033' : '#ffffff');
    for (const feature of features) {
      const color = luminance(analysisLayerColor(feature, dark));
      const ratio =
        (Math.max(color, background) + 0.05) /
        (Math.min(color, background) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
    expect(analysisLayerColor(features[0]!, dark)).not.toBe(
      analysisLayerColor(features[1]!, dark),
    );
  }
});
test('reference labels remain readable and colors follow physical metadata rather than IDs', () => {
  const reference = {
    ...layer('references'),
    id: 'references',
    key: 'overlay:references',
    overlay: true,
    category: 'overlay' as const,
  };
  expect(analysisLayerColor(reference, false)).toBe('#0f172a');
  expect(analysisLayerColor(reference, true)).toBe('#f1f5f9');
  const original = layer('mechanical', 'front', 'fabrication');
  expect(
    analysisLayerColor(
      { ...original, id: 'renamed', name: 'Another name' },
      false,
    ),
  ).toBe(analysisLayerColor(original, false));
});

test('fabrication, courtyard and constraint colors are distinct in both analysis themes', () => {
  const constraints = {
    ...layer('constraints'),
    id: 'constraints',
    key: 'overlay:constraints',
    overlay: true,
    category: 'overlay' as const,
  };
  for (const dark of [false, true]) {
    const colors = [
      layer('mechanical', 'front', 'fabrication'),
      layer('mechanical', 'front', 'courtyard'),
      constraints,
    ].map((feature) => analysisLayerColor(feature, dark));
    expect(new Set(colors).size).toBe(3);
    const color = luminance(analysisLayerColor(constraints, dark));
    const background = luminance(dark ? '#172033' : '#ffffff');
    expect(
      (Math.max(color, background) + 0.05) /
        (Math.min(color, background) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test('canvas and SVG export draw mask/paste boundaries without filling over copper in every view and theme', () => {
  const layers = ['copper', 'solder-mask', 'paste'].map((kind) => ({
    ...layer(kind, 'front'),
    id: kind,
    key: `layer:${kind}`,
    color: '#68aa98',
  }));
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/>
    ${layers.map((layer) => `<g data-layer-id="${layer.id}"><rect data-feature-id="shape" x="3" y="3" width="4" height="4" stroke="none"/></g>`).join('')}</svg>`;
  const document = new DOMParser().parseFromString(
    markup,
    'image/svg+xml',
  ) as unknown as Document;
  const svg = document.documentElement as unknown as SVGSVGElement;
  for (const view of ['analysis', 'board'] as const) {
    for (const theme of ['dark', 'light'] as const) {
      applyScenePresentation(svg, layers, {}, { view, theme });
      for (const kind of ['solder-mask', 'paste']) {
        const group = svg.querySelector<SVGGElement>(
          `g[data-layer-id="${kind}"]`,
        )!;
        const feature = group.querySelector<SVGElement>('[data-feature-id]')!;
        expect(group.style.fill).toBe('none');
        expect(group.style.opacity).toBe('');
        expect(feature.style.fill).toBe('none');
        expect(feature.style.stroke).not.toBe('none');
        expect(feature.style.vectorEffect).toBe('non-scaling-stroke');
        expect(feature.style.strokeDasharray).toBe(
          kind === 'paste' ? '3px 2px' : '',
        );
        expect(feature.getAttribute('stroke')).toBe('none');
        expect(feature.getAttribute('width')).toBe('4');
        expect(feature.getAttribute('height')).toBe('4');
      }
      const parsed = new DOMParser().parseFromString(
        markup,
        'image/svg+xml',
      ) as unknown as Document;
      const exported = exportBoardSvg(
        markup,
        layers,
        {},
        { view, theme },
        parsed,
      );
      expect(exported).toContain('fill:none');
      expect(exported).toContain('stroke-dasharray:3px 2px');
      expect(exported).toContain('data-layer-id="copper"');
    }
  }
});
