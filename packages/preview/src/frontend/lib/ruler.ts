export type RulerTick = { position: number; value: number; label: string };

/** SVG screen scale and offset map real millimetre coordinates to canvas pixels. */
export function rulerTicks(
  scale: number,
  offset: number,
  length: number,
): RulerTick[] {
  if (
    ![scale, offset, length].every(Number.isFinite) ||
    scale <= 0 ||
    length <= 28
  )
    return [];
  const desired = 80 / scale;
  const power = 10 ** Math.floor(Math.log10(desired));
  const step = [1, 2, 5, 10].find((value) => value * power >= desired)! * power;
  const first = Math.ceil((28 - offset) / scale / step) * step;
  const last = (length - offset) / scale;
  const format = new Intl.NumberFormat('en', {
    maximumFractionDigits: Math.max(
      0,
      Math.min(12, -Math.floor(Math.log10(step))),
    ),
  });
  const ticks: RulerTick[] = [];
  for (let index = 0; index < 100 && first + index * step <= last; index++) {
    const value = Number((first + index * step).toPrecision(12));
    ticks.push({
      position: value * scale + offset,
      value,
      label: format.format(value === 0 ? 0 : value),
    });
  }
  return ticks;
}
