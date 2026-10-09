import { expect, test } from 'bun:test';
import { rulerTicks } from '../frontend/lib/ruler.ts';

test('rulers retain world-coordinate alignment when the board is panned and zoomed', () => {
  for (const [scale, offset] of [
    [10, 80],
    [10, 240],
    [25, 135],
  ] as const) {
    const ticks = rulerTicks(scale, offset, 500);
    expect(ticks.find((tick) => tick.value === 0)?.position).toBe(offset);
    for (const tick of ticks) {
      expect(tick.position).toBeCloseTo(tick.value * scale + offset, 8);
      expect(tick.position).toBeGreaterThanOrEqual(28);
      expect(tick.position).toBeLessThanOrEqual(500);
    }
  }
  expect(rulerTicks(10, 240, 500).some((tick) => tick.value < 0)).toBe(true);
});

test('rulers show distinct fractional coordinates at high zoom and remain readable at low zoom', () => {
  const detail = rulerTicks(1000, 30, 500);
  expect(detail.some((tick) => tick.label === '0.1')).toBe(true);
  for (const ticks of [detail, rulerTicks(0.001, 30, 500)]) {
    expect(new Set(ticks.map((tick) => tick.label)).size).toBe(ticks.length);
    for (let index = 1; index < ticks.length; index++) {
      expect(
        ticks[index]!.position - ticks[index - 1]!.position,
      ).toBeGreaterThanOrEqual(79.99);
    }
  }
});

test('rulers handle a canvas without measurable SVG geometry', () => {
  expect(rulerTicks(0, 10, 500)).toEqual([]);
  expect(rulerTicks(Number.NaN, 10, 500)).toEqual([]);
  expect(rulerTicks(10, Number.POSITIVE_INFINITY, 500)).toEqual([]);
  expect(rulerTicks(10, 10, 20)).toEqual([]);
});
