import { phases } from "./circuit.ts";
import type { Circuit } from "./model.ts";

/** Structural circuit checks; neither an analog simulation nor a manufacturing ERC. */
export function auditCircuit(c: Circuit) {
	const errors: string[] = [];
	const get = (ref: string) =>
		c.parts.find((p) => p.reference === ref && p.populate);
	const check = (ref: string, pin: string, expected: string) => {
		const actual = get(ref)?.connections[pin]?.name;
		if (actual !== expected)
			errors.push(
				`${ref}.${pin}: expected ${expected}, found ${actual ?? "missing"}`,
			);
	};
	for (const x of phases) {
		check(`Q_${x}H`, "D", "DC_LINK+");
		check(`Q_${x}H`, "S", `PH_${x}`);
		check(`Q_${x}H`, "KS", `PH_${x}`);
		check(`Q_${x}L`, "D", `PH_${x}`);
		check(`Q_${x}L`, "S", `LS_${x}`);
		check(`Q_${x}L`, "KS", `LS_${x}`);
		check(`R_SHUNT_${x}`, "I1", `LS_${x}`);
		check(`R_SHUNT_${x}`, "E1", `LS_${x}`);
		check(`R_SHUNT_${x}`, "I2", "PGND");
		check(`R_SHUNT_${x}`, "E2", "PGND");
		check(`R_I_${x}P`, "1", `LS_${x}`);
		check(`R_I_${x}N`, "1", "PGND");
		check(`U_I_${x}`, "REF1", "3V3_A");
		check(`U_I_${x}`, "REF2", "PGND");
		check(`U_I_${x}`, "IN+", `IS_${x}P`);
		check(`U_I_${x}`, "IN-", `IS_${x}N`);
		check(`C_BOOT_${x}`, "1", `BOOT_${x}`);
		check(`C_BOOT_${x}`, "2", `PH_${x}`);
		for (const side of ["H", "L"]) {
			check(`R_GATE_${x}${side}`, "1", `DRV_${x}${side}`);
			check(`R_GATE_${x}${side}`, "2", `G_${x}${side}`);
			check(`R_GS_${x}${side}`, "2", side === "H" ? `PH_${x}` : `LS_${x}`);
		}
		check(`U_OC_${x}`, "IN1+", "OC_HI");
		check(`U_OC_${x}`, "IN1-", `I_RAW_${x}`);
		check(`U_OC_${x}`, "IN2+", `I_RAW_${x}`);
		check(`U_OC_${x}`, "IN2-", "OC_LO");
		check(`U_OC_${x}`, "OUT1", `OC_${x}P_n`);
		check(`U_OC_${x}`, "OUT2", `OC_${x}N_n`);
		for (const sign of ["P", "N"]) {
			check(`D_OC_${x}${sign}`, "A", "FAULT_CLEAR_n");
			check(`D_OC_${x}${sign}`, "K", `OC_${x}${sign}_n`);
		}
	}
	for (const [i, x] of phases.entries()) {
		check("U_DRV", `IN${i + 1}`, `PWM_${x}`);
		check("U_DRV", `EN${i + 1}`, `EN_${x}`);
		check("U_DRV", `OUT${i + 1}`, `PH_${x}`);
		check("U_DRV", `BOOT${i + 1}`, `BOOT_${x}`);
		check("U_DRV", `GHS${i + 1}`, `DRV_${x}H`);
		check("U_DRV", `GLS${i + 1}`, `DRV_${x}L`);
		check("U_ENABLE", `A${i + 1}`, `EN_REQ_${x}`);
		check("U_ENABLE", `Y${i + 1}`, `EN_BUF_${x}`);
		check(`R_EN_SER_${x}`, "1", `EN_BUF_${x}`);
		check(`R_EN_SER_${x}`, "2", `EN_${x}`);
		check(`R_PWM_SER_${x}`, "1", `PWM_MCU_${x}`);
		check(`R_PWM_SER_${x}`, "2", `PWM_${x}`);
		check(`R_EN_${x}`, "2", "PGND");
		check(`R_PWM_${x}`, "2", "PGND");
	}
	check("U_DRV", "VS", "DC_LINK+");
	check("U_DRV", "REG12", "REG12");
	check("R_CP", "2", "PGND");
	check("U_LATCH", "nQ", "DISABLED");
	check("U_LATCH", "nCLR", "FAULT_CLEAR_n");
	check("U_LATCH", "CLK", "ARM_CLK");
	check("U_LATCH", "D", "3V3");
	check("U_LATCH", "nPRE", "3V3");
	check("U_ENABLE", "nOE1", "DISABLED");
	check("R_DISARM", "1", "DISARM_n");
	check("R_DISARM", "2", "PGND");
	for (const [ref, source] of [
		["D_RESET", "RESET_n"],
		["D_DRIVER", "DRIVER_FAULT_n"],
		["D_DISARM", "DISARM_n"],
		["D_OV", "OV_n"],
	] as const) {
		check(ref, "A", "FAULT_CLEAR_n");
		check(ref, "K", source);
	}
	check("U_BR_DRV", "VDD", "12V_AUX");
	check("U_BR_DRV", "IN+", "BRAKE_ON");
	check("U_BR_DRV", "IN-", "PGND");
	check("U_BUS_CMP", "IN1+", "BUS_BRAKE");
	check("U_BUS_CMP", "IN2-", "BUS_OV");
	check("U_BUS_CMP", "IN1-", "BRAKE_REF");
	check("U_BUS_CMP", "IN2+", "OV_REF");
	check("U_BUS_CMP", "OUT1", "BRAKE_ON");
	check("U_BUS_CMP", "OUT2", "OV_n");
	check("U_MCU", "PB12", "FAULT_CLEAR_n");
	check("U_MCU", "PB4", "DISARM_n");
	check("U_MCU", "PC13", "ARM_CLK");
	check("R_BRAKE_HYST", "2", "BUS_BRAKE");
	check("J_BRAKE", "1", "DC_LINK+");
	check("J_BRAKE", "2", "BR_SW");
	for (const tag of ["AUX", "LOGIC"]) check(`R_RON_${tag}`, "2", "PGND");
	// Push-pull fault outputs must never be shorted together by a net label.
	const outputs = c.parts
		.filter((p) => p.populate && p.reference.startsWith("U_OC_"))
		.flatMap((p) => ["OUT1", "OUT2"].map((pin) => p.connections[pin]?.id));
	if (outputs.length !== 6 || new Set(outputs).size !== 6)
		errors.push(
			"Overcurrent push-pull outputs require six distinct isolated nets",
		);
	return {
		errors,
		checks:
			"Power paths, Kelvin connectivity, all driver channels, fault polarity, enable defaults, independent brake, and buck RON",
	};
}

