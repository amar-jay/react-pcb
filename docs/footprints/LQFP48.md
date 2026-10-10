# LQFP-48, 7 × 7 mm, 0.5 mm pitch

`examples/basic/footprints/LQFP48.tsx` supplies the physical definition used by
`examples/basic/parts/STM32G0B1CBT6.ts` and therefore `examples/basic/board.tsx`.

Sources checked on 2026-10-08:

- [ST STM32G0B1xB/xC/xE datasheet, DS13560 Rev 6](https://www.st.com/resource/en/datasheet/stm32g0b1cb.pdf):
  Figure 5, page 38 (LQFP48 GP pinout); Figure 43 and Table 85, pages 134–135
  (package outline); Figure 44, page 136 (land pattern, drawing `5B_LQFP48_FP_V1`).
- [Official KiCad LQFP-48 reference](https://gitlab.com/kicad/libraries/kicad-footprints/-/blob/master/Package_QFP.pretty/LQFP-48_7x7mm_P0.5mm.kicad_mod):
  numbering, pitch, body size, and corner silkscreen cross-check.
  Download SHA-256: `1ccc5ad4d95398a4c6eb4b4cd1c429865368d06b8373613c6fcb332b53106ee0`.

The origin is the body center, viewed from the component side. +x is right,
+y is down. Pin 1 is the uppermost left land. Numbering proceeds down the left,
right along the bottom, up the right, and left along the top. There are 48
separate rectangular SMT lands and no exposed center pad or drills.

## Manufacturer geometry

All dimensions below are millimeters. ST's Figure 44 controls the copper lands.

| Pins | Centers | Land size (x × y) |
| --- | --- | --- |
| 1–12 | x = −4.25; y = −2.75 through +2.75, step +0.50 | 1.20 × 0.30 |
| 13–24 | y = +4.25; x = −2.75 through +2.75, step +0.50 | 0.30 × 1.20 |
| 25–36 | x = +4.25; y = +2.75 through −2.75, step −0.50 | 1.20 × 0.30 |
| 37–48 | y = −4.25; x = +2.75 through −2.75, step −0.50 | 0.30 × 1.20 |

The outer land span is 9.70, inner span 7.30, and tangential row span 5.80.
Adjacent copper lands have a 0.20 gap. The nominal body is 7.00 × 7.00;
the package lead-tip span is 9.00. This is LQFP, not the exposed-pad UFQFPN48.

KiCad's generic reference uses 1.475 × 0.30 lands at a radial center of
4.1625, with rounded corners. These differ from ST's example; this authored
footprint deliberately uses ST's rectangular 1.20 × 0.30 lands at 4.25.

## Authored documentation and openings

The centered square courtyard is 10.20 × 10.20 with a 0.05 stroke, giving
0.25 clearance from outer copper edges to its centerline. This is an authoring
choice, not an ST dimension. The fabrication body uses a 0.10 stroke and a
filled circular pin-1 indicator instead of a chamfer. Corner-only 0.12-wide
silkscreen follows the reference corner locations; a circular marker identifies
pin 1 above its land. The marker and corner bars clear copper by at least 0.20.

Each land carries front copper, mask, and paste roles with coincident outlines.
No mask expansion or paste reduction is specified by this definition; those
require process-specific manufacturing rules. Source coordinates are integer
micrometers and compilation preserves integer nanometers.

The logical example remains explicitly partial: VDD/VDDA → 6, VSS/VSSA → 7,
PA11/USB_DM → 33, and PA12/USB_DP → 34, verified against the GP pinout.
The physical definition includes all 48 lands regardless of logical coverage.

Run `bun run board:inspect examples/basic/board.tsx --out /tmp/react-pcb-footprints`
for the static inspection page. `manifest.json` maps the LQFP48 definition
key to its canonical JSON and styled SVG filenames. Tests independently
check all land positions and dimensions, numbering, identity, deterministic SVG,
and front/back board placement and bindings.
