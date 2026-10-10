# ESC: component selection and physical placement prototype

Research date: 2026-10-11. Status: **electrical circuit and initial physical
placement implemented; routing and engineering qualification pending**.

This starts a three-phase BLDC/PMSM controller using STDRIVE101 and the proposed
12 V compatible UF3C065040K4S SiC cascode. The cascode differs from a conventional
SiC MOSFET; the technology decision and operating assumptions below remain open.
The corrected example is in `examples/esc_real`.

## Implementation and inspection

Follow the repository [HOWTO](../../HOWTO.md). The model separates electrical
component definitions, reusable physical footprints and placed instances. It
contains **323 fitted parts, 19 DNP options and four board-owned mounting holes**.
All 346 physical instances have resolved geometry and explicit placement. DNP
lands stay on the board; assembly population is recorded separately. There are
145 fitted-circuit nets and 154 nets when the optional branches are included.

- [`circuit.ts`](circuit.ts): complete native-pin connections, passive requirements,
  DNP choices and outstanding engineering work.
- [`catalog.ts`](catalog.ts): component identities and package-specific pinouts.
- [`footprints/index.ts`](footprints/index.ts): sourced physical definitions and
  explicit pin bindings, including Kelvin lands and paired switch contacts.
- [`footprints/SOURCES.md`](footprints/SOURCES.md): document revisions/figures,
  coordinate origins, exact fallback source hashes, process choices and evidence gaps.
- [`placement.json`](placement.json): positions keyed by stable part IDs.
- [`board.tsx`](board.tsx): 180 × 160 mm initial floorplan, four-layer planning
  stack, explicit technical layers, mounting holes and local route intent.
- [`process.ts`](process.ts): selected manufacturing geometry limits.
- [`generated/bom.csv`](generated/bom.csv): complete fitted/DNP inventory and
  unselected MPNs. [`PIN_REVIEW.md`](PIN_REVIEW.md) records pin and MCU allocation.

Run from the repository root:

```sh
bun run examples/esc_real/export.tsx
bun run preview inspect examples/esc_real/board.tsx --out dist/esc-real/inspect
bun run preview png examples/esc_real/board.tsx --view both --layers all --theme light --width 4096 --out dist/esc-real/review.png
bun run preview png examples/esc_real/board.tsx --view analysis --layers fabrication --theme light --width 4096 --out dist/esc-real/fabrication.png
bun run preview png examples/esc_real/board.tsx --view analysis --layers copper --theme light --width 4096 --out dist/esc-real/copper.png
bun test examples/esc_real/esc-real.test.tsx
```

Open [`dist/esc-real/inspect/index.html`](../../dist/esc-real/inspect/index.html)
for the standard inspection bundle. Its manifest resolves stable footprint
keys to per-footprint SVGs, physical JSON and manufacturing reports. Board
views: [analysis](../../dist/esc-real/review.analysis.png),
[board](../../dist/esc-real/review.board.png),
[fabrication](../../dist/esc-real/fabrication.png),
[copper](../../dist/esc-real/copper.png). Preview references are visual overlays;
they are not automatically authored manufacturing silkscreen text.

The selected footprint and board geometry checks pass. That establishes
checked pad spacing, drills/annuli, mask webs, paste containment, courtyard
containment and inter-part clearance. The report deliberately retains
`complete: false`, skipped coverage and warnings. A global minimum mask
expansion is not selected because TI DDA specifies a solder-mask-defined EP;
independent tests check that exception and the ordinary NSMD openings.

**This remains a placement prototype, not fabrication-ready hardware.** The
floorplan is an initial block placement using actual courtyards, not a
qualified gate-loop layout. Routing, current-carrying copper, planes and thermal
vias are unfinished. The current compiler preserves route intent but does not
produce realized traces/fills or Gerbers. Gate clamps, connector/bus protection,
exact unselected passive/protection MPNs, input/precharge/brake assemblies,
heatsink mechanics and firmware remain explicit release work. The WSK2512
fallback's sense-land width differs from Vishay's current recommendation;
reconcile it before release, as recorded in the source table.

Compiler warnings are retained for deliberate NC terminals, disconnected
routing-intent groups and unavailable route realization. There are no unresolved
footprint diagnostics. Successful compilation does not qualify operating ratings
or close the outstanding electrical/mechanical work.

## 1. Requirements and provisional operating point

The motor, battery, load inertia, cooling, and enclosure have not been specified.
The following assumptions allow useful first-pass calculations; they are not
user-approved ratings or demonstrated performance.

| Parameter | Working assumption / decision |
| --- | --- |
| DC source | Nominal 48 V; illustrative 13-series Li-ion pack, 54.6 V fully charged |
| Normal operating window | 40–54.6 V; battery undervoltage cutoff must follow the actual pack/BMS |
| Phase current | 10 A RMS continuous; 25 A instantaneous peak for at most 10 ms, subject to thermal/pulse verification |
| Hardware phase-current trip | Approximately ±30 A; this is a fault threshold, not an operating rating |
| PWM | 20 kHz initial target |
| Control | Three-phase FOC with synchronized ADC sampling; Hall-assisted startup initially |
| Gate driver | STDRIVE101TR, fixed starting requirement |
| SiC interpretation | Conventional SiC MOSFET evaluated; a 12 V compatible SiC **cascode** proposed separately below |
| Cooling | Heatsink with insulated mounting; forced air may be necessary |
| Interfaces | SWD, UART, classic CAN, Hall/temperature connector, command input |
| Braking | Regeneration into a receptive source; independent brake chopper for a non-receptive source |
| Isolation | Common-ground low-voltage controller; external equipment must suit this grounding arrangement |

Before fixing the purchase BOM, specify maximum charged voltage, DC input
current, phase RMS/peak current and duration, motor pole pairs/Kv/R/L, speed,
braking duty, ambient temperature, cooling, board envelope, and command protocol.
DC input current and phase current must have separate limits.

## 2. Resolve STDRIVE101 versus SiC before selecting footprints

