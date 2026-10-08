import type {DeclarationTree} from '../renderer/types.ts';

export const PROTOCOL_VERSION = 1 as const;

export type DeclarationTransaction = {
  protocolVersion: typeof PROTOCOL_VERSION;
  baseRevision: number | null;
  declarations: DeclarationTree;
};

export function createDeclarationTransaction(
  declarations: DeclarationTree,
  baseRevision: number | null = null,
): DeclarationTransaction {
  return {protocolVersion: PROTOCOL_VERSION, baseRevision, declarations};
}
