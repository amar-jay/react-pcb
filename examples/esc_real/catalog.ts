import { device } from "./model.ts";

const st = (name: string) =>
	`https://www.st.com/resource/en/datasheet/${name}.pdf`;
const ti = (name: string) => `https://www.ti.com/lit/ds/symlink/${name}.pdf`;

// Native pin names and package-specific pin numbers; no generic gate-driver aliases.
export const driver = device(
	"st:STDRIVE101TR",
	"STMicroelectronics",
	"STDRIVE101TR",
	"VFQFPN-24-4x4-P0.5-EP",
	st("stdrive101"),
	{
		CP: ["1", "input"],
		"DT/MODE": ["2", "input"],
		SCREF: ["3", "input"],
		VS: ["4", "power-input"],
		REG12: ["5", "power-output"],
		nFAULT: ["6", "output"],
		IN1: ["7", "input"],
		IN2: ["8", "input"],
		IN3: ["9", "input"],
		EN1: ["10", "input"],
		EN2: ["11", "input"],
		EN3: ["12", "input"],
		BOOT3: ["13", "power-input"],
		GHS3: ["14", "output"],
		OUT3: ["15", "passive"],
		GLS3: ["16", "output"],
		BOOT2: ["17", "power-input"],
		GHS2: ["18", "output"],
		OUT2: ["19", "passive"],
		GLS2: ["20", "output"],
		BOOT1: ["21", "power-input"],
		GHS1: ["22", "output"],
		OUT1: ["23", "passive"],
		GLS1: ["24", "output"],
		GND: ["EP", "power-input"],
	},
);
export const fet = device(
	"onsemi:UF3C065040K4S",
	"onsemi",
	"UF3C065040K4S",
	"TO-247-4",
	"https://www.onsemi.com/download/data-sheet/pdf/uf3c065040k4s-d.pdf",
	{
		D: ["1", "passive"],
		S: ["2", "passive"],
		KS: ["3", "passive"],
		G: ["4", "input"],
	},
);
// WSK pads have semantic local IDs because the drawing labels current/sense terminals.
export const shunt = device(
	"vishay:WSK25122L000FEA",
	"Vishay",
	"WSK25122L000FEA",
	"WSK2512-2mR-Kelvin",
	"https://www.vishay.com/docs/30108/wsk2512.pdf",
	{
		I1: ["I1", "passive"],
		I2: ["I2", "passive"],
		E1: ["E1", "passive"],
		E2: ["E2", "passive"],
	},
	"2mOhm 1% 1W",
);
// D/SOIC and PW/TSSOP INA240 pinouts DIFFER. This is the D package.
export const currentAmp = device(
	"ti:INA240A1D",
	"Texas Instruments",
	"INA240A1D",
	"SOIC-8-P1.27",
	ti("ina240"),
	{
		"IN-": ["1", "input"],
		GND: ["2", "power-input"],
		REF2: ["3", "input"],
		NC: ["4", "passive"],
		OUT: ["5", "output"],
		VS: ["6", "power-input"],
		REF1: ["7", "input"],
		"IN+": ["8", "input"],
	},
);
export const comparator = device(
	"ti:TLV3202AID",
	"Texas Instruments",
	"TLV3202AID",
	"SOIC-8-P1.27",
	ti("tlv3202"),
	{
		OUT1: ["1", "output"],
		"IN1-": ["2", "input"],
		"IN1+": ["3", "input"],
		GND: ["4", "power-input"],
		"IN2+": ["5", "input"],
		"IN2-": ["6", "input"],
		OUT2: ["7", "output"],
		VCC: ["8", "power-input"],
	},
);
export const buck = device(
	"ti:LM5164DDAR",
	"Texas Instruments",
	"LM5164DDAR",
	"HSOIC-8-P1.27-EP",
	ti("lm5164"),
	{
		GND: ["1", "power-input"],
		VIN: ["2", "power-input"],
		EN: ["3", "input"],
		RON: ["4", "input"],
		FB: ["5", "input"],
		PGOOD: ["6", "output"],
		BST: ["7", "power-input"],
		SW: ["8", "passive"],
		EP: ["EP", "power-input"],
	},
);
export const ldo = device(
	"ti:TPS7A2033PDBVR",
	"Texas Instruments",
	"TPS7A2033PDBVR",
	"SOT-23-5",
	ti("tps7a20"),
	{
		IN: ["1", "power-input"],
		GND: ["2", "power-input"],
		EN: ["3", "input"],
		NC: ["4", "passive"],
		OUT: ["5", "power-output"],
	},
);
export const can = device(
	"ti:TCAN332DR",
	"Texas Instruments",
	"TCAN332DR",
	"SOIC-8-P1.27",
	ti("tcan332"),
	{
		TXD: ["1", "input"],
		GND: ["2", "power-input"],
		VCC: ["3", "power-input"],
		RXD: ["4", "output"],
		NC5: ["5", "passive"],
		CANL: ["6", "bidirectional"],
		CANH: ["7", "bidirectional"],
		NC8: ["8", "passive"],
	},
);
export const latch = device(
	"ti:SN74LVC1G74DCTR",
	"Texas Instruments",
	"SN74LVC1G74DCTR",
	"SSOP-8-DCT-P0.65",
	ti("sn74lvc1g74"),
	{
		CLK: ["1", "input"],
		D: ["2", "input"],
		nQ: ["3", "output"],
		GND: ["4", "power-input"],
		Q: ["5", "output"],
		nCLR: ["6", "input"],
		nPRE: ["7", "input"],
		VCC: ["8", "power-input"],
	},
);
export const enableBuffer = device(
	"ti:SN74LVC244APWR",
	"Texas Instruments",
	"SN74LVC244APWR",
	"TSSOP-20-P0.65",
	ti("sn74lvc244a"),
	{
		nOE1: ["1", "input"],
		A1: ["2", "input"],
		Y8: ["3", "output"],
		A2: ["4", "input"],
		Y7: ["5", "output"],
		A3: ["6", "input"],
		Y6: ["7", "output"],
		A4: ["8", "input"],
		Y5: ["9", "output"],
		GND: ["10", "power-input"],
		A5: ["11", "input"],
		Y4: ["12", "output"],
		A6: ["13", "input"],
		Y3: ["14", "output"],
		A7: ["15", "input"],
		Y2: ["16", "output"],
		A8: ["17", "input"],
		Y1: ["18", "output"],
		nOE2: ["19", "input"],
		VCC: ["20", "power-input"],
	},
);
export const supervisor = device(
	"ti:TPS3808G33DBVR",
	"Texas Instruments",
	"TPS3808G33DBVR",
	"SOT-23-6",
	ti("tps3808"),
	{
		nRESET: ["1", "output"],
		GND: ["2", "power-input"],
		nMR: ["3", "input"],
		CT: ["4", "input"],
		SENSE: ["5", "input"],
		VDD: ["6", "power-input"],
	},
);
export const brakeDriver = device(
	"ti:UCC27511DBVR",
	"Texas Instruments",
	"UCC27511DBVR",
	"SOT-23-6",
	ti("ucc27511"),
	{
		OUTH: ["1", "output"],
		VDD: ["2", "power-input"],
		OUTL: ["3", "output"],
		GND: ["4", "power-input"],
		"IN-": ["5", "input"],
		"IN+": ["6", "input"],
	},
);