STDRIVE101 operates from 5.5–75 V and contains a nominal 12 V regulator, three
600 mA typical gate-driver channels, bootstrap diodes, and protection circuitry.
Its VS supply must remain at least as high as the power-stage bus. The exposed
pad is its ground connection. [S1, recommended conditions and §§4–5]

The evaluated conventional SiC MOSFET, **ST SCT040H65G3-7**, has on-resistance
specified at 15 V and 18 V gate bias, not 12 V. Its 650 V drain rating does not
raise this ESC's driver voltage limit. Feeding 18 V into REG12 is not a
datasheet-supported solution; the external-supply configuration ties VS and
REG12 and cannot serve a 48 V bus. **Do not release this pairing based on the
headline 40 mΩ figure.** [S1, Fig. 12; S2, electrical tables]

A candidate retaining STDRIVE101 is **onsemi UF3C065040K4S**: a normally-off,
650 V SiC JFET/silicon-MOSFET cascode, TO-247-4, with a Kelvin-source connection.
It specifies 42 mΩ typical / 52 mΩ maximum at 12 V and 25 °C, 59 mΩ typical at
125 °C, and 43 nC typical gate charge under its stated test conditions. [S3]

**Technology decision still required:** a cascode is not a conventional SiC
MOSFET. It is the proposed compatibility route, not a silent replacement of the
request. If a conventional SiC MOSFET is mandatory, reopen the gate-driver and
gate-supply architecture. If the eventual objective is an efficient 48 V ESC,
also compare suitable low-resistance 100 V silicon MOSFETs; SiC is not inherently
an efficiency improvement at this voltage.

For the cascode proposal, use six devices, one per switch. Check the actual
minimum high-side VGS after regulator tolerance, bootstrap diode drop, output
drop, and bootstrap discharge. The 12 V on-resistance specification does not
guarantee the same resistance at that lower voltage. Switching-energy tables
also use conditions different from this 48 V, unipolar-drive design.

## 3. Circuit architecture and current paths

```text
Battery / DC source
  -> DC-rated fuse -> precharge + bidirectional main connection -> DC_LINK+
                                                             |
                           +---------------------------------+-------------+
                           |                                 |             |
                  Bulk + local bypass                5 V buck       12 V buck
                           |                                 |             |
                Three half-bridges                    3.3 V LDO     Brake driver
                           |                                 |             |
                    U / V / W motor                   MCU, analog    Brake FET
                           |                          and fault logic      |
                  Three low-side shunts                            External R
                           |                                             |
                    DC_LINK- / PGND <------------------------------------+

Shunt Kelvin pairs -> 3 current amplifiers -> ADC + 3 window comparators
Driver fault + window trips + bus overvoltage + reset -> fault latch
Fault latch -> disable all three phase-enable lines + MCU timer break
Independent bus comparator -> brake driver, even when inverter is disabled
```

For each phase X:

- High-side drain goes to DC_LINK+; its source joins the low-side drain at PH_X.
- Low-side power source goes to LS_X, then through its own shunt to PGND.
- OUTx takes its reference from the high-side source at the switch junction.
- The gate/pulldown/clamp return goes to that device's Kelvin-source terminal.
  The low-side driver's common return remains PGND, so shunt drop is part of
  the low-side gate-voltage budget. KS and power-source copper must not be
  casually shorted together away from the device.
- Shunt sense terminals go only to their amplifier's differential input network.
  The driver return, MCU return, and capacitor currents do not pass through
  the sense terminals.

This three-shunt arrangement measures low-side conduction intervals. It does
not provide continuous inline phase measurements. Firmware must select valid
sampling windows, handle narrow pulses, and reconstruct unavailable samples.

## 4. Proposed main components

**Selected** identifies an exact part for schematic development, not a released
or stocked purchase item. **Candidate** needs the stated technical decision.
**Open** means a real requirement remains, rather than a fabricated MPN.

