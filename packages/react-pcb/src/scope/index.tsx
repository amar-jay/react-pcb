import React, { createContext, useContext, useMemo } from "react";
import { net, part, type Children } from "../model/index.ts";
import { assertName } from "../validation/index.ts";

const ScopeContext = createContext<readonly string[]>([]);

export type ModuleProps = Children & { name: string };

function scopedId(scope: readonly string[], name: string) {
	return [...scope, name].join("/");
}

export function Module({ name, children }: ModuleProps) {
	assertName(name, "Module name");
	const parent = useContext(ScopeContext);
	const scope = useMemo(() => [...parent, name], [parent, name]);

	return (
		<ScopeContext.Provider value={scope}>
			{React.createElement(
				"pcb-module",
				{ name, scope: scope.join("/") },
				children,
			)}
		</ScopeContext.Provider>
	);
}

export function useNet(name: string) {
	assertName(name, "Net name");
	const scope = useContext(ScopeContext);
	const id = scopedId(scope, name);
	return useMemo(() => net(name, id), [id, name]);
}

export function usePart(reference: string) {
	assertName(reference, "Part reference");
	const scope = useContext(ScopeContext);
	const id = scopedId(scope, reference);
	return useMemo(() => part(reference, id), [id, reference]);
}

export function globalNet(name: string) {
	assertName(name, "Global net name");
	return net(name, `global/${name}`);
}
