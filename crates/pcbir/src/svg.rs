//! Deterministic, read-only SVG projection of validated physical footprints.
use crate::physical::{Feature, PhysicalFootprint, Shape};
use crate::{CompileError, Diagnostic};
use std::collections::BTreeMap;
use std::fmt::Write;

fn invalid(message: &str) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBSVG001", message))
}

pub(crate) fn escape(value: &str) -> Result<String, CompileError> {
    if value.chars().any(|c| {
        !matches!(c, '\t' | '\n' | '\r') && (c < '\u{20}' || c == '\u{fffe}' || c == '\u{ffff}')
    }) {
        return Err(invalid("SVG identifiers must contain valid XML characters"));
    }
    Ok(value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
        .replace('\t', "&#9;")
        .replace('\n', "&#10;")
        .replace('\r', "&#13;"))
}

// Hex-encoded UTF-8 components cannot collide with separators or inject markup.
pub(crate) fn identity(key: &str, layer: &str, feature: &str) -> String {
    let hex = |s: &str| {
        s.as_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    };
    format!("f-{}-{}-{}", hex(key), hex(layer), hex(feature))
}

pub(crate) fn mm(doubled_nm: i128) -> String {
    let sign = if doubled_nm < 0 { "-" } else { "" };
    let n = doubled_nm.abs();
    let whole = n / 2_000_000;
    let remainder = n % 2_000_000;
    if remainder == 0 {
        return format!("{sign}{whole}");
    }
    let fraction = format!("{:07}", remainder * 5);
    format!("{sign}{whole}.{}", fraction.trim_end_matches('0'))
}

pub(crate) fn geometry(feature: &Feature) -> String {
    geometry_with(feature, |n| n.to_string())
}

pub(crate) fn geometry_mm(feature: &Feature) -> String {
    geometry_with(feature, mm)
}

fn geometry_with(feature: &Feature, number: fn(i128) -> String) -> String {
    let [w, h] = feature.shape.size().map(i128::from);
    match &feature.shape {
        Shape::Circle { diameter } => format!(
            "<circle cx=\"0\" cy=\"0\" r=\"{}\"",
            number(i128::from(*diameter))
        ),
        shape => {
            let mut s = format!(
                "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"",
                number(-w),
                number(-h),
                number(w * 2),
                number(h * 2)
            );
            let radius = match shape {
                Shape::RoundedRect { radius, .. } => i128::from(*radius) * 2,
                Shape::Oval { .. } => w.min(h),
                _ => 0,
            };
            if radius > 0 {
                write!(s, " rx=\"{}\" ry=\"{}\"", number(radius), number(radius)).unwrap();
            }
            s
        }
    }
}

