import { expect, spyOn, test } from "bun:test";
import {
	Board,
	compile,
	definePart,
	net,
	Part,
	pad,
	part,
	Route,
	rect,
} from "../index.ts";
import { testLayers } from "./fixtures.ts";

const options = { cwd: `${import.meta.dir}/../../../..`, hideWarnings: true };
const signal = net("Signal", "nets/signal");
const a = part("J1", "left/J1");
const b = part("J1", "right/J1");
const c = part("J3");

function Circuit({ complete = false }: { complete?: boolean }) {
	return (
		<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
			<Part id={a} footprint="TEST" connect={{ 1: signal }} />
			<Part id={b} footprint="TEST" connect={{ 1: signal }} />
			<Part id={c} footprint="TEST" connect={{ 1: signal }} />
			<Route net={signal} from={pad(a, "1")} to={pad(b, "1")} />
			{complete && <Route net={signal} from={pad(b, "1")} to={pad(c, "1")} />}
		</Board>
	);
}

test("unconnected endpoints warn through the compiler bridge and clear when connected", async () => {
	const result = await compile(<Circuit />, options);
	expect(result.diagnostics.filter((d) => d.code === "PCBIR034")).toMatchObject(
		[
			{
				severity: "warning",
				entity: "nets/signal",
				message:
					"net Signal has 2 disconnected endpoint groups in routing intent: [J3.1] | [left/J1.1, right/J1.1]",
			},
		],
	);
	const connected = await compile(<Circuit complete />, options);
	expect(connected.diagnostics.filter((d) => d.code === "PCBIR034")).toEqual(
		[],
	);
	expect(connected.ir.parts.map((p) => p.id)).toEqual(
		result.ir.parts.map((p) => p.id),
	);
	const warnings = result.diagnostics.filter((d) => d.code === "PCBIR034");
	expect(JSON.parse(JSON.stringify(warnings))).toEqual(warnings);
});

test("unused optional pins and single-endpoint nets warn without blocking compilation", async () => {
	const Device = definePart(
		{
			manufacturer: "Test",
			mpn: "OPTIONAL-PINS",
			package: "Test",
			datasheet: { url: "https://example.com", document: "Test" },
			pinoutCoverage: "complete",
			pins: {
				A: { electricalType: "passive" },
				B: { electricalType: "passive" },
			},
		},
		{ footprint: "TEST", pinMap: { A: ["1", "2"], B: "3" } },
	);
	const result = await compile(
		<Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
			<Device id={a} connect={{ A: signal }} />
		</Board>,
		options,
	);
	expect(result.diagnostics.filter((d) => d.code !== "PCBIR024")).toMatchObject(
		[
			{
				code: "PCBIR032",
				severity: "warning",
				entity: "left/J1",
				message: "unconnected pins: B",
			},
			{
				code: "PCBIR033",
				severity: "warning",
				entity: "nets/signal",
				message: "net Signal has only one connected endpoint: left/J1.A",
			},
		],
	);
});

test("connectivity warnings are printed by default and hideWarnings only silences output", async () => {
	const log = spyOn(console, "error").mockImplementation(() => {});
	try {
		const printed = await compile(<Circuit />, { cwd: options.cwd });
		expect(
			log.mock.calls.some(([text]) =>
				String(text).includes("warning[PCBIR034]"),
			),
		).toBe(true);
		log.mockClear();
		const hidden = await compile(<Circuit />, options);
		expect(log).not.toHaveBeenCalled();
		expect(hidden.diagnostics).toEqual(printed.diagnostics);
	} finally {
		log.mockRestore();
	}
});
