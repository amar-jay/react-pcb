import type {PartProps} from '@react-pcb/core';

export type Net = PartProps['connect'][string];

export const passivePins = {
  1: {electricalType: 'passive' as const, required: true as const},
  2: {electricalType: 'passive' as const, required: true as const},
};

export const datasheet = (document: string) => ({
  url: `https://example.com/${document}`,
  document,
});