| Ref / quantity | Component | Selection and purpose | Status / remaining work |
| --- | --- | --- | --- |
| U_DRV ×1 | ST STDRIVE101TR | Three-phase gate driver, VFQFPN24 4 × 4 mm [S1] | Selected; complete package binding and thermal analysis |
| Q_UH/Q_UL/Q_VH/Q_VL/Q_WH/Q_WL ×6 | onsemi UF3C065040K4S | SiC cascode, TO-247-4 [S3] | Candidate; technology decision and minimum VGS validation |
| R_SH_U/V/W ×3 | Vishay WSK25122L000FEA | 2 mΩ, 1%, four-terminal, 1 W shunts [S4] | Selected for provisional current; verify pulse capability and derating |
| U_IU/IV/IW ×3 | TI INA240A1D | 20 V/V current amplifiers, SOIC8 [S5] | Selected; powered from analog 3.3 V, midpoint reference arrangement below |
| U_OC_U/V/W ×3 | TI TLV3202AID | Two comparators per phase for positive/negative current trips [S6] | Selected; threshold/hysteresis/error budget to verify |
| U_MCU ×1 | ST STM32G431CBT6 | LQFP48 motor-control MCU, ADCs, timer, FDCAN peripheral [S7] | Selected; pin/alternate-function allocation must be checked before routing |
| U_BUCK5 ×1 | TI LM5164DDAR | High-voltage synchronous buck, 5 V logic/sensor rail [S8] | Selected; proposed network below requires validation |
| U_BUCK12 ×1 | TI LM5164DDAR | Independent 12 V brake-driver rail [S8] | Selected; independent of STDRIVE101 standby |
| U_LDO ×1 | TI TPS7A2033PDBVR | 5 V to 3.3 V, SOT23-5 [S9] | Selected; total current and thermal budget below |
| U_CAN ×1 | TI TCAN332DR | 3.3 V classic CAN, SOIC8 [S10] | Selected; use classic CAN at ≤1 Mbit/s; do not assume CAN FD data-rate support |
| U_LATCH ×1 | TI SN74LVC1G74DCTR | D flip-flop with asynchronous clear, fault/arming latch [S11] | Selected; verify complete power-up truth table |
| U_ENABLE ×1 | TI SN74LVC244APWR | TSSOP20 buffer; three protected phase enables [S12] | Selected; unused inputs tied to defined levels |
| U_RESET ×1 | TI TPS3808G33DBVR | Supply supervisor, nominal 3.07 V threshold [S13] | Selected; reset delay and manual-reset wiring |
| U_BUS ×1 | TI TLV3202AID | Independent brake demand + emergency bus-overvoltage comparator | Selected; hysteresis and delay remain design work |
| U_BRAKE ×1 | TI UCC27511DBVR | Independent low-side brake gate driver [S14] | Selected; split-output network below |
| Q_BRAKE ×1 | onsemi UF3C065040K4S | Brake-chopper switch | Candidate with the same technology caveat |
| C_BULK1…6 ×6 | Panasonic EEUFC2A221 | 220 µF / 100 V radial electrolytics [S15] | Candidate bank: 1320 µF nominal; ripple/lifetime review required |
| J_DC ×1 | Phoenix Contact 1714971, MKDS 5/2-9,5 | Two-pole screw terminal, 9.52 mm pitch [S16] | Selected; 32 A catalog rating is not the PCB's rating |
| J_U/J_V/J_W ×3 | Phoenix Contact 1714971 | Each two-pole block uses one phase contact; second contact left NC and marked | Selected; deliberately uses one verified connector variant |
| J_BRAKE ×1 | Phoenix Contact 1714971 | DC_LINK+ and switched brake-resistor return | Selected; external wiring must be insulated and strain-relieved |
| J_SWD ×1 | Samtec FTSH-105-01-L-DV-007-K | 2 × 5, 1.27 mm keyed debug header [S17] | Candidate; -007 omits pin 7, -K is the mating key feature; fit review pending |
| J_HALL ×1 | JST B6B-XH-A, XH series | Six-pin sensor header [S18] | Selected; match housing XHP-6 and wire-appropriate crimp contacts |
| J_CMD/J_CAN ×2 | JST B3B-XH-A, XH series | Three-pin command/CAN headers [S18] | Selected; mating XHP-3 housings and crimp contacts |
| J_UART ×1 | JST B4B-XH-A, XH series | Four-pin service UART header [S18] | Selected; mating XHP-4 housing and crimp contacts |
| TH_PWR/TH_BRAKE ×2 | 10 kΩ NTC, B ≈3435 K | Power-stage and brake-resistor temperature | Open exact MPN; tolerance, insulation and mounting depend on mechanics |
| F_MAIN + holder | DC-rated fuse | Coordinate source fault current, wire, connector and semiconductor limits | Open: DC current / interruption capability not supplied |
| R_PRE + bypass device | Precharge resistor + DC-rated bidirectional contactor/switch | Limit input-capacitor charging; permit intended regeneration | Open: energy, sequencing and source fault conditions |
| R_BRAKE + thermal cutoff | External 6.8 Ω provisional power resistor | Initial brake-chopper sizing | Open: pulse energy, average power and heatsink must follow load inertia |
| HS1 + insulating pads/bushings | Heatsink assembly for six switches | Insulate live drain tabs from a common heatsink | Open mechanical part numbers; thermal target below |

## 5. Resistor and capacitor inventory

These are **proposed circuit values**, unless explicitly identified as a
manufacturer reference value. Each group gets distinct reference IDs in the
schematic. General signal resistors: 0603, 1%, at least 0.1 W; threshold/divider
ratios: 0.1% where specified. Gate resistors: pulse-rated 0805, initially 0.25 W.
Choose exact orderable resistor/MLCC MPNs after checking vendor voltage, pulse,
DC-bias and temperature data; a value/package designation is not a purchase BOM.

### 5.1 Inverter and STDRIVE101 support

| Group / quantity | Proposed value / rating | Connection / purpose |
| --- | --- | --- |
| R_GON ×6 | 15 Ω, pulse-rated 0805 | Driver output to each gate; initial conservative slew setting |
| R_GOFF + D_GOFF ×6 each | 4.7 Ω + fast small-signal diode | Optional parallel turn-off branch; diode anode at gate, cathode toward driver through resistor; DNP initially |
| R_GS ×6 | 10 kΩ, 0603 | Gate to its own KS; physical pulldown at every switch |
| D_GCLAMP ×6 | Clamp network, exact part open | Gate-to-KS transient reservation; account for tolerance, dynamic clamp, capacitance and negative excursion |
| C_BOOT_U/V/W ×3 | 1 µF / 25 V X7R, 0805 | BOOTx to OUTx; effective-capacitance target ≥0.47 µF |
| C_REG ×1 + C_REG_HF ×1 | 10 µF / 25 V X7R + 100 nF / 25 V | REG12 to driver PGND; effective bulk target ≥4.7 µF |
| C_VS ×1 + C_VS_HF ×1 | 1 µF / 100 V X7R + 100 nF / 100 V | VS to driver PGND, directly at supply pins |
| R_MODE ×1 | 100 kΩ | EN/IN mode; deadtime must be checked against turn-off waveforms |
| R_IN_SER ×3 | 100 Ω | Three PWM input lines from MCU to INx |
| R_IN_PD ×3 | 10 kΩ | Defined INx state during reset |
| R_EN_SER ×3 + R_EN_PD ×3 | 100 Ω + 10 kΩ | Buffer outputs to ENx; ENx low when buffer is disabled |
| R_DRV_FAULT ×1 | 10 kΩ | Driver nFAULT pullup to 3.3 V; isolated by D_DRIVER into latch-clear bus |
| R_SCREF_TOP/BOT ×2 total | 4.32 kΩ / 10 kΩ, 0.1% | Initial SCREF ≈2.29 V including typical internal loading; verify hot-device fault/operating margins |
| C_SCREF ×1 | 10 nF / 25 V | Reference noise filtering |
| R_CP ×1 + C_CP ×1 | 1 kΩ + 100 pF | CP conditioning; planned clamp to PGND when unused; optional external fault injection through alternate assembly link |
| C_LINK_U/V/W ×6 total | Two 1 µF / 100 V X7R per leg, 1210 or larger | DC_LINK+ to PGND immediately beside each commutation loop |
| C_LINK_HF_U/V/W ×3 | 100 nF / 100 V X7R | One per leg, same local bus bypass path |
| R_SNUB/C_SNUB ×3 each | DNP: 10 Ω pulse resistor + 1 nF / 100 V C0G initial experiment | Series RC from each phase to PGND; select only from measured ringing |
| R_BLEED ×2 | 22 kΩ / 0.25 W, ≥100 V working rating each | Series pair across bus; slow discharge, not instantaneous safe discharge |