/// One SVG user unit is half a nanometre. No floats or geometry mutation.
pub fn footprint_svg(footprint: &PhysicalFootprint) -> Result<String, CompileError> {
    footprint.validate()?;
    let key = escape(&footprint.key)?;
    let [x, y] = footprint.bounds.min2.map(i128::from);
    let [max_x, max_y] = footprint.bounds.max2.map(i128::from);
    let (width, height) = (max_x - x, max_y - y);
    let mut svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}mm\" height=\"{}mm\" viewBox=\"{x} {y} {width} {height}\" data-footprint-key=\"{key}\" data-units=\"half-nm\">\n<title>{key}</title>\n",
        mm(width),
        mm(height)
    );
    let mut groups: BTreeMap<String, Vec<&Feature>> = BTreeMap::new();
    let mut drills = Vec::new();
    for feature in &footprint.features {
        escape(&feature.id)?;
        for role in &feature.layers {
            let name = serde_json::to_value(role)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned();
            groups.entry(name).or_default().push(feature);
        }
        if feature.drill.is_some() {
            drills.push(feature);
        }
    }
    for (layer, mut features) in groups {
        features.sort_by(|a, b| a.id.cmp(&b.id));
        let color = if layer.contains("copper") {
            "#c87926"
        } else if layer.contains("mask") {
            "#349878"
        } else if layer.contains("paste") {
            "#8d99ae"
        } else if layer.contains("silkscreen") {
            "#e5bd36"
        } else {
            "#6574cd"
        };
        writeln!(
            svg,
            "<g id=\"layer-{layer}\" data-layer=\"{layer}\" fill=\"{color}\" stroke=\"{color}\">"
        )
        .unwrap();
        for f in features {
            let purpose = serde_json::to_value(f.purpose).unwrap();
            write!(svg, "{} id=\"{}\" data-feature-id=\"{}\" data-purpose=\"{}\" transform=\"translate({} {}) rotate({})\"", geometry(f), identity(&footprint.key, &layer, &f.id), escape(&f.id)?, purpose.as_str().unwrap(), i128::from(f.at[0]) * 2, i128::from(f.at[1]) * 2, f.rotation).unwrap();
            if let Some(stroke) = f.stroke {
                write!(
                    svg,
                    " fill=\"none\" stroke-width=\"{}\"",
                    i128::from(stroke) * 2
                )
                .unwrap();
            } else {
                svg.push_str(" stroke=\"none\"");
            }
            svg.push_str(" />\n");
        }
        svg.push_str("</g>\n");
    }
    if !drills.is_empty() {
        drills.sort_by(|a, b| a.id.cmp(&b.id));
        svg.push_str("<g id=\"drills\" data-layer=\"drill\" fill=\"#18202b\" stroke=\"none\">\n");
        for f in drills {
            let d = f.drill.as_ref().unwrap();
            if let Some(size) = d.slot {
                let mut drill = f.clone();
                drill.shape = Shape::Oval { size };
                writeln!(svg, "{} id=\"{}\" data-feature-id=\"{}\" data-purpose=\"drill\" data-plated=\"{}\" data-drill-shape=\"slot\" transform=\"translate({} {}) rotate({})\" />", geometry(&drill), identity(&footprint.key, "drill", &f.id), escape(&f.id)?, d.plated, i128::from(f.at[0]) * 2, i128::from(f.at[1]) * 2, f.rotation).unwrap();
            } else {
                writeln!(svg, "<circle id=\"{}\" data-feature-id=\"{}\" data-purpose=\"drill\" data-plated=\"{}\" cx=\"{}\" cy=\"{}\" r=\"{}\" />", identity(&footprint.key, "drill", &f.id), escape(&f.id)?, d.plated, i128::from(f.at[0]) * 2, i128::from(f.at[1]) * 2, d.diameter).unwrap();
            }
        }
        svg.push_str("</g>\n");
    }
    svg.push_str("</svg>\n");
    Ok(svg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physical::compile_footprint;
    use serde_json::json;

    #[test]
    fn rotated_slots_render_as_capsules_and_legacy_circles_remain_readable() {
        let footprint = compile_footprint(serde_json::from_value(json!({"schemaVersion":2,"key":"slots","features":[
            {"id":"SH","purpose":"pad","at":["1mm","2mm"],"rotation":90,"shape":{"kind":"oval","size":["1mm","2.1mm"]},"layers":["all-copper"],"drill":{"diameter":"0.6mm","slot":["0.6mm","1.7mm"],"plated":true}}
        ]})).unwrap()).unwrap();
        let svg = footprint_svg(&footprint).unwrap();
        assert!(svg.contains(
            "data-drill-shape=\"slot\" transform=\"translate(2000000 4000000) rotate(90)\""
        ));
        assert!(svg.contains("<rect x=\"-600000\" y=\"-1700000\" width=\"1200000\" height=\"3400000\" rx=\"600000\" ry=\"600000\""));
        let mut round = footprint.clone();
        round.features[0].drill.as_mut().unwrap().slot = None;
        round.schema_version = 1;
        assert!(
            footprint_svg(&round)
                .unwrap()
                .contains("cx=\"2000000\" cy=\"4000000\" r=\"600000\"")
        );
    }

    #[test]
    fn exact_decimal_formatting() {
        for (n, expected) in [
            (1, "0.0000005"),
            (-1, "-0.0000005"),
            (2_000_000, "1"),
            (2_540_000, "1.27"),
            (0, "0"),
        ] {
            assert_eq!(mm(n), expected);
        }
        assert_eq!(mm(18_014_398_509_481_982), "9007199254.740991");
    }

    #[test]
    fn primitive_projection_and_stroke_bounds() {
        let footprint = compile_footprint(serde_json::from_value(json!({"schemaVersion":1,"key":"shapes","features":[
            {"id":"oval","purpose":"copper","at":["0nm","0nm"],"shape":{"kind":"oval","size":["9nm","3nm"]},"layers":["back-copper"]},
            {"id":"circle","purpose":"paste-opening","at":["20nm","0nm"],"shape":{"kind":"circle","diameter":"5nm"},"layers":["back-paste"]},
            {"id":"outline","purpose":"fabrication","at":["0nm","0nm"],"shape":{"kind":"rect","size":["20nm","10nm"]},"stroke":"3nm","layers":["front-fabrication"]}
        ]})).unwrap()).unwrap();
        let svg = footprint_svg(&footprint).unwrap();
        assert!(svg.contains("viewBox=\"-23 -13 68 26\""));
        assert!(
            svg.contains("<rect x=\"-9\" y=\"-3\" width=\"18\" height=\"6\" rx=\"3\" ry=\"3\"")
        );
        assert!(svg.contains("<circle cx=\"0\" cy=\"0\" r=\"5\""));
        assert!(svg.contains("fill=\"none\" stroke-width=\"6\""));
        assert!(
            svg.find("data-layer=\"back-copper\"").unwrap()
                < svg.find("data-layer=\"back-paste\"").unwrap()
        );
        assert_ne!(identity("a-b", "c", "d"), identity("a", "b-c", "d"));
        assert_eq!(escape("a\n\"<&").unwrap(), "a&#10;&quot;&lt;&amp;");
    }
}
