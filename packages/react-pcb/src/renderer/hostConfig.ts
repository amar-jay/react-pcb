import React from 'react';
import {DefaultEventPriority, NoEventPriority} from 'react-reconciler/constants.js';

import type {DeclarationNode, RendererRoot} from './types.ts';

function append(parent: {children: DeclarationNode[]}, child: DeclarationNode) {
  parent.children.push(child);
}

function remove(parent: {children: DeclarationNode[]}, child: DeclarationNode) {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
}

// Reconciler passes this handle to createInstance. Only keys above the nearest
// host node are used; sibling positions and mutable props never enter identity.
type IdentityHandle = {key: string | null; return: IdentityHandle | null; tag: number};
function sourceKey(handle: IdentityHandle): string | undefined {
  // Only a key attached to this declaration (or its immediate component)
  // identifies it. A keyed enclosing circuit alone does not distinguish its
  // multiple unkeyed routes or keepouts.
  if (handle.key === null && handle.return?.key == null) return undefined;
  const keys: string[] = handle.key === null ? [] : [handle.key];
  let owner = handle.return;
  while (owner && owner.tag !== 5) {
    if (owner.key !== null) keys.unshift(owner.key);
    owner = owner.return;
  }
  return keys.length ? JSON.stringify(keys) : undefined;
}

export const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  noTimeout: -1,
  getRootHostContext: () => ({}),
  getChildHostContext: () => ({}),
  getPublicInstance: (instance: DeclarationNode) => instance,
  prepareForCommit: () => null,
  resetAfterCommit: (root: RendererRoot) => root.onCommit(),
  shouldSetTextContent: () => false,
  createInstance(type: string, props: Record<string, unknown>, _root: unknown, _context: unknown, handle: IdentityHandle): DeclarationNode {
    const {children: _children, ...serializableProps} = props;
    const key = sourceKey(handle);
    return {type, ...(key ? {sourceKey: key} : {}), props: serializableProps, children: []};
  },
  createTextInstance() {
    throw new Error('Text is not valid directly inside a PCB design');
  },
  appendInitialChild: append,
  appendChild: append,
  appendChildToContainer: append,
  insertBefore(parent: {children: DeclarationNode[]}, child: DeclarationNode, before: DeclarationNode) {
    remove(parent, child);
    parent.children.splice(parent.children.indexOf(before), 0, child);
  },
  insertInContainerBefore(parent: {children: DeclarationNode[]}, child: DeclarationNode, before: DeclarationNode) {
    remove(parent, child);
    parent.children.splice(parent.children.indexOf(before), 0, child);
  },
  removeChild: remove,
  removeChildFromContainer: remove,
  clearContainer(container: {children: DeclarationNode[]}) {
    container.children = [];
  },
  finalizeInitialChildren: () => false,
  prepareUpdate: () => true,
  commitUpdate(instance: DeclarationNode, _type: string, _oldProps: unknown, newProps: Record<string, unknown>) {
    const {children: _children, ...serializableProps} = newProps;
    instance.props = serializableProps;
  },
  commitTextUpdate: () => {},
  resetTextContent: () => {},
  commitMount: () => {},
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  queueMicrotask,
  getCurrentEventPriority: () => DefaultEventPriority,
  resolveUpdatePriority: () => DefaultEventPriority,
  setCurrentUpdatePriority: () => {},
  getCurrentUpdatePriority: () => NoEventPriority,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  shouldAttemptEagerTransition: () => false,
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: React.createContext(null),
  resetFormInstance: () => {},
  bindToConsole: (_method: unknown, args: unknown) => args,
};