External bootstrap diodes are not populated by default. If recharge measurements
justify them, reserve three diode/resistor branches with reverse rating and surge
capability checked against the actual bus. [S1, bootstrap section]

### 5.2 Current measurement and hardware trip network

| Group / quantity | Proposed value / rating | Connection / purpose |
| --- | --- | --- |
| R_ISENSE ×6 | 10 Ω, matched pairs | Each shunt Kelvin terminal to its INA240 input |
| C_ISENSE_DIFF ×3 | 1 nF C0G | Across amplifier inputs after the two series resistors |
| C_IA_BYPASS ×3 | 100 nF / 16 V X7R | One at each amplifier supply |
| R_IADC ×3 + C_IADC ×3 | 100 Ω + 1 nF C0G | Amplifier output to ADC; comparators tap before this RC |
| R_TRIP_HI ×2 | 1.58 kΩ / 10 kΩ, 0.1% | Shared initial upper reference ≈2.850 V from 3.3 V |
| R_TRIP_LO ×2 | 63.4 kΩ / 10 kΩ, 0.1% | Shared initial lower reference ≈0.450 V |
| C_TRIP_HI/LO ×2 | 10 nF / 16 V | Threshold bypassing |
| Comparator hysteresis | Not captured for phase trips | A latched fault cannot chatter the enables; adding feedback must not disturb the shared references |
| C_OC_BYPASS ×3 | 100 nF / 16 V | One per dual comparator |
| D_TRIP ×6 | Nexperia BAS70, SOT23 [S19] | Isolate push-pull comparator outputs onto active-low fault bus; anode at bus, cathode at output |
| R_TRIP_PULLUP ×1 | 10 kΩ | Fault-bus pullup; verify diode/VOL and latch VIL over temperature |

INA240 reference inputs use one connection to analog 3.3 V and one to ground,
giving nominal 1.65 V zero-current output without an unbuffered midpoint divider.
INA240A1 gain is 20. [S5, reference connections]

The two comparators per phase are wired so a low output means either over-positive
or over-negative current. Their diode combination must be verified electrically;
push-pull outputs cannot be directly wired together.

### 5.3 DC/DC supplies, analog supply, MCU, and fault latch

| Group / quantity | Proposed value / rating | Connection / purpose |
| --- | --- | --- |
| L_BUCK12 ×1 | Coilcraft MSS1246T-683MLB, 68 µH | TI 12 V application candidate [S8]; verify present part status and derated peak current |
| C_B12_IN ×2 | TDK CGA6N3X7R2A225K230AB, 2.2 µF / 100 V | 12 V buck local input |
| C_B12_OUT ×2 | Taiyo Yuden TMK325B7226KMHT, 22 µF / 25 V | 12 V buck output |
| R_B12_ON/TOP/BOT/RA ×4 | 100 kΩ / 453 kΩ / 49.9 kΩ / 453 kΩ | On-time, feedback and ripple injection |
| C_B12_BST/CA/CB ×3 | 2.2 nF / 50 V; 3.3 nF; 56 pF C0G | Buck bootstrap and ripple injection |
| L_BUCK5 ×1 | 68 µH, same candidate family | 5 V buck; calculate min inductance and worst-case peak current |
| C_B5_IN ×2 + C_B5_OUT ×2 | 2.2 µF / 100 V + 22 µF / 25 V | Local input/output capacitance |
| R_B5_ON/TOP/BOT/RA ×4 | 41.2 kΩ / 158 kΩ / 49.9 kΩ / 221 kΩ | Proposed 5 V, ~303 kHz design, not copied unchanged from 12 V circuit |
| C_B5_BST/CA/CB ×3 | 2.2 nF / 50 V; 3.3 nF; 220 pF C0G | Bootstrap and proposed ripple injection |
| R_BUCK_UVLO ×4 | Two 1 MΩ / 39.2 kΩ dividers, preliminary | Nominal startup ≈39.77 V at 1.5 V EN threshold; include EN current and hysteresis |
| PGOOD pins ×2 | Explicit no-connect | Logic rail has a separate TPS3808 supervisor |
| C_LDO_IN/OUT ×2 | 4.7 µF / 16 V X7R | LDO local bypass, ensure effective output capacitance satisfies stability requirements |
| R_LDO_EN ×1 | 10 kΩ | Enable bias from 5 V; do not leave floating |
| FB_ANALOG ×1 | Ferrite candidate, ≥100 mA, low DCR | 3.3 V to analog 3.3 V; verify impedance and damping |
| C_ANALOG ×2 | 1 µF + 100 nF / 16 V | Local VDDA/VREF+ supply filtering |
| C_MCU_VDD ×3 | 100 nF / 10 V | One per VDD pin 24, 36, 48; VSS pins 23, 35, 47 |
| C_MCU_BULK ×1 | 4.7 µF / 16 V | MCU supply bulk |
| R_RESET ×1 + C_RESET ×1 | 10 kΩ + 100 nF | NRST bias/filter, coordinated with supervisor and debugger |
| R_BOOT ×1 | 10 kΩ | Defined boot configuration, after pin/option-byte review |
| R_ARM_PD ×1 + R_DISARM_BIAS ×1 | 10 kΩ each to ground | Arm clock low and disarm asserted during reset; latch nPRE tied directly to 3.3 V |
| R_OE_PULLUP ×1 | 10 kΩ | Buffer disabled by default; latch complement drives enable when valid |
| C_LOGIC_BYPASS ×3 | 100 nF / 16 V | Latch, enable buffer and supervisor |
| C_RESET_DELAY ×1 | 10 nF proposed | Supervisor delay; calculate from chosen revision |
| R_RESET_MR ×1 | 10 kΩ | Manual-reset bias; pushbutton to ground |
| SW_RESET ×1 | Normally-open tactile switch | Service reset, exact mechanical MPN open |
| R_STATUS ×2 + LED_STATUS ×2 | 1 kΩ + low-current LEDs | 3.3 V power/status indicators; exact LED MPN open |

