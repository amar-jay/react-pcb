import React, {type ReactNode} from 'react';
import Reconciler from 'react-reconciler';
import {DefaultEventPriority, NoEventPriority} from 'react-reconciler/constants.js';

export type DeclarationNode = {type: string; props: Record<string, unknown>; children: DeclarationNode[]};
export type DeclarationTree = {kind: 'react-pcb-declarations'; children: DeclarationNode[]};
type Root = DeclarationTree & {onCommit: () => void};

function append(parent: {children: DeclarationNode[]}, child: DeclarationNode) {
  parent.children.push(child);
}
function remove(parent: {children: DeclarationNode[]}, child: DeclarationNode) {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
}

const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  noTimeout: -1,
  getRootHostContext: () => ({}),
  getChildHostContext: () => ({}),
  getPublicInstance: (instance: DeclarationNode) => instance,
  prepareForCommit: () => null,
  resetAfterCommit: (root: Root) => root.onCommit(),
  shouldSetTextContent: () => false,
  createInstance(type: string, props: Record<string, unknown>): DeclarationNode {
    const {children: _children, ...serializableProps} = props;
    return {type, props: serializableProps, children: []};
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

const reconciler = Reconciler(hostConfig as never);

export async function renderDeclarations(element: ReactNode): Promise<DeclarationTree> {
  let committed!: () => void;
  const commit = new Promise<void>(resolve => { committed = resolve; });
  const root: Root = {kind: 'react-pcb-declarations', children: [], onCommit: committed};
  const container = reconciler.createContainer(
    root as never, 0, null, false, null, '',
    console.error, console.error, console.error, () => {}, null,
  );
  reconciler.updateContainer(element, container, null, null);
  await commit;
  return {kind: root.kind, children: root.children};
}
