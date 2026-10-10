# Package pin review and MCU allocation

This record accompanies the provisional circuit. Terminal numbering was checked
against the linked manufacturers' pin tables/drawings. Physical lands and bindings are recorded in
[footprints/SOURCES.md](footprints/SOURCES.md), including fallback qualification gaps.
Generated `generated/pinout.md` gives
every component terminal and its actual circuit connection.

| Device / exact package | Pin evidence | Details that matter |
| --- | --- | --- |
| STDRIVE101TR, VFQFPN24 | [ST datasheet, pin table](https://www.st.com/resource/en/datasheet/stdrive101.pdf) | VS 4; REG12 5; nFAULT 6; IN1–3 7–9; EN1–3 10–12; channel 3 BOOT/GHS/OUT/GLS 13–16, channel 2 17–20, channel 1 21–24; exposed pad is GND |
| UF3C065040K4S, TO247-4 | [onsemi datasheet, package drawing](https://www.onsemi.com/download/data-sheet/pdf/uf3c065040k4s-d.pdf) | D 1, power source 2, Kelvin source 3, gate 4; metal tab is live drain; SiC cascode |
| INA240A1D, SOIC8 | [TI INA240, D package diagram](https://www.ti.com/lit/ds/symlink/ina240.pdf) | IN− 1, GND 2, REF2 3, NC 4, OUT 5, VS 6, REF1 7, IN+ 8. TSSOP pinout differs |
| TLV3202AID, SOIC8 | [TI TLV3202, D diagram](https://www.ti.com/lit/ds/symlink/tlv3202.pdf) | OUT1 1, IN1− 2, IN1+ 3, GND 4, IN2+ 5, IN2− 6, OUT2 7, VCC 8 |
| LM5164DDAR, HSOIC8 | [TI LM5164, DDA diagram and application](https://www.ti.com/lit/ds/symlink/lm5164.pdf) | GND 1, VIN 2, EN 3, RON 4, FB 5, PGOOD 6, BST 7, SW 8, EP GND. RON resistor goes to ground |
| TPS7A2033PDBVR, SOT23-5 | [TI TPS7A20, DBV diagram](https://www.ti.com/lit/ds/symlink/tps7a20.pdf) | IN 1, GND 2, EN 3, NC 4, OUT 5 |
| SN74LVC1G74DCTR, DCT SSOP | [TI latch, DCT top view, p.4](https://www.ti.com/lit/ds/symlink/sn74lvc1g74.pdf) | CLK 1, D 2, **inverted Q 3**, GND 4, **Q 5**, clear-low 6, preset-low 7, VCC 8. Diagram was visually checked: PDF text extraction loses the inversion bar |
| SN74LVC244APWR, TSSOP20 | [TI buffer, PW top view](https://www.ti.com/lit/ds/symlink/sn74lvc244a.pdf) | OE1-low 1; A1/A2/A3 2/4/6 → Y1/Y2/Y3 18/16/14. Unused bank OE2-low 19 is held high; all unused inputs grounded |
| TPS3808G33DBVR, SOT23-6 | [TI supervisor, DBV diagram](https://www.ti.com/lit/ds/symlink/tps3808.pdf) | RESET-low 1, GND 2, MR-low 3, CT 4, SENSE 5, VDD 6 |
| UCC27511DBVR, SOT23-6 | [TI brake driver, DBV diagram](https://www.ti.com/lit/ds/symlink/ucc27511.pdf) | OUTH 1, VDD 2, OUTL 3, GND 4, IN− 5, IN+ 6; IN− grounded |
| TCAN332DR, SOIC8 | [TI TCAN33x, D diagram](https://www.ti.com/lit/ds/symlink/tcan332.pdf) | TXD 1, GND 2, VCC 3, RXD 4, NC 5, CANL 6, CANH 7, NC 8; classic CAN, not CAN-FD |
| BAS70,215, SOT23 | [Nexperia BAS70, p.1](https://assets.nexperia.com/documents/data-sheet/BAS70.pdf) | Anode 1, NC 2, cathode 3. Not suitable as the proposed high-current gate-discharge diode; that optional branch has an unselected diode requirement |
| WSK25122L000FEA | [Vishay WSK2512 drawing](https://www.vishay.com/docs/30108/wsk2512.pdf) | Logical I1/I2/E1/E2 bind to physical 1/4/2/3; the source record identifies the current/sense geometry and fallback width discrepancy. E1/E2 are same-net Kelvin pickups, not isolated floating circuit nodes |

The manufacturer's complete pin definitions are retained even when pins are NC.
NC reasons live in the source assembly model and review report because current
canonical PCB IR does not have a deliberate-no-connect field. Compiler warnings
for these pins are retained rather than silently suppressed.

## STM32G431CBT6, LQFP48

Package numbering follows [ST DS12589, Table 12](https://www.st.com/resource/en/datasheet/stm32g431cb.pdf).
Pins 23/24 are VSS/VDD and pin 25 is PB11; pin assignments from other STM32 parts
must not be substituted. The circuit accounts for all 48 pins.

| Circuit function | MCU pin(s) / package terminals | Peripheral plan |
| --- | --- | --- |
| Three current ADCs | PA0 8, PA1 9, PA2 10 | ADC1 IN1/IN2/IN3; PA0/PA1 also ADC2 IN1/IN2. Only two ADC units: all three cannot convert simultaneously |
| Phase voltage ADCs | PA3 11, PA4 12, PA5 13 | ADC1 IN4, ADC2 IN17, ADC2 IN13 |
| Bus voltage ADC | PA6 14 | ADC2 IN3 |
| Power / brake / motor temperature | PB0 16, PB1 17, PB2 18 | ADC1 IN15, ADC1 IN12, ADC2 IN12 |
| Three PWM IN signals | PA8 30, PA9 31, PA10 32 | TIM1 CH1/2/3; confirm AF6 configuration before firmware |
| Three phase enable requests | PB13 27, PB14 28, PB15 29 | GPIO through latch-controlled buffer; not timer complementary outputs in this design |
| Arm / disarm | PC13 2, PB4 41 | GPIO; disarm held low externally during reset |
| Fault latch / driver diagnostic | PB12 26, PB5 42 | TIM1 break candidate / GPIO diagnostic; AF6 and timer break polarity require firmware validation |
| CAN RX / TX | PA11 33, PA12 34 | FDCAN1 peripheral using classic CAN only; AF9 candidate |
| UART TX / RX | PB6 43, PB7 44 | USART1; AF7 candidate |
| Hall U / V / W | PB9 46, PB10 22, PB11 25 | GPIO/interrupt decoding; motor speed budget required |
| Command / status | PA7 15, PA15 39 | GPIO command pulse input / status LED |
| Debug | PA13 37, PA14 38, PB3 40 | SWDIO, SWCLK, optional SWO |
| Reset / boot | PG10-NRST 7, PB8-BOOT0 45 | Supervisor reset; BOOT0 pulldown and explicit option-byte plan |
| Digital supplies | VBAT 1, VDD 24/36/48, VSS 23/35/47 | VBAT and VDD at 3.3 V, not motor bus; bypass every VDD and VBAT |
| Analog supplies | VSSA 19, VREF+ 20, VDDA 21 | Common PGND with deliberate return routing; filtered 3.3 V analog rail |
| Reserved clocks | PC14 3, PC15 4, PF0 5, PF1 6 | Explicit NC. Initial internal HSI; CAN timing accuracy must be qualified |

This allocation reserves physical terminals. It is not validated peripheral
initialization code. Final ADC trigger/acquisition timing, reconstruction of a
phase with an unavailable low-side sampling window, timer deadtime, Hall speed,
CAN bit timing and oscillator tolerance remain part of the firmware design.

## Fault and startup logic

`FAULT_CLEAR_n` is pulled up and each trip source pulls it low through an
isolation diode: six current-window outputs, emergency bus OV, STDRIVE101
nFAULT, supervisor RESET_n and MCU DISARM_n. No push-pull trip outputs share a
net. Low clears latch Q, making inverted Q high and disabling EN-buffer bank 1.
Driver EN pins have their own pulldowns after the series resistors.

On reset, MCU DISARM_n is pulled **low**; firmware must actively raise it before
arming. This keeps the inverter disabled while firmware is absent or resetting.
The asynchronous clear dominates an arm clock. Firmware must verify the clear
bus is high before generating an arm edge. The brake demand path is independent
of this latch; its supply and comparator must still be alive for braking to work.

1. Keep EN requests low and DISARM_n low. Validate logic, analog and auxiliary rails.
2. Wake STDRIVE101 via IN with EN held low; wait for driver supply/fault validity.
3. Return IN low, verify external trips are clear, then raise DISARM_n.
4. Pulse ARM_CLK and check ARMED. Charge bootstraps with a controlled low-side sequence.
5. Start synchronized PWM/ADC only after the driver and current baseline checks pass.
6. On a fault, drop enable requests. Reset driver-latched faults using its specified
   all-inputs-low standby sequence; re-arm only after determining the fault cause.

This sequence is a specification for bring-up and firmware tests. Propagation,
diode low-level margin, power sequencing, driver truth tables and startup gate
waveforms require hardware/analog verification before enabling a motor.
