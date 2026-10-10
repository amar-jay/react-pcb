# ESC footprint example

This extends the basic example with real component identities and eight reusable
physical footprint definitions. Footprints use semantic layers, exact physical
units, stable feature IDs, and separate logical-pin bindings. The board is a
36 × 36 mm footprint study with 17 placed parts. It is not a complete ESC circuit.

```sh
bun run examples/esc/index.tsx
bun run board:dev examples/esc/index.tsx
bun run board:build examples/esc/index.tsx --out /tmp/esc-board.html
bun run board:inspect examples/esc/index.tsx --out /tmp/react-pcb-esc-footprints
bun test packages/react-pcb/src/__tests__/esc.test.tsx
```

The inspection command discovers the eight used definitions directly from the
compiled board and writes canonical JSON, SVG, a manifest, and an offline
static `index.html` with SVG images and artifact links, without JavaScript or embedded IR. The board selects no manufacturing profile, so its
gallery records absent reports as `null`; it does not apply the separate
regression-test profiles described below. Importing the
board entry is safe for preview/watch use; compilation and console output happen
only when it runs as the main script.

## Sources and component selection

Checked on 2026-10-10. The previous generic part names and placeholder datasheet
links did not identify actual packages, so these are explicit example selections.

| Board role | Selected part | Physical definition and evidence |
| --- | --- | --- |
| Controller | ST STM32G0B1CBT6 | Existing [LQFP48 definition](../footprints/LQFP48.tsx), [geometry notes](../../docs/footprints/LQFP48.md). [DS13560 Rev 6](https://www.st.com/resource/en/datasheet/stm32g0b1cb.pdf), Fig. 5 p. 38, Fig. 44 p. 136, AF tables pp. 56–59. |
| Gate driver | Infineon IR2101STRPBF | [SOIC8.tsx](footprints/SOIC8.tsx). [PD60043 Rev O](https://www.infineon.com/assets/row/public/documents/24/49/infineon-ir2101-ds-en.pdf), lead assignment p. 5, land pattern p. 13. |
| MOSFETs | Nexperia PSMN2R8-40YSB | [LFPAK56.tsx](footprints/LFPAK56.tsx). [Device datasheet](https://assets.nexperia.com/documents/data-sheet/PSMN2R8-40YSB.pdf), pinning p. 2; [SOT669 package information, 20 March 2025](https://www.nexperia.com/documents/package-information/SOT669.pdf), Figs. 1–2 pp. 2–3. |
| Decoupling | Murata GRM155R71H104KE14D | [passives.tsx](footprints/passives.tsx). [Manufacturer reference sheet GRM155R71H104KE14-01A](https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM155R71H104KE14-01A.pdf), dimensions p. 2, general GRM reflow Table 2 p. 27. |
| Bus capacitor | Murata GRM32ER71H106KA12L | Same general GRM reflow table, code 32 (3225 metric / 1210 imperial). [Part page](https://www.murata.com/en-global/products/productdetail?partno=GRM32ER71H106KA12%23). The part-specific PDF endpoint returned 404; this land pattern uses the manufacturer's general GRM32 table, not an independently checked current part-specific sheet. |
| Shunt | Vishay WSL2512R0100FEA, 10 mΩ | [passives.tsx](footprints/passives.tsx). [30100, 23-Nov-2023](https://www.vishay.com/docs/30100/wsl.pdf), p. 2, **0.007–0.5 Ω** row. Other resistances require different lands. |
| Battery connector | AMASS XT30UPB-M, vertical PCB mount | [terminals.tsx](footprints/terminals.tsx). [Official KiCad reference](https://github.com/KiCad/kicad-footprints/blob/master/Connector_AMASS.pretty/AMASS_XT30UPB-M_1x02_P5.0mm_Vertical.kicad_mod). The [AMASS drawing linked by that reference](https://www.tme.eu/en/Document/4acc913878197f8c2e30d4b8cdc47230/XT30UPB%20SPEC.pdf) was unavailable (403/404). Dimensions and polarity are reference-checked, not independently manufacturer-verified. |
| Motor wire terminals | Board-owned plated solder terminals | Authored geometry in [terminals.tsx](footprints/terminals.tsx); no invented manufacturer, MPN or datasheet and no purchased component definition. |

The XT30UPB vertical variant preserves the intended 5 mm pitch. XT30PW is a
horizontal connector and also needs retention holes; it is not interchangeable.

## Coordinates and lands

All coordinates are millimetres, component-side view: +x right, +y down. Origins
are package/body centers except that the LFPAK uses the dimension datum in the
reflow drawing, and the connector uses the midpoint between the two holes.
Footprint container boxes compile away; only actual feature bounds are retained.

| Definition | Copper centers | Copper dimensions (x × y) |
| --- | --- | --- |
| SOIC8 | Left x = −2.34, pins 1–4 y = −1.905, −0.635, +0.635, +1.905. Right x = +2.34, pins 5–8 reverse that y sequence. | 1.78 × 0.72; 1.27 pitch; 6.46 outer span. |
| LFPAK leads 1–4 | x = −1.905, −0.635, +0.635, +1.905; y = +2.725. | 0.70 × 1.15. |
| LFPAK drain upper/lower | Upper (0, −2.75); lower (0, −0.45). | Upper 4.70 × 1.50; lower 4.20 × 3.10. They meet exactly at y = −2.00, forming the drawing's T-shaped land. |
| GRM15 / 0402 | (±0.40, 0) | 0.40 × 0.50; gap 0.40. Selected within the reflow ranges a = 0.3–0.5, b = 0.35–0.45, c = 0.4–0.6. |
| GRM32 / 1210 | (±1.65, 0) | 1.10 × 2.20; gap 2.20. Selected within a = 2.0–2.4, b = 1.0–1.2, c = 1.8–2.3. |
| WSL2512 10 mΩ | (±2.855, 0) | 1.65 × 3.68; gap 4.06. Manufacturer's tabulated metric values are used. |
| XT30UPB | Pin 1 / minus (−2.50, 0); pin 2 / plus (+2.50, 0). | 3.00 square / 3.00 diameter circle; plated 1.80 drills. |
| Motor wire terminal | (0, 0) | 3.40 diameter; plated 1.80 drill. |

SOIC and LQFP numbering proceeds down the left, then counterclockwise around
the package. LFPAK pins 1/2/3 are source, pin 4 gate, and mounting base drain.
The logical `S` maps to all three source lands; `D` maps to both drain rectangles.
The drain rectangles are a representation of one continuous land, not two
isolated terminals.

## Mask, paste and documentation choices

For SOIC and passives, explicitly authored mask openings expand copper by 0.05
per edge and paste apertures inset by 0.05 per edge. These are process choices,
not dimensions copied from a manufacturer's copper drawing. Copper pads have
only copper roles so nominal, full-size paste cannot override the reduced paste.
The reused LQFP48 retains its existing coincident copper/mask/paste policy.

LFPAK follows the 125 μm stencil drawing: four upper drain windows of 0.60 ×
0.90 at x = −1.905, −0.635, +0.635, +1.905 and y = −3.00; nine lower windows
of 0.90 × 0.60 at x = −1.15, 0, +1.15 and y = −1.15, −0.30, +0.55.
Lead paste is 0.60 × 1.05 (0.05 inset per edge). Lead masks expand by 0.075
per edge. The merged drain mask is deliberately a 4.85 × 4.75 rectangle,
centered at (0, −1.20), enclosing the T-shaped copper with at least 0.075
clearance. This opens an extra 0.25-wide strip beside the narrower drain section;
it avoids inventing unsupported polygon/aperture-union geometry. Stencil
thickness is source evidence, not a field supported by the IR.

Through-hole openings expand by 0.05 per edge on both sides and have no paste.
Courtyards, silk markers, and simplified fabrication outlines are authored
reservations, not additional manufacturer land dimensions. The XT30 housing's
chamfer is enclosed by a rectangular body outline. Through-hole footprints
reserve both sides, with a larger front courtyard for the connector housing.

The nominal body drawings do not encode complete package tolerances or 3D
height envelopes. Capacitor and shunt courtyard margins allow additional room;
assembly-process suitability still requires checking the chosen components.

## Inspection policy and coverage

[`footprints/index.ts`](footprints/index.ts) declares example thresholds: copper
feature/spacing 0.15, drill 0.30, annular ring 0.15, mask expansion 0.05, mask
web 0.10, paste feature 0.10 and courtyard clearance 0.20. In regression tests, all eight definitions
pass the checks selected for their profiles. LQFP permits nominal mask openings.

LFPAK's standalone report explicitly selects zero copper spacing and zero mask
web because this validator is net-independent and sees the continuous drain as
two touching primitives covered by one merged opening. It cannot apply a
pin-specific exemption. This relaxed standalone report does **not** establish
0.15 copper separation or 0.10 mask webs for LFPAK. Regression tests independently
check its exact geometry; the regression-test placed-board report checks 0.15 copper spacing,
using established net IDs to exempt the common-drain seam. Every report retains
its actual thresholds and `complete: false`.

Under the explicit test profile, the placed board passes copper spacing and
inter-part courtyard reservations.
Tests also check pad/drill dimensions, native pin mappings, deterministic SVG,
JSON round trips, many-pad source/drain binding, side-specific technical layers,
back-side reflection/rotation, and import-safe preview behavior.

## Remaining electrical design

This work completes physical footprints and their integration; it does not
supply a complete motor controller. Phases B/C still need drivers and PWM
connections. Both supply nets currently describe external supply intent without
connectors/regulators. Bootstrap charging diodes, gate resistors/pulldowns,
reset/debug connections, full decoupling, current-sense conditioning/protection,
and phase-voltage sensing are not designed. The MCU logical definition remains
explicitly partial even though its physical footprint contains every land.

The IR's route and zone declarations express intent; no actual traces, power
planes, thermal vias or fabrication outputs have been synthesized. The 10 μF bus
capacitor is an example selection, not a verified motor-bus capacitance budget.
IR2101 VCC now uses a separate gate-supply net rather than 3V3; the datasheet
requires 10–20 V. The original direct phase-to-MCU ADC connection is removed.
These gaps require electrical, thermal, routing and EMC work before a working
ESC can be claimed. No KiCad schematic/PCB or simulation model exists here,
so schematic/PCB analyzers and SPICE were not run for this footprint task.
