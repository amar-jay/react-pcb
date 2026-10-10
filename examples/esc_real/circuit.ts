import * as d from "./catalog.ts";
import { Circuit, device } from "./model.ts";

export const phases = ["U", "V", "W"] as const;

/** Every native pin must be connected or carry an explicit no-connect reason. */
export function createCircuit() {
	const c = new Circuit();
	const pair = (
		s: string,
		ref: string,
		kind: "R" | "C" | "FB" | "NTC" | "SW" | "LED",
		value: string,
		a: string,
		b: string,
		role: string,
		pkg = "0603",
		populate = true,
	) =>
		c.add(s, ref, d.passive(kind, value, pkg), { "1": a, "2": b }, role, {
			populate,
		});
	const r = (
		s: string,
		ref: string,
		value: string,
		a: string,
		b: string,
		role: string,
		pkg = "0603",
		pop = true,
	) => pair(s, ref, "R", value, a, b, role, pkg, pop);
	const cap = (
		s: string,
		ref: string,
		value: string,
		a: string,
		b: string,
		role: string,
		pkg = "0603",
		pop = true,
	) => pair(s, ref, "C", value, a, b, role, pkg, pop);
	const diode = (
		s: string,
		ref: string,
		a: string,
		k: string,
		role: string,
		populate = true,
	) =>
		c.add(s, ref, d.schottky, { A: a, K: k }, role, {
			noConnect: { NC: "Manufacturer NC terminal" },
			populate,
		});
	const divider = (
		s: string,
		name: string,
		input: string,
		output: string,
		top: string,
		bottom: string,
	) => {
		r(s, `R_${name}_TOP`, top, input, output, "Divider upper resistor");
		r(s, `R_${name}_BOT`, bottom, output, "PGND", "Divider lower resistor");
	};
	const busDivider = (
		s: string,
		name: string,
		input: string,
		output: string,
	) => {
		r(
			s,
			`R_${name}_T1`,
			"100k 0.1% >=75V working",
			input,
			`${name}_MID`,
			"Voltage divider upper series resistor",
			"0805",
		);
		r(
			s,
			`R_${name}_T2`,
			"100k 0.1% >=75V working",
			`${name}_MID`,
			output,
			"Voltage divider upper series resistor",
			"0805",
		);
		r(
			s,
			`R_${name}_BOT`,
			"10k 0.1%",
			output,
			"PGND",
			"Voltage divider bottom resistor",
		);
	};

	// DC input is AFTER the off-board DC fuse, precharge, and main disconnect.
	c.add(
		"power",
		"J_DC",
		d.terminal,
		{ "1": "DC_LINK+", "2": "PGND" },
		"Fused, precharged DC input",
	);
	for (let i = 1; i <= 6; i++)
		c.add(
			"power",
			`C_BULK${i}`,
			d.bulk,
			{ "+": "DC_LINK+", "-": "PGND" },
			"DC-link electrolytic; 20kHz ripple/lifetime not yet qualified",
		);
	r(
		"power",
		"R_BLEED1",
		"22k 1% 0.25W",
		"DC_LINK+",
		"BLEED_MID",
		"Bus discharge",
		"1206",
	);
	r(
		"power",
		"R_BLEED2",
		"22k 1% 0.25W",
		"BLEED_MID",
		"PGND",
		"Bus discharge",
		"1206",
	);
	for (const x of phases) {
		c.add(
			"inverter",
			`Q_${x}H`,
			d.fet,
			{ D: "DC_LINK+", S: `PH_${x}`, KS: `PH_${x}`, G: `G_${x}H` },
			"High-side SiC cascode; KS must have its own gate-return route",
		);
		c.add(
			"inverter",
			`Q_${x}L`,
			d.fet,
			{ D: `PH_${x}`, S: `LS_${x}`, KS: `LS_${x}`, G: `G_${x}L` },
			"Low-side SiC cascode above phase shunt",
		);
		c.add(
			"inverter",
			`R_SHUNT_${x}`,
			d.shunt,
			{ I1: `LS_${x}`, I2: "PGND", E1: `LS_${x}`, E2: "PGND" },
			"4-terminal shunt; E1/E2 sense pickup at current lands, not elsewhere on these nets",
		);
		c.add(
			"inverter",
			`J_${x}`,
			d.terminal,
			{ "1": `PH_${x}` },
			"Motor phase terminal",
			{
				noConnect: { "2": "Unused terminal, do not bridge to phase or ground" },
			},
		);
		for (let i = 1; i <= 2; i++)
			cap(
				"inverter",
				`C_LINK_${x}${i}`,
				"1uF 100V X7R effective >=0.47uF at 65V",
				"DC_LINK+",
				"PGND",
				"Commutation-loop local bypass",
				"1210",
			);
		cap(
			"inverter",
			`C_LINK_${x}HF`,
			"100nF 100V X7R",
			"DC_LINK+",
			"PGND",
			"Local high frequency bypass",
			"0805",
		);
		cap(
			"drive",
			`C_BOOT_${x}`,
			"1uF 25V X7R effective >=0.47uF",
			`BOOT_${x}`,
			`PH_${x}`,
			"Bootstrap capacitor; positive terminal at BOOT",
			"0805",
		);
		for (const side of ["H", "L"] as const) {
			const ret = side === "H" ? `PH_${x}` : `LS_${x}`;
			r(
				"drive",
				`R_GATE_${x}${side}`,
				"15 1%",
				`DRV_${x}${side}`,
				`G_${x}${side}`,
				"Series gate damping",
				"0805",
			);
			r(
				"drive",
				`R_GS_${x}${side}`,
				"10k 1%",
				`G_${x}${side}`,
				ret,
				"Gate-source pulldown at Kelvin source",
			);
			r(
				"drive",
				`R_OFF_${x}${side}`,
				"4.7 1%",
				`OFF_${x}${side}`,
				`DRV_${x}${side}`,
				"Optional faster gate discharge; fit only after double-pulse testing",
				"0805",
				false,
			);
			c.add(
				"drive",
				`D_OFF_${x}${side}`,
				d.gateDischargeDiode,
				{ A: `G_${x}${side}`, K: `OFF_${x}${side}` },
				"Optional turn-off bypass (gate to driver)",
				{ populate: false },
			);
		}
		r(
			"inverter",
			`R_SNUB_${x}`,
			"10 pulse-rated",
			`PH_${x}`,
			`SNUB_${x}`,
			"Optional phase snubber; value measured on hardware",
			"1206",
			false,
		);
		cap(
			"inverter",
			`C_SNUB_${x}`,
			"1nF 100V C0G",
			`SNUB_${x}`,
			"PGND",
			"Optional phase snubber",
			"0805",
			false,
		);
	}
	c.add(
		"drive",
		"U_DRV",
		d.driver,
		{
			CP: "CP_FILTER",
			"DT/MODE": "DT_MODE",
			SCREF: "SCREF",
			VS: "DC_LINK+",
			REG12: "REG12",
			nFAULT: "DRIVER_FAULT_n",
			IN1: "PWM_U",
			IN2: "PWM_V",
			IN3: "PWM_W",
			EN1: "EN_U",
			EN2: "EN_V",
			EN3: "EN_W",
			BOOT1: "BOOT_U",
			BOOT2: "BOOT_V",
			BOOT3: "BOOT_W",
			GHS1: "DRV_UH",
			GHS2: "DRV_VH",
			GHS3: "DRV_WH",
			OUT1: "PH_U",
			OUT2: "PH_V",
			OUT3: "PH_W",
			GLS1: "DRV_UL",
			GLS2: "DRV_VL",
			GLS3: "DRV_WL",
			GND: "PGND",
		},
		"Three complete EN/IN channels; internal REG12 only",
	);
	r(
		"drive",
		"R_CP",
		"1k",
		"CP_FILTER",
		"PGND",
		"Disable unused ground-referenced current comparator input",
	);
	cap("drive", "C_CP", "100pF 50V C0G", "CP_FILTER", "PGND", "CP noise filter");
	r(
		"drive",
		"R_DT",
		"100k 1%",
		"DT_MODE",
		"PGND",
		"EN/IN mode and deadtime; confirm tolerance against datasheet",
	);
	divider("drive", "SCREF", "3V3_A", "SCREF", "4.32k 0.1%", "10k 0.1%");
	cap(
		"drive",
		"C_SCREF",
		"10nF 16V",
		"SCREF",
		"PGND",
		"VDS protection reference filtering",
	);
	cap(
		"drive",
		"C_REG",
		"10uF 25V X7R effective >=4.7uF",
		"REG12",
		"PGND",
		"Gate regulator stability and switching reservoir",
		"0805",
	);
	cap(
		"drive",
		"C_REG_HF",
		"100nF 25V",
		"REG12",
		"PGND",
		"Gate regulator HF bypass",
	);
	cap(
		"drive",
		"C_VS",
		"1uF 100V X7R",
		"DC_LINK+",
		"PGND",
		"Driver VS bypass",
		"1210",
	);
	cap(
		"drive",
		"C_VS_HF",
		"100nF 100V",
		"DC_LINK+",
		"PGND",
		"Driver VS HF bypass",
		"0805",
	);
	for (const x of phases) {
		r(
			"drive",
			`R_PWM_SER_${x}`,
			"100",
			`PWM_MCU_${x}`,
			`PWM_${x}`,
			"PWM input damping",
		);
		r(
			"drive",
			`R_EN_SER_${x}`,
			"100",
			`EN_BUF_${x}`,
			`EN_${x}`,
			"Enable input damping",
		);
		r(
			"drive",
			`R_PWM_${x}`,
			"10k",
			`PWM_${x}`,
			"PGND",
			"Default IN low during reset",
		);
		r(
			"drive",
			`R_EN_${x}`,
			"10k",
			`EN_${x}`,
			"PGND",
			"Default EN low when buffer is disabled",
		);
		r(
			"control",
			`R_EN_REQ_${x}`,
			"10k",
			`EN_REQ_${x}`,
			"PGND",
			"Default MCU enable request low",
		);
	}

	// Two independent LM5164 supplies. RON connects to GND, not VIN.
	for (const [tag, supply, top, ron, ra, cb] of [
		["AUX", "12V_AUX", "453k 1%", "100k 1%", "453k 1%", "56pF 50V C0G"],
		["LOGIC", "5V", "158k 1%", "41.2k 1%", "221k 1%", "220pF 50V C0G"],
	] as const) {
		c.add(
			"supplies",
			`U_BUCK_${tag}`,
			d.buck,
			{
				GND: "PGND",
				EP: "PGND",
				VIN: "DC_LINK+",
				EN: `UVLO_${tag}`,
				RON: `RON_${tag}`,
				FB: `FB_${tag}`,
				BST: `BST_${tag}`,
				SW: `SW_${tag}`,
			},
			"Synchronous buck with type-3 ripple injection",
			{ noConnect: { PGOOD: "Not used; logic rail supervised separately" } },
		);
		for (let i = 1; i <= 2; i++) {
			cap(
				"supplies",
				`C_IN_${tag}${i}`,
				"2.2uF 100V X7R",
				"DC_LINK+",
				"PGND",
				"Buck input reservoir",
				"1210",
			);
			cap(
				"supplies",
				`C_OUT_${tag}${i}`,
				"22uF 25V X7R",
				supply,
				"PGND",
				"Buck output reservoir; DC bias in stability review",
				"1210",
			);
		}
		c.add(
			"supplies",
			`L_${tag}`,
			device(
				"coilcraft:MSS1246T-683MLB",
				"Coilcraft",
				"MSS1246T-683MLB",
				"MSS1246T",
				"https://www.coilcraft.com/en-us/products/power/shielded-inductors/molded-inductor/mss/mss1246t/",
				{ "1": ["1", "passive"], "2": ["2", "passive"] },
				"68uH",
			),
			{ "1": `SW_${tag}`, "2": supply },
			"Buck inductor; verify peak-current and temperature derating",
		);
		divider(
			"supplies",
			`UVLO_${tag}`,
			"DC_LINK+",
			`UVLO_${tag}`,
			"1M 1% >=75V working",
			"39.2k 1%",
		);
		r(
			"supplies",
			`R_RON_${tag}`,
			ron,
			`RON_${tag}`,
			"PGND",
			"Constant-on-time programming",
		);
		divider("supplies", `FB_${tag}`, supply, `FB_${tag}`, top, "49.9k 1%");
		cap(
			"supplies",
			`C_BST_${tag}`,
			"2.2nF 50V",
			`BST_${tag}`,
			`SW_${tag}`,
			"Buck bootstrap",
		);
		r(
			"supplies",
			`R_RIPPLE_${tag}`,
			ra,
			`SW_${tag}`,
			`RIPPLE_${tag}`,
			"Type-3 ripple ramp resistor",
			"0805",
		);
		cap(
			"supplies",
			`C_RIPPLE_${tag}`,
			"3.3nF 50V",
			`RIPPLE_${tag}`,
			supply,
			"Type-3 ripple ramp capacitor",
		);
		cap(
			"supplies",
			`C_COUPLE_${tag}`,
			cb,
			`RIPPLE_${tag}`,
			`FB_${tag}`,
			"Couple ramp into feedback",
		);
	}
	c.add(
		"supplies",
		"U_LDO",
		d.ldo,
		{ IN: "5V", OUT: "3V3", EN: "LDO_EN", GND: "PGND" },
		"3.3V logic LDO; 200mA provisional budget",
		{ noConnect: { NC: "Manufacturer NC terminal" } },
	);
	r("supplies", "R_LDO_EN", "10k", "5V", "LDO_EN", "Enable from input supply");
	cap(
		"supplies",
		"C_LDO_IN",
		"4.7uF 10V X7R",
		"5V",
		"PGND",
		"LDO input bypass",
		"0805",
	);
	cap(
		"supplies",
		"C_LDO_OUT",
		"4.7uF 10V X7R",
		"3V3",
		"PGND",
		"LDO output stability",
		"0805",
	);
	pair(
		"supplies",
		"FB_ANALOG",
		"FB",
		"600Ohm at100MHz >=100mA lowDCR; MPN pending",
		"3V3",
		"3V3_A",
		"Analog rail ferrite",
		"0603",
	);
	cap("supplies", "C_ANALOG", "1uF 10V", "3V3_A", "PGND", "Analog rail bulk");
	cap(
		"supplies",
		"C_ANALOG_HF",
		"100nF 10V",
		"3V3_A",
		"PGND",
		"Analog rail bypass",
	);

	divider("sense", "OC_HI", "3V3_A", "OC_HI", "1.58k 0.1%", "10k 0.1%");
	divider("sense", "OC_LO", "3V3_A", "OC_LO", "63.4k 0.1%", "10k 0.1%");
	cap(
		"sense",
		"C_OC_HI",
		"10nF 16V",
		"OC_HI",
		"PGND",
		"Current trip reference filter",
	);
	cap(
		"sense",
		"C_OC_LO",
		"10nF 16V",
		"OC_LO",
		"PGND",
		"Current trip reference filter",
	);
	for (const x of phases) {
		r(
			"sense",
			`R_I_${x}P`,
			"10 0.1%",
			`LS_${x}`,
			`IS_${x}P`,
			"Positive Kelvin sense input; route from E1",
		);
		r(
			"sense",
			`R_I_${x}N`,
			"10 0.1%",
			"PGND",
			`IS_${x}N`,
			"Negative Kelvin sense input; route from E2",
		);
		cap(
			"sense",
			`C_I_DIFF_${x}`,
			"1nF 50V C0G",
			`IS_${x}P`,
			`IS_${x}N`,
			"Balanced differential input filter",
		);
		c.add(
			"sense",
			`U_I_${x}`,
			d.currentAmp,
			{
				"IN+": `IS_${x}P`,
				"IN-": `IS_${x}N`,
				VS: "3V3_A",
				GND: "PGND",
				REF1: "3V3_A",
				REF2: "PGND",
				OUT: `I_RAW_${x}`,
			},
			"Gain20 bidirectional phase-current amplifier",
			{ noConnect: { NC: "Manufacturer NC terminal (SOIC pin4)" } },
		);
		cap(
			"sense",
			`C_I_SUP_${x}`,
			"100nF 10V",
			"3V3_A",
			"PGND",
			"Current amplifier bypass",
		);
		r(
			"sense",
			`R_I_ADC_${x}`,
			"100",
			`I_RAW_${x}`,
			`I_ADC_${x}`,
			"ADC charge isolation",
		);
		cap(
			"sense",
			`C_I_ADC_${x}`,
			"1nF 16V C0G",
			`I_ADC_${x}`,
			"PGND",
			"ADC filter; hardware trip uses unfiltered output",
		);
		c.add(
			"fault",
			`U_OC_${x}`,
			d.comparator,
			{
				VCC: "3V3_A",
				GND: "PGND",
				"IN1+": "OC_HI",
				"IN1-": `I_RAW_${x}`,
				OUT1: `OC_${x}P_n`,
				"IN2+": `I_RAW_${x}`,
				"IN2-": "OC_LO",
				OUT2: `OC_${x}N_n`,
			},
			"Active-low positive and negative overcurrent trips",
		);
		cap(
			"fault",
			`C_OC_SUP_${x}`,
			"100nF 10V",
			"3V3_A",
			"PGND",
			"Comparator bypass",
		);
		for (const sign of ["P", "N"])
			diode(
				"fault",
				`D_OC_${x}${sign}`,
				"FAULT_CLEAR_n",
				`OC_${x}${sign}_n`,
				"Isolate push-pull comparator into active-low fault bus",
			);
	}
	for (const [tag, source] of [
		["BUS", "DC_LINK+"],
		["U", "PH_U"],
		["V", "PH_V"],
		["W", "PH_W"],
	] as const) {
		busDivider("sense", `V_${tag}`, source, `V_RAW_${tag}`);
		r(
			"sense",
			`R_V_ADC_${tag}`,
			"1k",
			`V_RAW_${tag}`,
			`V_ADC_${tag}`,
			"ADC voltage channel isolation",
		);
		cap(
			"sense",
			`C_V_ADC_${tag}`,
			"1nF 16V C0G",
			`V_ADC_${tag}`,
			"PGND",
			"Voltage channel filter",
		);
		diode(
			"sense",
			`D_V_${tag}HI`,
			`V_ADC_${tag}`,
			"3V3_A",
			"ADC upper clamp; back-power budget must be checked",
		);
		diode(
			"sense",
			`D_V_${tag}LO`,
			"PGND",
			`V_ADC_${tag}`,
			"ADC negative excursion clamp",
		);
	}

	// Brake comparator positive feedback is local to its own divider.
	busDivider("brake", "BRAKE_BUS", "DC_LINK+", "BUS_BRAKE");
	busDivider("brake", "OV_BUS", "DC_LINK+", "BUS_OV");
	divider("brake", "BRAKE_REF", "3V3_A", "BRAKE_REF", "2.10k 0.1%", "10k 0.1%");
	divider("brake", "OV_REF", "3V3_A", "OV_REF", "1.18k 0.1%", "10k 0.1%");
	r(
		"brake",
		"R_BRAKE_HYST",
		"200k 0.1%",
		"BRAKE_ON",
		"BUS_BRAKE",
		"Nominal chopper on60V/off56.7V; output swing and rail tolerances matter",
		"0805",
	);
	r(
		"brake",
		"R_OV_HYST",
		"1M 1%",
		"OV_n",
		"OV_REF",
		"Emergency trip hysteresis; include loading in threshold calculation",
	);
	cap(
		"brake",
		"C_BRAKE_BUS",
		"100pF 50V C0G",
		"BUS_BRAKE",
		"PGND",
		"Bus comparator HF filtering",
	);
	cap(
		"brake",
		"C_OV_BUS",
		"100pF 50V C0G",
		"BUS_OV",
		"PGND",
		"Emergency comparator HF filtering",
	);
	c.add(
		"brake",
		"U_BUS_CMP",
		d.comparator,
		{
			VCC: "3V3_A",
			GND: "PGND",
			"IN1+": "BUS_BRAKE",
			"IN1-": "BRAKE_REF",
			OUT1: "BRAKE_ON",
			"IN2+": "OV_REF",
			"IN2-": "BUS_OV",
			OUT2: "OV_n",
		},
		"Brake comparator and independent emergency overvoltage trip",
	);
	cap(
		"brake",
		"C_BUS_CMP",
		"100nF 10V",
		"3V3_A",
		"PGND",
		"Bus comparator bypass",
	);
	cap(
		"brake",
		"C_BRAKE_REF",
		"10nF 16V",
		"BRAKE_REF",
		"PGND",
		"Brake reference filter",
	);
	cap(
		"brake",
		"C_OV_REF",
		"10nF 16V",
		"OV_REF",
		"PGND",
		"Overvoltage reference filter; include delay in trip budget",
	);
	diode(
		"fault",
		"D_OV",
		"FAULT_CLEAR_n",
		"OV_n",
		"Emergency bus overvoltage latches inverter off",
	);
	c.add(
		"brake",
		"U_BR_DRV",
		d.brakeDriver,
		{
			OUTH: "BR_OUT_H",
			OUTL: "BR_OUT_L",
			VDD: "12V_AUX",
			GND: "PGND",
			"IN+": "BRAKE_ON",
			"IN-": "PGND",
		},
		"Chopper gate driver independent of inverter latch and REG12",
	);
	r("brake", "R_BR_IN", "10k", "BRAKE_ON", "PGND", "Brake command default low");
	r("brake", "R_BR_ON", "15", "BR_OUT_H", "G_BR", "Brake gate turn-on", "0805");
	r(
		"brake",
		"R_BR_OFF",
		"4.7",
		"BR_OUT_L",
		"G_BR",
		"Brake gate turn-off",
		"0805",
	);
	r(
		"brake",
		"R_BR_GS",
		"10k",
		"G_BR",
		"PGND",
		"Brake gate-source pulldown at KS",
	);
	cap(
		"brake",
		"C_BR_DRV",
		"1uF 25V X7R",
		"12V_AUX",
		"PGND",
		"Brake driver reservoir",
		"0805",
	);
	cap(
		"brake",
		"C_BR_DRV_HF",
		"100nF 25V",
		"12V_AUX",
		"PGND",
		"Brake driver bypass",
	);
	c.add(
		"brake",
		"Q_BR",
		d.fet,
		{ D: "BR_SW", S: "PGND", KS: "PGND", G: "G_BR" },
		"Low-side SiC cascode brake switch",
	);
	c.add(
		"brake",
		"J_BRAKE",
		d.terminal,
		{ "1": "DC_LINK+", "2": "BR_SW" },
		"External 6.8Ohm brake resistor connection; pulse/energy/temperature qualification required",
	);

	c.add(
		"fault",
		"U_LATCH",
		d.latch,
		{
			CLK: "ARM_CLK",
			D: "3V3",
			Q: "ARMED",
			nQ: "DISABLED",
			nCLR: "FAULT_CLEAR_n",
			nPRE: "3V3",
			VCC: "3V3",
			GND: "PGND",
		},
		"Fault clear low asynchronously removes enable; only explicit ARM rising edge restores it",
	);
	cap("fault", "C_LATCH", "100nF 10V", "3V3", "PGND", "Latch bypass");
	r("fault", "R_FAULT", "10k", "3V3", "FAULT_CLEAR_n", "Fault bus pull-up");
	r(
		"fault",
		"R_DRV_FAULT",
		"10k",
		"3V3",
		"DRIVER_FAULT_n",
		"Driver open-drain fault pull-up",
	);
	diode(
		"fault",
		"D_DRIVER",
		"FAULT_CLEAR_n",
		"DRIVER_FAULT_n",
		"Driver fault clears latch without forcing driver nFAULT low from other faults",
	);
	diode(
		"fault",
		"D_RESET",
		"FAULT_CLEAR_n",
		"RESET_n",
		"Reset inhibits gate enables",
	);
	diode(
		"fault",
		"D_DISARM",
		"FAULT_CLEAR_n",
		"DISARM_n",
		"MCU software disarm clears latch",
	);
	r(
		"fault",
		"R_DISARM",
		"10k",
		"DISARM_n",
		"PGND",
		"Disarm stays asserted until MCU actively raises this output",
	);
	r("fault", "R_ARM", "10k", "ARM_CLK", "PGND", "Prevent unintended arm clock");
	r(
		"fault",
		"R_OE",
		"10k",
		"3V3",
		"DISABLED",
		"Default disabled buffer OE until latch output is valid",
	);
	c.add(
		"fault",
		"U_ENABLE",
		d.enableBuffer,
		{
			VCC: "3V3",
			GND: "PGND",
			nOE1: "DISABLED",
			nOE2: "3V3",
			A1: "EN_REQ_U",
			A2: "EN_REQ_V",
			A3: "EN_REQ_W",
			A4: "PGND",
			A5: "PGND",
			A6: "PGND",
			A7: "PGND",
			A8: "PGND",
			Y1: "EN_BUF_U",
			Y2: "EN_BUF_V",
			Y3: "EN_BUF_W",
		},
		"Latch gates only ENx; INx can wake driver with all ENx held low",
		{
			noConnect: {
				Y4: "Unused output",
				Y5: "Unused output",
				Y6: "Unused output",
				Y7: "Unused output",
				Y8: "Unused output",
			},
		},
	);
	cap("fault", "C_ENABLE", "100nF 10V", "3V3", "PGND", "Enable buffer bypass");

	c.add(
		"control",
		"U_MCU",
		d.mcu,
		{
			VBAT: "3V3",
			"PG10-NRST": "RESET_n",
			VSS23: "PGND",
			VSS35: "PGND",
			VSS47: "PGND",
			VDD24: "3V3",
			VDD36: "3V3",
			VDD48: "3V3",
			VSSA: "PGND",
			VDDA: "3V3_A",
			"VREF+": "3V3_A",
			PA0: "I_ADC_U",
			PA1: "I_ADC_V",
			PA2: "I_ADC_W",
			PA3: "V_ADC_U",
			PA4: "V_ADC_V",
			PA5: "V_ADC_W",
			PA6: "V_ADC_BUS",
			PA7: "CMD",
			PB0: "TEMP_PWR",
			PB1: "TEMP_BRAKE",
			PB2: "TEMP_MOTOR",
			PA8: "PWM_MCU_U",
			PA9: "PWM_MCU_V",
			PA10: "PWM_MCU_W",
			PB13: "EN_REQ_U",
			PB14: "EN_REQ_V",
			PB15: "EN_REQ_W",
			PC13: "ARM_CLK",
			PB4: "DISARM_n",
			PB12: "FAULT_CLEAR_n",
			PB5: "DRIVER_FAULT_n",
			PA11: "CAN_RX",
			PA12: "CAN_TX",
			PB6: "UART_TX",
			PB7: "UART_RX",
			PB9: "HALL_U",
			PB10: "HALL_V",
			PB11: "HALL_W",
			"PB8-BOOT0": "BOOT0",
			PA13: "SWDIO",
			PA14: "SWCLK",
			PB3: "SWO",
			PA15: "LED_STATUS",
		},
		"STM32G431CBT6; two ADCs require a scheduled current-sampling strategy",
		{
			noConnect: {
				PC14: "Reserved LSE input; no crystal fitted",
				PC15: "Reserved LSE output; no crystal fitted",
				PF0: "Reserved HSE input; internal HSI initially",
				PF1: "Reserved HSE output; internal HSI initially",
			},
		},
	);
	for (const supply of ["24", "36", "48"])
		cap(
			"control",
			`C_MCU_${supply}`,
			"100nF 10V",
			"3V3",
			"PGND",
			`Bypass VDD pin${supply}`,
		);
	cap(
		"control",
		"C_MCU_BULK",
		"4.7uF 10V",
		"3V3",
		"PGND",
		"MCU bulk reservoir",
		"0805",
	);
	cap("control", "C_MCU_VBAT", "100nF 10V", "3V3", "PGND", "VBAT pin1 bypass");
	cap(
		"control",
		"C_MCU_VDDA",
		"100nF 10V",
		"3V3_A",
		"PGND",
		"VDDA pin21 bypass",
	);
	cap(
		"control",
		"C_MCU_VREF",
		"1uF 10V",
		"3V3_A",
		"PGND",
		"VREF+ pin20 bypass",
	);
	r(
		"control",
		"R_BOOT",
		"10k",
		"BOOT0",
		"PGND",
		"Default boot strap; configure boot option bytes",
	);
	c.add(
		"control",
		"U_RESET",
		d.supervisor,
		{
			nRESET: "RESET_n",
			GND: "PGND",
			nMR: "RESET_BTN_n",
			CT: "RESET_CT",
			SENSE: "3V3",
			VDD: "3V3",
		},
		"Supervise logic rail and clear fault latch during reset",
	);
	cap("control", "C_RESET", "100nF 10V", "3V3", "PGND", "Supervisor bypass");
	cap(
		"control",
		"C_RESET_CT",
		"10nF 16V",
		"RESET_CT",
		"PGND",
		"Supervisor startup delay; confirm datasheet timing",
	);
	r("control", "R_RESET", "10k", "3V3", "RESET_n", "Reset open-drain pull-up");
	cap("control", "C_NRST", "100nF 10V", "RESET_n", "PGND", "NRST filter");
	r(
		"control",
		"R_RESET_BTN",
		"10k",
		"3V3",
		"RESET_BTN_n",
		"Manual reset pull-up",
	);
	pair(
		"control",
		"SW_RESET",
		"SW",
		"momentary NO; MPN pending",
		"RESET_BTN_n",
		"PGND",
		"Manual reset",
		"Switch-TL3305A-reference",
	);
	r(
		"control",
		"R_LED_STATUS",
		"1k",
		"LED_STATUS",
		"LED_STATUS_A",
		"Status LED current limit",
	);
	pair(
		"control",
		"D_LED_STATUS",
		"LED",
		"green; MPN pending; pin1 anode",
		"LED_STATUS_A",
		"PGND",
		"Firmware status",
		"LED-0603",
	);
	r(
		"control",
		"R_LED_PWR",
		"1k",
		"3V3",
		"LED_PWR_A",
		"Power LED current limit",
	);
	pair(
		"control",
		"D_LED_PWR",
		"LED",
		"green; MPN pending; pin1 anode",
		"LED_PWR_A",
		"PGND",
		"Logic power indicator",
		"LED-0603",
	);

	// Sensor and communication connectors; voltage outputs are not a motor BEC.
	c.add(
		"interfaces",
		"J_HALL",
		d.header("B6B-XH-A", 6, "JST-XH-6-P2.5"),
		{
			"1": "5V_HALL",
			"2": "PGND",
			"3": "HALL_RAW_U",
			"4": "HALL_RAW_V",
			"5": "HALL_RAW_W",
			"6": "TEMP_MOTOR_RAW",
		},
		"5V Hall supply; only 3.3V-compatible/open-collector Hall outputs accepted",
	);
	r(
		"interfaces",
		"R_HALL_PWR",
		"10 0.25W",
		"5V",
		"5V_HALL",
		"Hall supply filter; limited to provisional 50mA",
		"1206",
	);
	cap(
		"interfaces",
		"C_HALL_PWR",
		"10uF 10V",
		"5V_HALL",
		"PGND",
		"Hall supply reservoir",
		"0805",
	);
	cap(
		"interfaces",
		"C_HALL_HF",
		"100nF 10V",
		"5V_HALL",
		"PGND",
		"Hall supply bypass",
	);
	for (const x of phases) {
		r(
			"interfaces",
			`R_HALL_PU_${x}`,
			"4.7k",
			"3V3",
			`HALL_RAW_${x}`,
			"Open-collector Hall pull-up",
		);
		r(
			"interfaces",
			`R_HALL_SER_${x}`,
			"1k",
			`HALL_RAW_${x}`,
			`HALL_${x}`,
			"Hall input isolation",
		);
		cap(
			"interfaces",
			`C_HALL_${x}`,
			"1nF 16V",
			`HALL_${x}`,
			"PGND",
			"Hall input filter",
		);
	}
	for (const tag of ["PWR", "BRAKE", "MOTOR"]) {
		r(
			"sense",
			`R_TEMP_${tag}`,
			"10k 1%",
			"3V3_A",
			`TEMP_${tag}_RAW`,
			"NTC divider pull-up",
		);
		r(
			"sense",
			`R_TEMP_SER_${tag}`,
			"1k",
			`TEMP_${tag}_RAW`,
			`TEMP_${tag}`,
			"Temperature ADC isolation",
		);
		cap(
			"sense",
			`C_TEMP_${tag}`,
			"100nF 16V",
			`TEMP_${tag}`,
			"PGND",
			"Temperature ADC filter",
		);
	}
	pair(
		"sense",
		"TH_PWR",
		"NTC",
		"10k B3435; MPN pending",
		"TEMP_PWR_RAW",
		"PGND",
		"On-board power-stage temperature sensor",
		"NTC-0603",
	);
	c.add(
		"interfaces",
		"J_BR_TEMP",
		d.header("B2B-XH-A", 2, "JST-XH-2-P2.5"),
		{ "1": "TEMP_BRAKE_RAW", "2": "PGND" },
		"External brake-resistor 10k B3435 thermistor",
	);
	c.add(
		"interfaces",
		"J_CMD",
		d.header("B3B-XH-A", 3, "JST-XH-3-P2.5"),
		{ "1": "PGND", "2": "CMD_RAW", "3": "3V3" },
		"3.3V command input; pin3 reference only",
	);
	r(
		"interfaces",
		"R_CMD_SER",
		"1k",
		"CMD_RAW",
		"CMD",
		"Command input isolation",
	);
	r("interfaces", "R_CMD_PD", "10k", "CMD", "PGND", "Default command low");
	cap("interfaces", "C_CMD", "1nF 16V", "CMD", "PGND", "Command filter");
	c.add(
		"interfaces",
		"J_UART",
		d.header("B4B-XH-A", 4, "JST-XH-4-P2.5"),
		{ "1": "PGND", "2": "UART_TX_EXT", "3": "UART_RX_EXT", "4": "3V3" },
		"3.3V UART; not RS232",
	);
	r(
		"interfaces",
		"R_UART_TX",
		"100",
		"UART_TX",
		"UART_TX_EXT",
		"UART series damping",
	);
	r(
		"interfaces",
		"R_UART_RX",
		"1k",
		"UART_RX_EXT",
		"UART_RX",
		"UART input isolation",
	);
	r("interfaces", "R_UART_PU", "10k", "3V3", "UART_RX", "UART idle high");
	c.add(
		"interfaces",
		"J_SWD",
		d.header("FTSH-105-01-L-DV-007-K", 10, "FTSH-2x5-P1.27", "Samtec"),
		{
			"1": "3V3",
			"2": "SWDIO",
			"3": "PGND",
			"4": "SWCLK",
			"5": "PGND",
			"6": "SWO",
			"9": "PGND",
			"10": "RESET_n",
		},
		"ARM 10-pin debug, reference only; debugger must not drive supply",
		{
			noConnect: {
				"8": "Reserved debug terminal",
			},
		},
	);
	r("interfaces", "R_SWDIO", "10k", "3V3", "SWDIO", "SWD idle pull-up");
	r("interfaces", "R_SWCLK", "10k", "SWCLK", "PGND", "SWD clock idle low");
	c.add(
		"interfaces",
		"U_CAN",
		d.can,
		{
			TXD: "CAN_TX",
			RXD: "CAN_RX",
			VCC: "3V3",
			GND: "PGND",
			CANH: "CAN_H",
			CANL: "CAN_L",
		},
		"Classic CAN 1Mbps transceiver; firmware must not enable CAN-FD data rates",
		{
			noConnect: {
				NC5: "Manufacturer NC terminal",
				NC8: "Manufacturer NC terminal",
			},
		},
	);
	cap(
		"interfaces",
		"C_CAN",
		"100nF 10V",
		"3V3",
		"PGND",
		"CAN transceiver bypass",
	);
	r(
		"interfaces",
		"R_CAN_TX",
		"10k",
		"3V3",
		"CAN_TX",
		"Default CAN recessive during reset",
	);
	c.add(
		"interfaces",
		"J_CAN",
		d.header("B3B-XH-A", 3, "JST-XH-3-P2.5"),
		{ "1": "PGND", "2": "CAN_H", "3": "CAN_L" },
		"CAN connector",
	);
	r(
		"interfaces",
		"R_CAN_H",
		"60.4 1% 0.25W",
		"CAN_H",
		"CAN_TERM_MID",
		"Split termination half",
		"1206",
	);
	r(
		"interfaces",
		"R_CAN_L",
		"60.4 1% 0.25W",
		"CAN_TERM_MID",
		"CAN_TERM_END",
		"Split termination half",
		"1206",
	);
	cap(
		"interfaces",
		"C_CAN_TERM",
		"4.7nF 50V",
		"CAN_TERM_MID",
		"PGND",
		"Split termination common-mode filter",
	);
	r(
		"interfaces",
		"R_CAN_LINK",
		"0",
		"CAN_TERM_END",
		"CAN_L",
		"DNP by default; fit only at bus endpoint",
		"0603",
		false,
	);
	for (const [tag, name] of [
		["BUS", "DC_LINK+"],
		["GND", "PGND"],
		["3V3", "3V3"],
		["5V", "5V"],
		["3V3A", "3V3_A"],
		["12V", "12V_AUX"],
		["REG12", "REG12"],
		["FAULT", "FAULT_CLEAR_n"],
		["ARMED", "ARMED"],
		["DRIVER_FAULT", "DRIVER_FAULT_n"],
		["G_BR", "G_BR"],
		["KS_BR", "PGND"],
		...phases.flatMap(
			(x) =>
				[
					[`I_${x}`, `I_RAW_${x}`],
					[`EN_${x}`, `EN_${x}`],
					[`IN_${x}`, `PWM_${x}`],
					[`BOOT_${x}`, `BOOT_${x}`],
					[`BOOT_RET_${x}`, `PH_${x}`],
					[`G_${x}H`, `G_${x}H`],
					[`KS_${x}H`, `PH_${x}`],
					[`G_${x}L`, `G_${x}L`],
					[`KS_${x}L`, `LS_${x}`],
				] as [string, string][],
		),
		...["BUS", ...phases].map((x) => [`V_${x}`, `V_ADC_${x}`] as const),
		...["PWR", "BRAKE", "MOTOR"].map((x) => [`T_${x}`, `TEMP_${x}`] as const),
	] as const) {
		c.add(
			"test",
			`TP_${tag}`,
			device(
				`esc-real:test-point`,
				undefined,
				undefined,
				"TestPoint-D1.5",
				undefined,
				{ "1": ["1", "passive"] },
			),
			{ "1": name },
			"Labelled test pad; BUS touch clearance required",
		);
	}
	c.review = [
		{
			id: "physical",
			status: "required",
			detail:
				"Sourced footprints and initial placement are in board.tsx. Routing, heat-sink mechanics, gate-loop extraction, current-carrying copper, and engineering qualification remain required before fabrication.",
		},
		{
			id: "technology",
			status: "required",
			detail:
				"UF3C065040K4S is a SiC cascode, not a conventional SiC MOSFET. Confirm this choice and minimum bootstrap VGS qualification before purchase.",
		},
		{
			id: "gate-protection",
			status: "required",
			detail:
				"Select and add gate-source clamps and any required bootstrap/OUT transient protection from measured waveform budgets; not present in this provisional circuit.",
		},
		{
			id: "esd",
			status: "required",
			detail:
				"Select and wire connector ESD/TVS protection, bus suppression and input reverse-polarity protection. They are not represented as imaginary generic parts.",
		},
		{
			id: "scref-sequencing",
			status: "required",
			detail:
				"Prove 3V3_A-derived SCREF remains within pin limits on startup, standby, and turn-off with VS absent. Add a sequenced reference if required.",
		},
		{
			id: "fault-vol",
			status: "required",
			detail:
				"Verify BAS70 forward voltage plus worst-case comparator/driver VOL is below latch VIL over temperature, rail tolerance and fault-bus load; otherwise select a lower-VF diode or redesign fan-in.",
		},
		{
			id: "external-power",
			status: "required",
			detail:
				"Specify off-board DC-rated fuse, bidirectional disconnect/reverse protection, precharge, cable ratings, and 6.8Ohm brake resistor assembly with thermal fuse and energy rating.",
		},
		{
			id: "purchase-bom",
			status: "required",
			detail:
				"Generic resistors, MLCCs, ferrite, NTC, LEDs, switch, and test pads specify requirements but have no selected purchasing MPNs. Check MLCC DC-bias and resistor voltage/pulse ratings.",
		},
		{
			id: "thermal",
			status: "verify",
			detail:
				"Qualify semiconductor/shunt/inductor/regulator temperatures, bulk ripple/lifetime at 20kHz, gate charge and switching losses; 10A RMS is an assumption, not a rating.",
		},
		{
			id: "control",
			status: "verify",
			detail:
				"Verify MCU alternate functions, two-ADC sampling windows, CAN oscillator error and watchdog. Firmware wake/reset/arm/bootstrap sequence is mandatory; firmware is not supplied.",
		},
		{
			id: "supplies",
			status: "verify",
			detail:
				"Validate LM5164 frequency, ripple injection, current limit, UVLO hysteresis and effective capacitance; measure 3V3/3V3_A sequencing and LDO heat.",
		},
		{
			id: "brake",
			status: "verify",
			detail:
				"Compute worst-case brake/OV thresholds, propagation and energy headroom. Control temperature independently of firmware where required; chopper is unavailable without its supplies.",
		},
	];
	return c;
}