MCU VBAT is tied to logic 3.3 V, not the motor battery. Tie all package supply and
ground pins, including analog/reference pins, explicitly. Use the internal clock
for initial bring-up; reserve an optional HSE crystal, two load capacitors and
series/damping component only if the chosen CAN timing/clock budget requires it.
Calculate crystal capacitors from the selected crystal and PCB parasitics. [S7]

The latch has D high, preset inactive, and an MCU arm pulse on CLK. Any active-low
trip asynchronously clears Q. Q-complement (DCT pin 3) disables the first
output-enable bank; the unused bank is permanently disabled. Only three ENx
channels are passed through it; three PWM INx lines
remain directly driven with defined reset pulldowns. Supervisor reset and a
dedicated MCU disarm output also clear the latch. Add isolation diodes for these
sources where required so reset cannot be driven by a push-pull source.

**Startup detail:** EN/IN mode allows INx to wake the driver while ENx stays low.
This avoids a boot deadlock in which fault-gated inputs cannot wake the driver
and its startup nFAULT clears the same latch needed to enable those inputs.
Wake with enables off, wait for valid supplies/fault status, set INx low, arm,
then perform controlled bootstrap charging. Driver deadtime and ADC sampling
must be verified in this mode before implementing FOC.

### 5.4 Voltage sensing, temperature, and independent brake circuitry

| Group / quantity | Proposed value / rating | Connection / purpose |
| --- | --- | --- |
| R_VTOP ×8 + R_VBOT ×4 | Two 100 kΩ series top resistors / 10 kΩ bottom, 0.1%, 0805 | Four ADC dividers: bus and U/V/W; scale 1:21 |
| R_VADC ×4 + C_VADC ×4 | 1 kΩ + 1 nF C0G | ADC input filtering; use adequate ADC acquisition time |
| D_VADC_CLAMP ×8 | BAS70, candidate | Two clamps per ADC input to analog rails; rail injection/power-off behavior must be checked |
| R_BUS_HW_TOP ×4 + R_BUS_HW_BOT ×2 | Two independent 100 kΩ + 100 kΩ / 10 kΩ dividers, 0.1% | Separate brake and emergency-OV sensing; brake feedback cannot move the OV divider |
| C_BUS_HW ×2 | 100 pF C0G initial | Comparator noise filtering; delay budget must be measured |
| R_BRAKE_REF ×2 | 2.10 kΩ / 10 kΩ, 0.1% | Nominal reference 2.727 V; loaded divider gives 60 V turn-on |
| R_OV_REF ×2 | 1.18 kΩ / 10 kΩ, 0.1% | Emergency trip reference 2.952 V, about 62.0 V bus |
| C_BUS_REF ×2 + C_BUS_BYPASS ×1 | 10 nF reference filters + 100 nF supply bypass | Include reference filtering in trip delay |
| R_BRAKE_HYST + R_OV_HYST ×2 | 200 kΩ brake / 1 MΩ emergency OV, fitted | Brake positive feedback to its bus divider: nominal on 60 V, off 56.7 V; OV feedback to its reference |
| C_BRAKE_DRV ×2 | 1 µF + 100 nF / 25 V | Independent brake-driver 12 V bypass |
| R_BR_ON/OFF ×2 + R_BR_GS ×1 | 15 Ω / 4.7 Ω pulse-rated + 10 kΩ | Split OUTH/OUTL to brake gate; gate pulldown to KS |
| R_BR_PD ×1 | 10 kΩ | Comparator drives driver IN+ directly; IN− tied to ground |
| D_BR_CLAMP ×1 | Gate clamp, exact MPN open | Same validation as main-device clamp |
| R_NTC_BIAS ×3 + C_NTC ×3 | 10 kΩ, 1% + 100 nF | Power-stage, brake-resistor and optional external motor-temperature dividers; detect open/short sensor faults |
| D_OV_TRIP + D_RESET_TRIP + D_DISARM + D_DRIVER ×4 | BAS70,215, candidate | Anodes at latch-clear bus, cathodes at active-low sources; diode/VOL logic margin still requires qualification |

The brake branch is DC_LINK+ -> external resistor -> Q_BRAKE drain, with the
power source at PGND. Use the independent 12 V buck for U_BRAKE. Its operation
must continue when the MCU resets or STDRIVE101 enters standby. Emergency
inverter shutdown must not switch off the brake demand path.
The brake comparator drives IN+; tie IN− to the driver's local ground. Route
OUTH and OUTL through their respective resistors to the same gate. [S14]

At 60 V, a 6.8 Ω resistor draws about 8.8 A and dissipates **529 W while on**.
Select the resistor from pulse duration/repetition and mechanical cooling, not
its resistance alone. Reserve a resistor thermal cutoff and account for an open
resistor, a shorted chopper, and a supply/BMS that disconnects during braking.
The nominal 60/62 V thresholds need a complete reference-tolerance, hysteresis,
delay and overshoot budget; they are not a proven bus clamp.

For ideal 3.3 V comparator swing, the brake network has Rtop = 200 kΩ,
Rbottom = 10 kΩ and Rfeedback = 200 kΩ. With its output low, the threshold is
Vbus = Vref × (1 + Rtop/Rbottom + Rtop/Rfeedback) = 60 V. With the output high,
it falls by 3.3 V to 56.7 V. Use actual VOL/VOH, reference accuracy and resistor
tolerances for final limits. The independent OV trip is about 61.99 V when its
1 MΩ reference feedback loading is included. These are nominal calculations.

TH_MOTOR is supplied by the motor/harness if available; document its resistance
curve separately from TH_PWR and TH_BRAKE. The third divider is a provision for
that external sensor, not an assumption that every motor includes one.

### 5.5 External interface passives and protection

