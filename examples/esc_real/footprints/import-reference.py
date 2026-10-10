"""One-shot extraction of checked library pad geometry; not a runtime EDA dependency.

Usage: python3 examples/esc_real/footprints/import-reference.py /path/to/kicad-footprints
The pinned upstream revision and exact source paths are saved with every pattern.
Body/courtyard rectangles conservatively enclose the source line outlines.
Mask expansion and paste inset are explicit project process choices.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
paths = {
    "R0603": "Resistor_SMD.pretty/R_0603_1608Metric.kicad_mod",
    "R0805": "Resistor_SMD.pretty/R_0805_2012Metric.kicad_mod",
    "R1206": "Resistor_SMD.pretty/R_1206_3216Metric.kicad_mod",
    "C0603": "Capacitor_SMD.pretty/C_0603_1608Metric.kicad_mod",
    "C0805": "Capacitor_SMD.pretty/C_0805_2012Metric.kicad_mod",
    "C1210": "Capacitor_SMD.pretty/C_1210_3225Metric.kicad_mod",
    "LED0603": "LED_SMD.pretty/LED_0603_1608Metric.kicad_mod",
    "SOT23": "Package_TO_SOT_SMD.pretty/SOT-23.kicad_mod",
    "SOT235": "Package_TO_SOT_SMD.pretty/SOT-23-5.kicad_mod",
    "SOT236": "Package_TO_SOT_SMD.pretty/SOT-23-6.kicad_mod",
    "SOIC8": "Package_SO.pretty/SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod",
    "TSSOP20": "Package_SO.pretty/TSSOP-20_4.4x6.5mm_P0.65mm.kicad_mod",
    "LQFP48": "Package_QFP.pretty/LQFP-48_7x7mm_P0.5mm.kicad_mod",
    "SOD123": "Diode_SMD.pretty/D_SOD-123.kicad_mod",
    "WSK2512": "Resistor_SMD.pretty/R_Shunt_Vishay_WSK2512_6332Metric_T2.21mm.kicad_mod",
    "BULK": "Capacitor_THT.pretty/CP_Radial_D16.0mm_P7.50mm.kicad_mod",
    "SWITCH": "Button_Switch_SMD.pretty/SW_SPST_TL3305A.kicad_mod",
    **{f"JST{n}": f"Connector_JST.pretty/JST_XH_B{n}B-XH-A_1x0{n}_P2.50mm_Vertical.kicad_mod" for n in [2, 3, 4, 6]},
}

def parse(text):
    tokens = re.findall(r'\(|\)|"(?:\\.|[^"\\])*"|[^\s()]+', text)
    def expression(pos):
        if tokens[pos] != "(":
            token = tokens[pos]
            return (json.loads(token) if token.startswith('"') else token), pos + 1
        items, pos = [], pos + 1
        while tokens[pos] != ")":
            item, pos = expression(pos)
            items.append(item)
        return items, pos + 1
    return expression(0)[0]

def field(node, name):
    return next((child[1:] for child in node if isinstance(child, list) and child[0] == name), [])

def mm(value):
    return f"{round(float(value), 6):g}mm"

patterns = {}
for name, path in paths.items():
    text = (root / path).read_text()
    tree = parse(text)
    features, binding = [], {}
    for child in tree:
        if not isinstance(child, list) or child[0] != "pad":
            continue
        number, mount, shape = child[1:4]
        if mount not in ("smd", "thru_hole"):
            raise ValueError(f"Unhandled pad type: {path}: {mount}")
        index = len(binding.get(number, []))
        pad_id = number if not index else f"{number}-contact-{index+1}"
        binding.setdefault(number, []).append(pad_id)
        x, y, *angle = field(child, "at")
        w, h = [float(v) for v in field(child, "size")]
        rotation = int(float(angle[0])) % 360 if angle else 0
        if rotation not in (0, 90, 180, 270):
            raise ValueError(f"Unsupported rotation: {path}")
        def geometry(width, height, inset=0):
            if shape == "circle":
                return {"kind": "circle", "diameter": mm(width)}
            if shape == "roundrect":
                radius = float(field(child, "roundrect_rratio")[0]) * min(w, h)
                return {"kind": "rounded-rect", "size": [mm(width), mm(height)], "radius": mm(max(0, radius-inset))}
            if shape not in ("rect", "oval"):
                raise ValueError(f"Unsupported shape: {path}: {shape}")
            return {"kind": shape, "size": [mm(width), mm(height)]}
        common = {"at": [mm(x), mm(y)], "rotation": rotation}
        copper = {"id": pad_id, "purpose": "pad", **common, "shape": geometry(w, h), "layers": ["all-copper" if mount == "thru_hole" else "front-copper"]}
        if mount == "thru_hole":
            drill = field(child, "drill")
            if len(drill) != 1:
                raise ValueError(f"Unsupported slot in selected source: {path}")
            copper["drill"] = {"diameter": mm(drill[0]), "plated": True}
        features.append(copper)
        features.append({"id": f"mask-{pad_id}", "purpose": "mask-opening", **common, "shape": geometry(w+0.1, h+0.1, -0.05), "layers": ["all-mask" if mount == "thru_hole" else "front-mask"]})
        if mount == "smd":
            features.append({"id": f"paste-{pad_id}", "purpose": "paste-opening", **common, "shape": geometry(w-0.05, h-0.05, 0.025), "layers": ["front-paste"]})
    for purpose, layer in [("fabrication", "F.Fab"), ("courtyard", "F.CrtYd")]:
        points = []
        for node in tree:
            if isinstance(node, list) and node[0] == "fp_line" and field(node, "layer") == [layer]:
                points += [list(map(float, field(node, which))) for which in ("start", "end")]
        # Radial capacitor's source uses circles, not a body polygon.
        for node in tree:
            if isinstance(node, list) and node[0] == "fp_circle" and field(node, "layer") == [layer]:
                x, y = map(float, field(node, "center")); ex, ey = map(float, field(node, "end"))
                radius = ((x-ex)**2 + (y-ey)**2)**0.5
                features.append({"id": purpose, "purpose": purpose, "at": [mm(x), mm(y)], "shape": {"kind": "circle", "diameter": mm(2*radius)}, "layers": ["front-"+purpose], "stroke": "0.05mm"})
        if points and not any(f["id"] == purpose for f in features):
            xs, ys = list(zip(*points)); xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
            features.append({"id": purpose, "purpose": purpose, "at": [mm((xmin+xmax)/2), mm((ymin+ymax)/2)], "shape": {"kind": "rect", "size": [mm(xmax-xmin), mm(ymax-ymin)]}, "layers": ["front-"+purpose], "stroke": "0.05mm"})
    patterns[name] = {"source": {"url": f"https://github.com/KiCad/kicad-footprints/blob/{revision}/{path}", "sha256": hashlib.sha256(text.encode()).hexdigest()}, "pinMap": {pin: pads[0] if len(pads)==1 else pads for pin,pads in binding.items()}, "footprint": {"schemaVersion": 2, "key": f"esc-real:reference:{name}", "features": features}}

Path(__file__).with_name("reference-patterns.json").write_text(json.dumps(patterns, indent=2)+"\n")
