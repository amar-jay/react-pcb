# Basic constraint example

[`board.tsx`](board.tsx) declares a 60 × 40 mm board with a USB connector,
controller and decoupling capacitor. Physical definitions and placed geometry
support pad-copper and courtyard checks. Its manufacturing thresholds are
illustrative; see [manufacturing coverage](../../docs/manufacturing-validation.md).

The copper/via keepout reserves x = 0–0.745 mm along the board edge. It exactly
touches the nearest USB land; boundary contact is allowed. The original 8 mm
width overlapped connector copper and is retained as a failing regression in
[`keepout-enforcement.test.tsx`](../../packages/react-pcb/src/__tests__/keepout-enforcement.test.tsx).
The authored rectangle and canonical identities are preserved in the IR.

The supply route and USB differential pair have ordered, unblocked waypoint
regions. Stable keys distinguish the pair's connector-exit and MCU-entry visits.
Passing that conservative feasibility check does not establish actual trace
paths, impedance, width/gap clearance or transitions: each owner emits `PCBIR043`.
`PCBIR041` records unavailable tracks, vias and zone-fill coverage for the
electrical keepout. The GND zone declares fill intent rather than poured copper.

The preview shows keepouts, waypoints and zone boundaries with independent
controls. Select an outline or a Board overview entry to inspect its scope,
exceptions, net and visit order. **Fit scene** includes every authored region;
SVG/PNG exports preserve those physical coordinates. See the
[contract](../../docs/constraint-regions.md) and
[regression matrix](../../docs/constraint-regions-regressions.md).

```sh
bun run board:dev examples/basic/board.tsx
bun run board:build examples/basic/board.tsx --out /tmp/basic-preview/index.html
```
