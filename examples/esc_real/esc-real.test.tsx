import { expect, test } from "bun:test";
import { compile } from "@react-pcb/core";
import { auditCircuit, nominalCalculations } from "./audit.ts";
import EscReal from "./board.tsx";
import { currentAmp, driver, latch, mcu } from "./catalog.ts";
import { createCircuit } from "./circuit.ts";
import { Circuit } from "./model.ts";

test("package-specific pin numbers follow manufacturer drawings", () => {
	// Independent transcription: TI INA240 D diagram, SN74LVC1G74 DCT diagram,
	// STM32G431CB table12 and STDRIVE101 table2. Do not infer from sibling packages.
	expect(currentAmp.pinMap).toEqual({
		"IN-": "1",
		GND: "2",
		REF2: "3",
		NC: "4",
		OUT: "5",
		VS: "6",
		REF1: "7",
		"IN+": "8",
	});
	expect(latch.pinMap.nQ).toBe("3");
	expect(latch.pinMap.Q).toBe("5");
	expect(mcu.pinMap.VSS23).toBe("23");
	expect(mcu.pinMap.VDD24).toBe("24");
	expect(mcu.pinMap.PB11).toBe("25");
	expect(Object.keys(mcu.pinMap)).toHaveLength(48);
	expect(driver.pinMap.GLS1).toBe("24");
	expect(driver.pinMap.GND).toBe("EP");
});

test("all circuit pins are deliberately connected or excluded with a reason", () => {
	const c = createCircuit();
	expect(auditCircuit(c).errors).toEqual([]);
	for (const p of c.parts)
		expect(
			Object.keys(p.connections).length + Object.keys(p.noConnect).length,
		).toBe(Object.keys(p.device.pinMap).length);
	const invalid = new Circuit();
	expect(() =>
		invalid.add("test", "U1", latch, { CLK: "CLOCK" }, "Incomplete circuit"),
	).toThrow("pin needs connection");
});

test("audit catches a shunt bypass, reversed fault diode and brake inhibit", () => {
	for (const [ref, pin, wrongNet] of [
		["Q_UL", "S", "PGND"],
		["D_OC_UP", "A", "OC_UP_n"],
		["U_BR_DRV", "IN+", "ARMED"],
		["R_RON_AUX", "2", "DC_LINK+"],
	] as const) {
		const c = createCircuit();
		const p = c.parts.find((p) => p.reference === ref);
		if (!p) throw new Error(`Missing ${ref}`);
		p.connections[pin] = c.n(wrongNet);
		expect(
			auditCircuit(c).errors.some((e) => e.startsWith(`${ref}.${pin}:`)),
		).toBe(true);
	}
});

test("nominal checks bound operating current and regenerative headroom", () => {
	const n = nominalCalculations();
	expect(n.currentTripPositiveA).toBeCloseTo(30, 0);
	expect(n.currentTripNegativeA).toBeCloseTo(-30, 0);
	expect(n.brakeOffV).toBeLessThan(n.brakeOnV);
	expect(n.brakeOnV).toBeLessThan(n.emergencyOvTripV);
	expect(n.emergencyOvTripV).toBeLessThan(65);
	expect(n.bulkEnergy54to65J).toBeLessThan(1);
	expect(n.gateRegulatorTypicalChargeCurrentA).toBeLessThan(0.01);
	expect(n.buckUvStartupV).toBeLessThan(40);
});

test("native compiler preserves stable identity and unresolved physical state", async () => {
	const c = createCircuit();
	const options = { cwd: `${import.meta.dir}/../..`, hideWarnings: true };
	const original = await compile(<EscReal circuit={c} />, options);
	c.parts.reverse();
	const reordered = await compile(<EscReal circuit={c} />, options);
	// Array order is source order; compare entities by stable ID, never by index.
	expect(
		[...original.ir.parts].sort((a, b) => a.id.localeCompare(b.id)),
	).toEqual([...reordered.ir.parts].sort((a, b) => a.id.localeCompare(b.id)));
	expect(original.ir.nets).toEqual(reordered.ir.nets);
	expect(original.ir.componentDefinitions).toEqual(
		reordered.ir.componentDefinitions,
	);
	expect(original.ir.parts).toHaveLength(
		c.parts.filter((p) => p.populate).length,
	);
	expect(original.ir.parts.every((p) => p.at === null)).toBe(true);
	expect(
		Object.values(original.ir.footprintDefinitions).every(
			(f) => !f.resolved && f.pads.length === 0,
		),
	).toBe(true);
	expect(original.ir.parts.some((p) => p.reference === "R_CAN_LINK")).toBe(
		false,
	);
	expect(original.diagnostics.some((d) => d.code === "PCBIR024")).toBe(true);
	const resistor = original.ir.parts.find((p) => p.reference === "R_CP");
	if (!resistor) throw new Error("R_CP missing from IR");
	expect(
		original.ir.componentDefinitions[resistor.component]?.mpn,
	).toBeUndefined();
	expect(original.ir.componentDefinitions[resistor.component]?.value).toContain(
		"1k",
	);
	expect(JSON.parse(JSON.stringify(original.ir))).toEqual(original.ir);
});
