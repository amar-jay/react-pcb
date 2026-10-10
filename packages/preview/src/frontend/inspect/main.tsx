/// <reference lib="dom" />
import { createRoot } from 'react-dom/client';
import { InspectionApp } from './app.tsx';
import type { BoardInspection } from '../../inspection.ts';
const snapshot = JSON.parse(
  document.getElementById('preview-data')!.textContent!,
) as BoardInspection;
createRoot(document.getElementById('root')!).render(
  <InspectionApp snapshot={snapshot} />,
);