| Group / quantity | Proposed value / rating | Purpose |
| --- | --- | --- |
| R_HALL_PULLUP ×3 | 4.7 kΩ to 3.3 V | For open-collector Hall outputs |
| R_HALL_SER ×3 + C_HALL ×3 | 1 kΩ + 1 nF | Sensor filtering; include delay at maximum electrical speed |
| R_HALL_PWR ×1 + C_HALL_PWR ×2 | 10 Ω + 10 µF / 16 V and 100 nF | Initially current-limited 5 V sensor supply; replace with proper load switch if load exceeds budget |
| R_UART_SER ×2 + R_UART_PU ×1 | TX 100 Ω / RX 1 kΩ + 10 kΩ pullup | UART output damping and input isolation/idle bias |
| R_CMD_SER ×1 + R_CMD_PD ×1 | 1 kΩ + 10 kΩ | Default inactive 3.3 V command input |
| C_CAN_BYPASS ×1 | 100 nF / 16 V | CAN transceiver bypass |
| R_CAN_TERM ×2 + C_CAN_TERM ×1 | 60.4 Ω, 1%, ≥0.25 W each + 4.7 nF | Selectable split termination; populate/enable only at a bus end |
| R_CAN_LINK ×1 | 0 Ω, DNP | Explicit termination assembly selection; fit only at a bus endpoint |
| D_CAN_ESD ×1 | CAN-compatible two-line protection, exact MPN open | Match clamp to transceiver bus limits, not simply a generic high-voltage TVS |
| D_IO_ESD | Arrays for 3 Hall, 2 UART, 1 command, 1 external temperature signals | Select voltage/leakage/capacitance; exact arrays and quantity follow schematic |
| R_IO_CLAMP / level translation | Conditional population | Required if Hall sensors have push-pull 5 V outputs or command source is not 3.3 V compatible |
| J_TEST / TP | Test pads below | No loose floating diagnostic inputs |

Define J_HALL pins as 5V_SENSOR, GND, HALL_U, HALL_V, HALL_W, MOTOR_NTC.
Define J_CMD as GND, CMD_IN, 3V3_SENSE; the last pin is a reference, not a BEC.
J_CAN is GND, CAN_H, CAN_L. J_UART is GND, TX, RX, 3V3_SENSE.
Use standard Cortex SWD ordering with VTref, SWDIO, SWCLK, grounds, optional SWO
and NRST; document unused/reserved positions and pin 1 after checking the mating
connector drawing. Debugger VTref must not back-power the board.

No USB, encoder, user-load BEC, isolated CAN, or radio interface is assumed.
Those are additional circuit requirements if the target application needs them.

## 6. First-pass calculations and implications

These calculations are original design estimates. Datasheet test conditions
provide inputs, not proof that the resulting board meets these limits.

### Current range and shunt dissipation

```text
V_CURRENT = 1.65 V + I_SHUNT × 0.002 Ω × 20
          = 1.65 V + 0.040 V/A × I_SHUNT

±25 A -> 0.65 V ... 2.65 V
±30 A -> 0.45 V ... 2.85 V
P_SHUNT at 10 A RMS <= 10² × 0.002 = 0.20 W per shunt
P_SHUNT during 25 A pulse = 1.25 W
```

The conservative continuous estimate treats the shunt as carrying the whole
phase RMS current; actual low-side duty changes dissipation. Verify 10 ms pulse
capability, fault-clearing time, temperature derating, and resistor tolerance.
The chosen 2 mΩ WSK value has a much larger specified temperature coefficient
than some higher-resistance values; include it in calibration/trip error. [S4]

Keep both input resistors small and matched; their interaction with amplifier
bias/input impedance creates error. The differential RC pole is about 8 MHz,
while the output ADC RC pole is about 1.6 MHz. Final bandwidth must follow
amplifier settling and the actual ADC sampling window, not these RC numbers
alone. [S5]

### Gate charge, regulator dissipation, and bootstrap

Using 43 nC only as an order-of-magnitude gate-charge input:

```text
I_GATES ≈ 6 × 43 nC × 20 kHz = 5.16 mA
P_DRIVER_LDO ≈ (54.6 - 12) × (I_GATES + I_DRIVER_INTERNAL)
```

Allocate 15 mA initially for combined average driver consumption: about 0.64 W
of LDO loss at the maximum normal bus. Recalculate using gate charge at the
actual unipolar drive and driver consumption, then verify junction rise and
startup transient demand. Logic and brake supplies are separate.

For one high-side gate event, Q/C using 43 nC and 0.47 µF gives about 0.092 V
droop. Add floating-driver consumption over maximum on-time, leakage, capacitor
tolerance/bias, and charging-path impedance. At startup, three initially empty
1 µF bootstrap capacitors can substantially disturb REG12. Budget the charge
reservoir and charging delay. High-side refresh and maximum on-time are firmware
requirements; indefinite 100% high-side duty is not a design assumption.

### SiC conduction loss and cooling

For balanced three-phase current and one conducting switch per leg:

```text
P_CONDUCTION,total ≈ 3 × I_PHASE,RMS² × R_ON
At 10 A RMS and 59 mΩ: ≈17.7 W across the six switches
At 20 A RMS and 59 mΩ: ≈70.8 W
```

This uses a **typical** hot-device resistance at 12 V, not a worst-case bound.
Add switching loss, deadtime reverse-conduction loss and all other losses.
The 20 A result explains why current cannot be increased casually. Begin with a
shared heatsink design target around 2 °C/W or better for the provisional 10 A
case, then solve the full thermal network with actual loss, insulating pads,
airflow and ambient. Keep junctions below a design target of 125 °C, with
temperature-based derating. An NTC measures its mounting point, not instantaneous
MOSFET junction temperature. Validate gate-loop reference, source bounce and
commutation overshoot on the assembled geometry.

### Bulk capacitance, ripple and regeneration

Six EEUFC2A221 capacitors give 1320 µF nominal. Each is rated at 1.08 A ripple
at 100 kHz, and is 16 mm diameter × 25 mm tall with 7.5 mm lead pitch. The
six-part bank's arithmetic 6.48 A is **not** its qualified 20 kHz/hot-ambient
rating. Apply the frequency/temperature factors, lifetime model and actual
current-sharing/ESR before accepting the bank. [S15]

