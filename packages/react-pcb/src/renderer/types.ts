export type DeclarationNode = {
  type: string;
  props: Record<string, unknown>;
  children: DeclarationNode[];
};

export type DeclarationTree = {
  kind: 'react-pcb-declarations';
  children: DeclarationNode[];
};

export type RendererRoot = DeclarationTree & {onCommit: () => void};
