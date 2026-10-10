# Physical footprint source record

Read with the project's [HOWTO](../../../HOWTO.md). The geometry is in
[index.ts](index.ts) and [reference-patterns.json](reference-patterns.json).
These are reusable physical definitions; electrical definitions and logical
connections remain in `catalog.ts` / `circuit.ts`. All dimensions below are mm.

## Coordinate and evidence conventions

Component-side view, +x right and +y down. SMD origins are body centers. TO247
and MKDS use pin 1 at (0,0); the radial capacitor and JST references also use
pin-1 origins. Placement records are origins, not bounding-box corners. There
are no mirrored pin-number guesses. A logical pin is bound explicitly to one or
more physical lands, including the switch's paired contacts.

The component manufacturer's pinout establishes electrical numbering. Its
package drawing establishes the body/lead envelope, **not automatically a land
pattern**. Manufacturer recommended lands are transcribed when available. The
pinned KiCad references below are fallback land-pattern evidence where listed;
geometry checks do not qualify those references for the exact purchased part.

## Manufacturer-specific authored definitions

| Pattern / selected component | Primary evidence | Transcription and authored choices |
| --- | --- | --- |
| STDRIVE101TR, VFQFPN24 | [ST DS13472 Rev 2, June 2022](https://www.st.com/resource/en/datasheet/stdrive101.pdf), pin table, package section, Fig. 23 recommended footprint | 24 lands 0.60 × 0.25, 0.50 pitch, side centers ±1.90; EP 2.80 square; 4.0 square body. Pin 1 is upper left, numbering counterclockwise. Four EP paste apertures 1.15 square at ±0.675 give 67.5% coverage; this stencil division and 5.0-square courtyard are project choices, not ST specifications. |
| UF3C065040K4S, TO247-4 vertical | [onsemi datasheet](https://www.onsemi.com/download/data-sheet/pdf/uf3c065040k4s-d.pdf), p.9, CASE 340AN issue E, 20 June 2025 | Pin x = 0, 5.08, 7.62, 10.16; D/S/KS/G. **First gap differs from the others.** Max lead cross section 1.40 × 0.89 has a 1.66 diagonal. Authored 1.90 finished holes with 2.30 × 4.50 oval lands, replacing the library's too-small 1.50 holes. 0.20 nominal radial annulus. Max 16.26 × 5.31 plan envelope reserved; body stands above the board. Both-side courtyards provided. Finished-hole tolerance, solderability, lead-forming and insulation kits still require approval. |
| SN74LVC1G74DCTR | [TI datasheet](https://www.ti.com/lit/ds/symlink/sn74lvc1g74.pdf), DCT0008A, drawing 4220784/D, October 2025, example board layout | 1.10 × 0.40 lands at x = ±1.90, y = ±0.975/±0.325, pitch 0.65. TI calls DCT **SSOP**. The generic Zetex SM8 pattern is not interchangeable. Body 3.0 square, authored 5.4 × 3.7 courtyard. |
| LM5164DDAR | [TI LM5164 Rev D, February 2026](https://www.ti.com/lit/ds/symlink/lm5164.pdf), DDA0008B drawing 4214849/B, September 2025; PDF pp.28–30 | Side lands 1.55 × 0.60 at x = ±2.70, pitch 1.27. EP copper 2.95 × 4.90; **SMD mask opening 2.71 × 3.40**, as specified by TI. Four authored 1.10 × 1.45 EP paste windows at x ±0.67/y ±0.85 give 69.2% coverage of exposed metal. Thermal vias are not represented by a routed/fabricated board. Courtyard 7.5 × 5.7. |
| MSS1246T-683MLB | [Coilcraft document 540-2, 28 January 2022](https://www.coilcraft.com/pdfs/mss1246t.pdf), p.2 recommended land pattern and outline | Two lands 5.50 × 4.00 at (0,±4.25), 8.50 center spacing. Max body 12.30 square, height 4.80. Project assigns pad 1 to top/SW, pad 2 to bottom/output; assembly must orient the manufacturer's short-lead marking toward SW. Authored courtyard 13.3 × 13.5. |
| Phoenix 1714971 / MKDS 5/2-9,5 | [Manufacturer product dimensions and drawing](https://www.phoenixcontact.com/en-be/products/pcb-terminal-block-mkds-5-2-95-1714971) | 9.52 pitch, 0.90-square leads, 1.30 recommended holes, width 19.04, depth 12.05. Drawing offsets 4.76 from end to pin and 4.60/7.45 from pin row to front/back. Authored 2.60-circle copper lands and 0.50 body courtyard margin. Hole tolerance for diagonal lead clearance and screw/wire tool access remain mechanical checks. Front faces -y in the footprint. |
| Samtec FTSH-105-01-L-DV-007-K | [Recommended layout Rev H, 27 August 2019, Fig.1/table1](https://suddendocs.samtec.com/prints/ftsh-1xx-xx-xxx-dv-xxx-footprint.pdf), [assembly drawing Rev FX](https://suddendocs.samtec.com/prints/ftsh-1xx-xx-xxx-dv-xxx-xxx-x-xx-mkt.pdf) | Metric labels: 2.79 × 0.74 lands, 6.86 outer row span, 1.27 pitch; row centers ±2.035. Drawing rotated 90°: odds on left, 1 upper left. Pin 7 omitted by **-007**; -K describes the mating key feature. No alignment holes (table1: -K N/A). 5.08 × 6.35 body reservation and 7.5 × 7.35 courtyard are conservative project envelopes. Manufacturer recommends 0.152mm stencil; project paste inset must be reconciled with the assembly process. |
| Test pads and M3 mounts | Board-owned geometry, no purchased component | 1.50-circle test copper / 1.60 mask; no paste. Four 3.20 NPTH holes with 7.0-square reservations on both sides. NPTH copper isolation, washer/fastener/edge margins and probe accessibility need mechanical review; the compiler does not prove them. |

Mask openings on NSMD pads expand copper by 0.05 per edge; ordinary paste
apertures inset copper by 0.025 per edge. These are declared process choices,
not implicit compiler defaults. Package bodies use fabrication layers,
courtyards use the dedicated mechanical layers, and pin-1 markers use silk.
The EPs are exceptions to the ordinary paste rule; DDA is also a mask exception.
A fabricator/assembler must qualify these choices and stencil area ratios.

## Pinned fallback reference patterns

`reference-patterns.json` records the exact upstream path, commit and SHA256 of
each original file. Upstream is [KiCad/kicad-footprints at
7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd](https://github.com/KiCad/kicad-footprints/tree/7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd).
The [upstream license](LICENSE.reference-patterns.md) is retained. Run the
one-shot importer against a checkout of **that revision** to reproduce this
snapshot; it is not a runtime dependency or a lookup by a vague package label.

| Reference | Binding / exact-part qualification status |
| --- | --- |
| SOIC8 3.9 × 4.9 / P1.27 | INA240A1D, TLV3202AID and TCAN332DR, package-specific pin definitions. Fallback library lands; review each manufacturer's D outline and solder recommendation before release. |
| SOT23 / SOT23-5 / SOT23-6 | BAS70, TPS7A20 DBV, TPS3808 DBV and UCC27511 DBV. Exact electrical numbering retained; fallback geometry still requires manufacturer/process qualification. |
| TSSOP20 4.4 × 6.5 / P0.65 | SN74LVC244APWR. TI PW pin numbering. Fallback lands; final PW tolerances and paste qualification pending. |
| LQFP48 7 × 7 / P0.5 | STM32G431CBT6. Fallback library lands (the dimensions are not copied from a different STM32 pinout). [ST DS12589](https://www.st.com/resource/en/datasheet/stm32g431cb.pdf), LQFP48 outline/land recommendation is the final qualification reference. |
| WSK2512_T2.21 | WSK25122L000FEA: I1→1, I2→4, E1→2, E2→3. Current lands 3.30 × 2.03 centered (-2.48,-0.635)/(2.48,0.635); sense lands 1.40 × 0.76 centered (-3.43,1.27)/(3.43,-1.27). [Vishay doc30108 Rev11 Dec2023](https://www.vishay.com/docs/30108/wsk2512.pdf), recommended land row .0005–.0049, specifies 1.70 sense-land dimension. **Snapshot differs: final land offsets/width must be reconciled with that recommendation before release.** Do not describe the reference as a fully qualified manufacturer pattern. |
| Radial D16/P7.5 | EEUFC2A221. Pin1 positive, pin2 negative; body center offset +3.75 from pin1. [Panasonic specification](https://industrial.panasonic.com/ww/products/pt/aluminum-cap-lead/models/EEUFC2A221) confirms D16/H25/P7.5. Hole/lead tolerance and polarity assembly inspection remain release checks. |
| JST XH vertical 2/3/4/6 | B2B/B3B/B4B/B6B-XH-A. Numbering and 2.50 pitch from [JST XH](https://www.jst-mfg.com/product/pdf/eng/eXH.pdf); snapshot preserves pin1 origin, source holes/pads and body envelope. Mating housings, crimp contacts and latch/wire access are separate BOM/mechanical items. |
| R0603/R0805/R1206, C0603/C0805/C1210 | Package-bounded passive **requirements**, not purchased MPNs. Resistor/MLCC geometry is separate; FB/NTC use the R0603 reference. Exact part selection, voltage/pulse/temperature rating and land qualification remain purchasing gaps in bom.csv. |
| LED0603 | Generic LED requirement; circuit terminal1 is anode → library pad2, terminal2 cathode → pad1. MPN/polarity marks must match before assembly. |
| SOD123 | Optional fast-discharge diode, DNP. A→2/K→1 in the reference. Its MPN, pulse rating and package tolerance are still unselected. |
| TL3305A switch | Generic reset-switch requirement provisionally constrained to this reference envelope. Logical1 binds both physical1 contacts; logical2 binds both physical2 contacts. Final MPN must match or the footprint must be replaced. |

The importer preserves copper shapes, holes and pad positions. It encloses
source fabrication/courtyard line outlines in conservative rectangles rather
than copying decorative polygons. Circular bulk bodies stay circular. Mask and
paste openings are authored using the rules above. Both-side THT courtyard
reservations are added in `index.ts`; these are conservative project choices.

## Placement review and remaining work

`placement.json` stores coordinates by stable part ID, including all DNP lands.
`generate-placement.ts` produces the initial 180 × 160 floorplan with anchored
power devices, driver, shunts, amplifiers, bucks and connectors. It packs local
supporting parts into declared block regions using the actual courtyards, with
0.40 separation. This establishes an inspectable starting floorplan, **not**
electrically qualified placement. In particular, the single driver and widely
spaced TO247 phase legs need measured/extracted gate-loop and commutation-loop
inductance review; short net labels do not imply short physical loops.

The manufacturing profile selects 0.15 copper feature/spacing, 0.30 drill,
0.15 annulus, 0.10 mask web/paste feature and 0.20 courtyard containment.
No global `minMaskExpansion` is selected because TI's SMD EP intentionally has
negative expansion; tests check the positive NSMD apertures and exact DDA mask
independently. This skipped generic check stays visible in inspection reports.
Reports also retain unsupported routing, plating, paste-process, provenance,
3D and current-capacity coverage. Passing selected checks is not fabrication
approval. Routing/planes/vias, heat-sink fit, fastener isolation, transients,
exact unselected MPNs, firmware and bench qualification remain required.
