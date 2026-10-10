import type { ReactNode } from "react";
import Reconciler from "react-reconciler";

import { hostConfig } from "./hostConfig.ts";
import type { DeclarationTree, RendererRoot } from "./types.ts";

export type { DeclarationNode, DeclarationTree } from "./types.ts";

const reconciler = Reconciler(hostConfig as never);

export async function renderDeclarations(
	element: ReactNode,
): Promise<DeclarationTree> {
	let committed!: () => void;
	const commit = new Promise<void>((resolve) => {
		committed = resolve;
	});
	const root: RendererRoot = {
		kind: "react-pcb-declarations",
		children: [],
		onCommit: committed,
	};
	const container = reconciler.createContainer(
		root as never,
		0,
		null,
		false,
		null,
		"",
		console.error,
		console.error,
		console.error,
		() => {},
		null,
	);
	reconciler.updateContainer(element, container, null, null);
	await commit;
	return { kind: root.kind, children: root.children };
}
