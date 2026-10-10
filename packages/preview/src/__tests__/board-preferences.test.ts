import { expect, test } from 'bun:test';
import {
  boardPreferencesKey,
  defaultBoardPreferences,
  parseBoardPreferences,
  readBoardPreferences,
  writeBoardPreferences,
} from '../frontend/lib/board-preferences.ts';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}
test('board preferences persist per full filepath, including files with the same basename', () => {
  const storage = memoryStorage();
  const a = {
    ...defaultBoardPreferences(),
    view: 'analysis' as const,
    visibility: { 'layer:copper/1': false, 'overlay:constraints': true },
  };
  const b = { ...defaultBoardPreferences(), preset: 'back' as const };
  writeBoardPreferences('/project-a/board.tsx', a, storage);
  writeBoardPreferences('/project-b/board.tsx', b, storage);
  expect(readBoardPreferences('/project-a/board.tsx', storage)).toEqual(a);
  expect(readBoardPreferences('/project-b/board.tsx', storage)).toEqual(b);
  expect(readBoardPreferences('/project-c/board.tsx', storage)).toEqual(
    defaultBoardPreferences(),
  );
  expect(boardPreferencesKey('/a b/board.tsx')).not.toBe(
    boardPreferencesKey('/a%20b/board.tsx'),
  );
});
test('saved preferences validate view, preset and stable-key boolean visibility values', () => {
  expect(
    parseBoardPreferences({
      version: 1,
      view: 'analysis',
      preset: 'copper',
      visibility: {
        'layer:stable': false,
        'overlay:drills': true,
        'layer:bad': 'false',
        unexpected: true,
      },
    }),
  ).toEqual({
    version: 1,
    view: 'analysis',
    preset: 'copper',
    visibility: { 'layer:stable': false, 'overlay:drills': true },
  });
  expect(
    parseBoardPreferences({
      version: 1,
      view: 'unknown',
      preset: 'unknown',
      visibility: [],
    }),
  ).toEqual(defaultBoardPreferences());
  expect(parseBoardPreferences({ version: 2, view: 'analysis' })).toEqual(
    defaultBoardPreferences(),
  );
  expect(parseBoardPreferences(null)).toEqual(defaultBoardPreferences());
});
test('corrupt, blocked or full storage does not prevent normal board viewing', () => {
  const storage = memoryStorage();
  storage.setItem(boardPreferencesKey('/board.tsx'), '{invalid');
  expect(readBoardPreferences('/board.tsx', storage)).toEqual(
    defaultBoardPreferences(),
  );
  const unavailable = {
    getItem: () => {
      throw new Error('Blocked');
    },
    setItem: () => {
      throw new Error('Full');
    },
  };
  expect(readBoardPreferences('/board.tsx', unavailable)).toEqual(
    defaultBoardPreferences(),
  );
  expect(() =>
    writeBoardPreferences('/board.tsx', defaultBoardPreferences(), unavailable),
  ).not.toThrow();
  writeBoardPreferences('', defaultBoardPreferences(), storage);
  expect(storage.items.size).toBe(1);
});