export function nominalCalculations() {
	const rail = 3.3,
		shunt = 0.002,
		gain = 20;
	const hi = (rail * 10000) / 11580,
		lo = (rail * 10000) / 73400;
	const brakeRef = (rail * 10000) / 12100;
	const ovTop = 1180,
		ovBottom = 10000,
		feedback = 1e6;
	const ovRef =
		(rail / ovTop + rail / feedback) /
		(1 / ovTop + 1 / ovBottom + 1 / feedback);
	return {
		assumptionsOnly: true,
		currentVoltsPerAmp: shunt * gain,
		currentTripPositiveA: (hi - rail / 2) / (shunt * gain),
		currentTripNegativeA: (lo - rail / 2) / (shunt * gain),
		shuntLossAt10ArmsW: 10 ** 2 * shunt,
		gateRegulatorTypicalChargeCurrentA: 6 * 43e-9 * 20000,
		brakeOnV: brakeRef * 22,
		brakeOffV: brakeRef * 22 - rail,
		emergencyOvTripV: ovRef * 21,
		bulkCapacitanceF: 6 * 220e-6,
		bulkEnergy54to65J: 0.5 * 6 * 220e-6 * (65 ** 2 - 54 ** 2),
		brakeResistorOnPowerAt60VW: 60 ** 2 / 6.8,
		buckUvStartupV: (1.5 * (1e6 + 39200)) / 39200,
		warning:
			"Nominal arithmetic excludes temperature, tolerances, output swing, rail error, pin loading except OV feedback, dynamics, and physical parasitics. Not a qualification.",
	};
}
