import React from "react";
import { definePart, renderFootprintDeclarations } from "@react-pcb/core";
import { LQFP48Footprint } from "../../footprints/LQFP48.tsx";

const footprint = await renderFootprintDeclarations(
	React.createElement(LQFP48Footprint),
);
// ST DS13560 Rev 6, Fig.5, GP version (no N suffix). All 48 lands are present.
// Keep native pin names: timer/ADC functions belong to pins, not invented leads.
export const Controller = definePart(
	{
		key: "esc:stm32g0b1cbt6",
		manufacturer: "STMicroelectronics",
		mpn: "STM32G0B1CBT6",
		package: "LQFP48 7x7 mm",
		datasheet: {
			url: "https://www.st.com/resource/en/datasheet/stm32g0b1cb.pdf",
			document: "DS13560",
			revision: "6",
			page: 38,
		},
		pinoutCoverage: "partial",
		pins: {
			"VDD/VDDA": { electricalType: "power-input", required: true },
			"VSS/VSSA": { electricalType: "power-input", required: true },
			VSS: { electricalType: "power-input", required: true },
			VDDIO2: { electricalType: "power-input", required: true },
			VBAT: { electricalType: "power-input", required: true },
			"VREF+": { electricalType: "power-input", required: true },
			PA8: {
				electricalType: "output",
				required: true,
				functions: ["TIM1_CH1, AF2"],
			},
			PB13: {
				electricalType: "output",
				required: true,
				functions: ["TIM1_CH1N, AF2"],
			},
			PA0: { electricalType: "input", functions: ["ADC_IN0"] },
			PA1: { electricalType: "input", functions: ["ADC_IN1"] },
			PA2: { electricalType: "input", functions: ["ADC_IN2"] },
		},
	},
	{
		footprint,
		pinMap: {
			"VDD/VDDA": "6",
			"VSS/VSSA": "7",
			VSS: "30",
			VDDIO2: "31",
			VBAT: "4",
			"VREF+": "5",
			PA8: "28",
			PB13: "25",
			PA0: "11",
			PA1: "12",
			PA2: "13",
		},
	},
);
