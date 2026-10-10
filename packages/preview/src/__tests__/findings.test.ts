import { expect, test } from 'bun:test';
import type { PreviewSnapshot } from '../index.ts';
import { previewFindings } from '../frontend/lib/findings.ts';

const snapshot: PreviewSnapshot = {
  entry: 'board.tsx',
  result: null,
  projection: null,
  error: null,
  version: 1,
  building: false,
  live: true,
};

test('failure dialogs use the current structured findings', () => {
  const findings = [
    {
      code: 'PCBMFG003',
      severity: 'warning' as const,
      message: 'Coverage warning',
      entity: null,
    },
    {
      code: 'PCBMFG002',
      severity: 'error' as const,
      message: 'Copper overlap',
      entity: 'board/C1',
    },
  ];
  expect(
    previewFindings({
      ...snapshot,
      error: 'Old log',
      buildDiagnostics: findings,
    }),
  ).toEqual(findings);
});

test('older server logs separate warning paragraphs from blocking errors', () => {
  const error =
    'warning[PCBMFG003]: coverage is incomplete\n  --> package\n\nerror[PCBMFG002]: copper overlap\n  on copper/1\n  --> board/C1\n\nwarning[PCBMFG003]: routing is unresolved';
  expect(previewFindings({ ...snapshot, error })).toEqual([
    {
      code: 'PCBMFG003',
      severity: 'warning',
      message: 'coverage is incomplete',
      entity: 'package',
    },
    {
      code: 'PCBMFG002',
      severity: 'error',
      message: 'copper overlap\n  on copper/1',
      entity: 'board/C1',
    },
    {
      code: 'PCBMFG003',
      severity: 'warning',
      message: 'routing is unresolved',
      entity: null,
    },
  ]);
});

test('unstructured source failures still produce a blocking finding', () => {
  expect(
    previewFindings({
      ...snapshot,
      error: 'SyntaxError: expected closing JSX tag',
      buildDiagnostics: [],
    }),
  ).toEqual([
    {
      code: 'PCBPREVIEW003',
      severity: 'error',
      message: 'SyntaxError: expected closing JSX tag',
      entity: null,
    },
  ]);
});

test('successful recovery drops findings retained from a failed build', () => {
  expect(
    previewFindings({
      ...snapshot,
      buildDiagnostics: [
        {
          code: 'PCBMFG002',
          severity: 'error',
          message: 'Old collision',
          entity: null,
        },
      ],
    }),
  ).toEqual([]);
});