export const mcuPads = [
	"VBAT",
	"PC13",
	"PC14",
	"PC15",
	"PF0",
	"PF1",
	"PG10-NRST",
	"PA0",
	"PA1",
	"PA2",
	"PA3",
	"PA4",
	"PA5",
	"PA6",
	"PA7",
	"PB0",
	"PB1",
	"PB2",
	"VSSA",
	"VREF+",
	"VDDA",
	"PB10",
	"VSS23",
	"VDD24",
	"PB11",
	"PB12",
	"PB13",
	"PB14",
	"PB15",
	"PA8",
	"PA9",
	"PA10",
	"PA11",
	"PA12",
	"VSS35",
	"VDD36",
	"PA13",
	"PA14",
	"PA15",
	"PB3",
	"PB4",
	"PB5",
	"PB6",
	"PB7",
	"PB8-BOOT0",
	"PB9",
	"VSS47",
	"VDD48",
] as const;
export const mcu = device(
	"st:STM32G431CBT6",
	"STMicroelectronics",
	"STM32G431CBT6",
	"LQFP-48-7x7-P0.5",
	st("stm32g431cb"),
	Object.fromEntries(
		mcuPads.map((name, index) => [
			name,
			[
				String(index + 1),
				/^(VDD|VSS|VBAT|VDDA|VSSA|VREF)/.test(name)
					? "power-input"
					: "bidirectional",
			],
		]),
	),
);

export const bulk = device(
	"panasonic:EEUFC2A221",
	"Panasonic",
	"EEUFC2A221",
	"Radial-D16-P7.5-H25",
	"https://industrial.panasonic.com/ww/products/pt/aluminum-cap-lead/models/EEUFC2A221",
	{ "+": ["1", "passive"], "-": ["2", "passive"] },
	"220uF 100V",
);
export const schottky = device(
	"nexperia:BAS70,215",
	"Nexperia",
	"BAS70,215",
	"SOT-23",
	"https://assets.nexperia.com/documents/data-sheet/BAS70.pdf",
	{ A: ["1", "passive"], NC: ["2", "passive"], K: ["3", "passive"] },
);
export const gateDischargeDiode = device(
	"esc-real:requirement:gate-discharge-diode",
	undefined,
	undefined,
	"SOD-123",
	undefined,
	{ A: ["1", "passive"], K: ["2", "passive"] },
	"Fast diode >=25V; repetitive gate-discharge pulse >=0.6A; MPN and polarity drawing pending",
);
export const terminal = device(
	"phoenix:1714971",
	"Phoenix Contact",
	"1714971",
	"MKDS-5-2-P9.52",
	"https://www.phoenixcontact.com/en-nl/products/pcb-terminal-block-mkds-5-2-95-1714971",
	{ "1": ["1", "passive"], "2": ["2", "passive"] },
);

/** Generic requirements deliberately have no invented manufacturer or MPN. */
export function passive(
	kind: "R" | "C" | "L" | "FB" | "NTC" | "SW" | "LED",
	value: string,
	packageName = "0603",
) {
	return device(
		`esc-real:requirement:${kind}:${packageName}:${value}`,
		undefined,
		undefined,
		packageName,
		undefined,
		{ "1": ["1", "passive"], "2": ["2", "passive"] },
		`${kind} ${value}`,
	);
}
export function header(
	mpn: string,
	size: number,
	packageName: string,
	manufacturer = "JST",
) {
	return device(
		`${manufacturer}:${mpn}`,
		manufacturer,
		mpn,
		packageName,
		manufacturer === "JST"
			? "https://www.jst-mfg.com/product/pdf/eng/eXH.pdf"
			: "https://www.samtec.com/products/ftsh",
		Object.fromEntries(
			Array.from({ length: size }, (_, i) => [
				String(i + 1),
				[String(i + 1), "passive"],
			]).filter(([number]) => !(mpn.includes("-007-") && number === "7")),
		),
	);
}