```text
Illustrative 20 A transient for 25 µs:
ΔV_CAP = I × Δt / C ≈0.38 V, plus ESR/ESL and wiring effects

Energy available between 54 V and 65 V:
ΔE = 0.5 × 0.00132 × (65² - 54²) ≈0.864 J

44 kΩ bleeder at 54.6 V: P ≈0.068 W; RC time constant ≈58 s
```

Less than one joule of bus-capacitor headroom is not a motor-braking solution.
Use motor/load kinetic energy and the source's charge acceptance to size the
chopper. Turning every inverter gate off does not guarantee regeneration stops:
a spinning motor can charge the bus through the power-stage reverse paths.

Do not pick a TVS by standoff voltage alone. A device that stays off above
54.6 V may clamp above the driver's allowed bus voltage at substantial current.
An input TVS, if added, must pass a real current/energy/clamp budget alongside
the chopper; there is no selected TVS falsely claiming to protect this design.

### Logic power and proposed buck values

Allocate initially 150 mA for MCU/digital circuitry, 10 mA for analog/trips,
40 mA for CAN and indicators: **200 mA on 3.3 V**, with 100 mA reserved for
the external 5 V sensor load. Check actual worst-case current and CAN dominant
loading. LDO loss is about (5 - 3.3) × 0.2 = 0.34 W; package/board thermal
performance must support it. The 300 mA LDO rating is not a thermal guarantee.

The 12 V buck starts from TI's application circuit. For the proposed 5 V buck,
158 kΩ / 49.9 kΩ gives ~5.0 V and a 41.2 kΩ on-time resistor targets ~303 kHz.
At 54.6 V with 68 µH, nominal ripple is about 0.22 A. Verify inductance tolerance,
current-limit behavior, light-load operation, ripple-injection amplitude, startup
and line/load transients. The 5 V ripple network is a calculated proposal, not a
validated manufacturer reference design. [S8]

## 7. Protection and bring-up behavior

| Condition | Required hardware action | Firmware / verification |
| --- | --- | --- |
| Power-up, MCU reset, brownout | Supervisor clears arm latch; three ENx lines pulled low | No spontaneous restart; verify supply ramps and unpowered interfaces |
| Phase-current window trip | Asynchronously clear latch and inhibit enables; assert timer break | Store fault, require explicit rearm; measure complete sensor-to-gate shutdown delay |
| STDRIVE101 nFAULT | Clear latch | Interpret UVLO/startup versus switching faults; no continuous automatic retry |
| Excess bus voltage | Inverter trip; independently demand brake | Brake remains operational during MCU reset; validate worst-case overshoot |
| Overtemperature | Command derating then inverter shutdown | Sensor plausibility checks; independent resistor thermal cutoff |
| Loss of command / watchdog | Disable drive | Defined timeout, restart requires command and arm sequence |
| Reverse input / excessive inrush | Protected upstream connection / precharge | Do not energize until polarity and bus rise are valid |
| Shorted output / stalled rotor | Current protection and appropriately sized fuse | Demonstrate fault energy remains within switch, shunt and conductor limits |

The internal CP comparator is not connected to a 1.65 V biased current-amplifier
output: that would misapply its roughly 0.5 V threshold. The phase window
comparators supply the primary measured-current trip. SCREF/VDS protection
remains a separate backup whose threshold must include hot switch resistance,
shunt drop, tolerance and blanking effects. [S1]

The proposed ~2.29 V SCREF avoids an obvious nuisance-trip problem: a 1 V setting
would already be below 25 A × 59 mΩ ≈1.48 V at the illustrative hot resistance.
Even the higher setting needs worst-case resistance/temperature and protection
tolerance analysis. Recovery from a latched driver VDS fault requires the driver
standby/reset sequence before the external arm latch can be rearmed. Prevent
SCREF from being powered while VS is absent, including during service/debug.

The current-amplifier path may be too slow for destructive shoot-through. Do not
call it short-circuit-qualified until total delay and switch fault SOA are checked.
An external fast raw-shunt comparator/conditioning path or revised power devices
may be required by the measured fault energy. Include such parts explicitly if
that analysis requires them.

## 8. Physical design requirements

- Plan four layers with continuous control/analog reference return and short,
  wide commutation copper on outer layers. Copper weight, plane spacing, vias,
  conductor widths and connector lands must come from current/temperature-rise
  calculations and the chosen fabricator.
- Keep each leg's local bypass loop small. A bus capacitor near the input
  connector does not replace per-leg decoupling.
- Keep gate and source-reference loops short; a single central three-phase
  driver plus large TO-247 packages needs deliberate placement. Do not claim
  high-speed SiC performance before measuring the worst leg.
- Put Kelvin shunt pickups and sense amplifiers beside the shunts, with balanced
  sense routing. Keep phase copper and buck SW nodes away from sense/ADC paths.
- Ground stitching/thermal vias, driver exposed-pad solder/stencil apertures,
  mounting-hole keepouts, creepage/clearance, capacitor vent space, and heatsink
  insulation are part of the board specification.
- Reserve room for six 16 mm bulk-capacitor bodies, seven power switches, five
  power connectors, debug/sensor headers, driver loops and mounting access.
  Select the outline only after a placement/thermal feasibility pass.
- Add four chassis mounting holes and the actual heatsink fasteners, insulating
  washers/bushings, pads, thermal interface material, wire ferrules, connector
  mates and strain relief to the mechanical/assembly BOM.
- Test pads: DC_LINK+/PGND, 5 V, 12 V auxiliary, 3.3 V, analog 3.3 V, REG12,
  nFAULT, latch state, each EN/IN signal, three current outputs, voltage-divider
  outputs and temperatures. Provide paired probe points for VGS and BOOT−OUT;
  floating measurements require appropriate differential probing.

## 9. Implementation and release gates

1. Resolve electrical requirements and conventional-SiC versus cascode choice.
   Confirm bootstrap gate-bias compatibility and cooling feasibility.
