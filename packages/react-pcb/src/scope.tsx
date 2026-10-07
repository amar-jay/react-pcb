import React, {createContext, type ReactNode, useContext, useMemo} from 'react';
import {net, part} from './model/index.ts';

const ScopeContext = createContext<readonly string[]>([]);

export type ModuleProps = {
  name: string;
  children?: ReactNode;
};

function assertSegment(value: string, kind: string) {
  if (value.length === 0 || value.includes('/')) {
    throw new Error(`${kind} must be a non-empty name without "/"`);
  }
}

function scopedId(scope: readonly string[], name: string) {
  return [...scope, name].join('/');
}

export function Module({name, children}: ModuleProps) {
  assertSegment(name, 'Module name');
  const parent = useContext(ScopeContext);
  const scope = useMemo(() => [...parent, name], [parent, name]);

  return (
    <ScopeContext.Provider value={scope}>
      {React.createElement('pcb-module', {name, scope: scope.join('/')}, children)}
    </ScopeContext.Provider>
  );
}

export function useNet(name: string) {
  assertSegment(name, 'Net name');
  const scope = useContext(ScopeContext);
  const id = scopedId(scope, name);
  return useMemo(() => net(name, id), [id, name]);
}

export function usePart(reference: string) {
  assertSegment(reference, 'Part reference');
  const scope = useContext(ScopeContext);
  const id = scopedId(scope, reference);
  return useMemo(() => part(reference, id), [id, reference]);
}

export function globalNet(name: string) {
  assertSegment(name, 'Global net name');
  return net(name, `global/${name}`);
}
