import { expect, test } from "bun:test";

import { Board, Part } from "../components/index.ts";
import { rect } from "../model/index.ts";
import { renderDeclarations } from "../renderer/index.ts";
import { Module, useNet, usePart } from "../scope/index.tsx";
import { testLayers } from "./fixtures.ts";

test("scopes identical local net and part names by module", async () => {
	function LocalCircuit() {
		const signal = useNet("SIG");
		const device = usePart("U1");
		return <Part id={device} footprint="TEST" connect={{ 1: signal }} />;
	}

	const declarations = await renderDeclarations(
		<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
			<Module name="left">
				<LocalCircuit />
			</Module>
			<Module name="right">
				<LocalCircuit />
			</Module>
		</Board>,
	);

	const modules = declarations.children[0]?.children ?? [];
	expect(modules[0]?.children[0]?.props.id).toEqual({
		kind: "part",
		id: "left/U1",
		reference: "U1",
	});
	expect(modules[1]?.children[0]?.props.id).toEqual({
		kind: "part",
		id: "right/U1",
		reference: "U1",
	});
	expect(modules[0]?.children[0]?.props.connect).toEqual({
		1: { kind: "net", id: "left/SIG", name: "SIG" },
	});
	expect(modules[1]?.children[0]?.props.connect).toEqual({
		1: { kind: "net", id: "right/SIG", name: "SIG" },
	});
});