2. Complete pin allocation, all component pins, exact passive/protection MPNs,
   reset/fault truth table, brake hysteresis, precharge and source protection.
   Reconcile every capacitor/resistor/diode count against the schematic.
3. Check ERC, current paths, fault thresholds and tolerances, gate-charge budget,
   ADC acquisition/settling, regulator calculations, ripple, thermal and pulse
   limits. Run suitable supply, switching and fault simulations with real models.
4. Create manufacturer-backed footprints and a mechanical placement. Map
   component definitions, footprints and placed parts separately; retain stable
   part/pin/pad/net/layer IDs and explicit unresolved items as required by this
   repository's PCB IR architecture.
5. Route real copper, planes and thermal vias; perform DRC, conductor/return-path
   inspection, heatsink-fit checks and manufacturing review. Intent zones and
   route declarations alone do not satisfy this step.
6. Bring up supplies and inhibit logic first. Verify independent brake action,
   then gate waveforms/bootstraps with a current-limited source, then a small
   motor. Progress to switching, load, regeneration, fault, thermal and EMC
   measurements with defined acceptance criteria.

The electrical circuit, sourced physical definitions, placement and standard
inspection artifacts implement the starting prototype. There is no routed PCB, fabrication output, working firmware or
proven ESC rating yet. The remaining decisions above are engineering work.

## 10. Primary sources and review record

Datasheets were retrieved and relevant limits/application sections reviewed.
The exact values in this proposal are separated from manufacturer ratings;
package drawings still require footprint-specific verification. ST's evaluation
manual was visible in indexed excerpts but its full PDF timed out, so its
schematics have **not** been independently inspected or copied here.

| ID | Manufacturer document / evidence | Relevant use |
| --- | --- | --- |
| S1 | [STDRIVE101, DS13472 Rev 2, June 2022](https://www.st.com/resource/en/datasheet/stdrive101.pdf) | Ratings, supply configuration, logic, bootstrap, fault circuits and package |
| S2 | [SCT040H65G3-7, DS14383 Rev 2, February 2024](https://www.st.com/resource/en/datasheet/sct040h65g3-7.pdf) | Conventional SiC gate-bias mismatch and switching test conditions |
| S3 | [UF3C065040K4S, onsemi Rev 2, April 2025](https://www.onsemi.com/download/data-sheet/pdf/uf3c065040k4s-d.pdf) | SiC cascode topology, 12 V resistance, gate charge, Kelvin pin and thermal data |
| S4 | [Vishay WSK2512, document 30108, 11-Dec-2023](https://www.vishay.com/docs/30108/wsk2512.pdf) | Four-terminal shunts, 1 W rating, ordering code, temperature coefficient and lands |
| S5 | [TI INA240, SBOS662C Rev C](https://www.ti.com/lit/ds/symlink/ina240.pdf) | Gain, common-mode range, midpoint references and filtering considerations |
| S6 | [TI TLV3201/TLV3202, Rev C](https://www.ti.com/lit/ds/symlink/tlv3202.pdf) | Comparator supply/input limits, output behavior and timing |
| S7 | [ST STM32G431x6/x8/xB datasheet](https://www.st.com/resource/en/datasheet/stm32g431cb.pdf) | Controller capabilities, supplies and package-specific pin allocation |
| S8 | [TI LM5164, SNVSAU4D Rev D, February 2026](https://www.ti.com/lit/ds/symlink/lm5164.pdf) | Voltage/current limits, 12 V reference, buck sizing and ripple injection |
| S9 | [TI TPS7A20, Rev H](https://www.ti.com/lit/ds/symlink/tps7a20.pdf) | 3.3 V LDO, stability and thermal limits |
| S10 | [TI TCAN33x, Rev F](https://www.ti.com/lit/ds/symlink/tcan332.pdf) | Classic CAN variant and bus/logic limits |
| S11 | [TI SN74LVC1G74, Rev G](https://www.ti.com/lit/ds/symlink/sn74lvc1g74.pdf) | Latch function table; complete circuit startup timing review pending |
| S12 | [TI SN74LVC244A, Rev AG](https://www.ti.com/lit/ds/symlink/sn74lvc244a.pdf) | Enable buffer; complete circuit power-down/OE review pending |
| S13 | [TI TPS3808, Rev N](https://www.ti.com/lit/ds/symlink/tps3808.pdf) | Supervisor threshold and selectable delay |
| S14 | [TI UCC27511, Rev F](https://www.ti.com/lit/ds/symlink/ucc27511.pdf) | Independent brake driver, split outputs and input polarity |
| S15 | [Panasonic EEUFC2A221 manufacturer specification](https://industrial.panasonic.com/ww/products/pt/aluminum-cap-lead/models/EEUFC2A221) | Exact capacitance, voltage, dimensions and ripple rating |
| S16 | [Phoenix Contact 1714971 manufacturer specification](https://www.phoenixcontact.com/en-nl/products/pcb-terminal-block-mkds-5-2-95-1714971) | Power connector identity, pitch, current and mounting |
| S17 | [Samtec FTSH series](https://www.samtec.com/products/ftsh) | Debug header; see physical source record for Rev H lands and -007 ordering correction |
| S18 | [JST XH connector datasheet](https://www.jst-mfg.com/product/pdf/eng/eXH.pdf) | Header/housing families and dimensions |
| S19 | [Nexperia BAS70, 1 October 2022](https://assets.nexperia.com/documents/data-sheet/BAS70.pdf) | SOT23 pin 1 anode, pin 2 NC, pin 3 cathode; 70 V diode, fault/clamp limits still need circuit qualification |
| REF | [ST EVALSTDRIVE101 product/reference documentation](https://www.st.com/en/evaluation-tools/evalstdrive101.html), [UM2781](https://www.st.com/resource/en/user_manual/um2781-getting-started-with-the-evalstdrive101-stmicroelectronics.pdf) | Reference uses silicon STL110N10F7; full manual fetch unavailable during this review |

Before ordering, archive the final datasheet revisions and package drawings with
the released BOM. Procurement status, prices and stock have not been verified.
