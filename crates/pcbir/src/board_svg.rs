//! Board inspection projection: physical realization and explicit constraint intent.
use crate::svg::{escape, geometry_mm as geometry, identity, mm};
use crate::{BoardIr, BoardSide, CompileError, Diagnostic, StackupLayer, TechnicalLayer};
use serde::Serialize;
use std::collections::BTreeSet;
use std::fmt::Write;

#[derive(Debug, Serialize)]
pub struct BoardProjection {
    pub svg: String,
    pub diagnostics: Vec<Diagnostic>,
}
fn invalid(message: &str) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBPREVIEW001", message))
}
use crate::ir::regions::board_length as nm;

struct IntentRegion<'a> {
    owner: &'a str,
    region: &'a str,
    kind: &'static str,
    overlay: &'static str,
    label: String,
    nets: Vec<&'a str>,
    waypoint: Option<usize>,
}

fn intent_regions(ir: &BoardIr) -> Vec<IntentRegion<'_>> {
    let net_name = |id: &str| {
        ir.nets
            .iter()
            .find(|net| net.id.0 == id)
            .map_or(id.to_owned(), |net| net.name.clone())
    };
    let pin_name = |pin: &crate::PinRef| {
        format!(
            "{}.{}",
            ir.parts
                .iter()
                .find(|part| part.id == pin.part)
                .map_or(pin.part.as_str(), |part| part.reference.as_str()),
            pin.name
        )
    };
    let mut result = Vec::new();
    for route in &ir.route_constraints {
        for (index, region) in route.through.iter().enumerate() {
            result.push(IntentRegion {
                owner: &route.id,
                region,
                kind: "route",
                overlay: "waypoints",
                label: format!(
                    "Route {}: {} → {} · waypoint {}",
                    net_name(&route.net.0),
                    pin_name(&route.from),
                    pin_name(&route.to),
                    index + 1
                ),
                nets: vec![&route.net.0],
                waypoint: Some(index + 1),
            });
        }
    }
    for pair in &ir.differential_pairs {
        for (index, region) in pair.through.iter().enumerate() {
            result.push(IntentRegion {
                owner: &pair.id,
                region,
                kind: "differential-pair",
                overlay: "waypoints",
                label: format!(
                    "Differential pair {} / {} · waypoint {}",
                    net_name(&pair.positive.0),
                    net_name(&pair.negative.0),
                    index + 1
                ),
                nets: vec![&pair.positive.0, &pair.negative.0],
                waypoint: Some(index + 1),
            });
        }
    }
    for keepout in &ir.keepouts {
        result.push(IntentRegion {
            owner: &keepout.id,
            region: &keepout.region,
            kind: "keepout",
            overlay: "keepouts",
            label: format!(
                "Keepout · {}",
                keepout
                    .disallow
                    .iter()
                    .map(|r| serde_json::to_value(r)
                        .unwrap()
                        .as_str()
                        .unwrap()
                        .to_owned())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            nets: Vec::new(),
            waypoint: None,
        });
    }
    for zone in &ir.zones {
        result.push(IntentRegion {
            owner: &zone.id,
            region: &zone.boundary,
            kind: "zone",
            overlay: "zones",
            label: format!(
                "Zone intent · {} · {}",
                net_name(&zone.net.0),
                zone.layers.join(", ")
            ),
            nets: vec![&zone.net.0],
            waypoint: None,
        });
    }
    result.sort_by(|a, b| (a.owner, a.waypoint, a.region).cmp(&(b.owner, b.waypoint, b.region)));
    result
}

pub fn board_svg(ir: &BoardIr) -> Result<BoardProjection, CompileError> {
    if ir.schema_version != crate::SCHEMA_VERSION {
        return Err(invalid("unsupported board IR version for preview"));
    }
    let checked = crate::ir::regions::check_regions(ir)?;
    crate::realization::validate_realization(ir)?;
    let outline = ir
        .regions
        .get(&ir.board.outline)
        .ok_or_else(|| invalid("board outline region is missing"))?;
    let [x, y, w, h] = checked.declared[&ir.board.outline].xywh2();
    let mut min = [x, y];
    let mut max = [x + w, y + h];
    let findings = crate::constraint_validation::validate_keepouts(ir, &checked);
    let routes = crate::constraint_validation::validate_route_regions(ir, &checked);
    let mut diagnostics = checked.diagnostics;
    diagnostics.extend(findings.diagnostics);
    diagnostics.extend(routes.diagnostics);
    if let Some(index) = diagnostics
        .iter()
        .position(|d| matches!(d.severity, crate::Severity::Error))
    {
        let fatal = diagnostics.remove(index);
        return Err(CompileError::diagnostic(fatal).with_diagnostics(diagnostics));
    }
    let mut parts: Vec<_> = ir.parts.iter().collect();
    parts.sort_by(|a, b| a.id.cmp(&b.id));
    let mut ids = BTreeSet::new();
    for part in &parts {
        if part.id.trim().is_empty() || !ids.insert(&part.id) {
            return Err(invalid("duplicate placed part ID"));
        }
        escape(&part.id)?;
        if part.physical_features.is_empty() {
            diagnostics.push(
                Diagnostic::warning(
                    "PCBPREVIEW002",
                    if part.at.is_none() {
                        "part has no placement; no geometry is drawn"
                    } else {
                        "part has no canonical physical footprint; no geometry is drawn"
                    },
                )
                .with_entity(&part.id),
            );
        } else {
            let features: Vec<_> = part
                .physical_features
                .values()
                .map(|f| f.geometry.clone())
                .collect();
            let bounds = crate::physical::bounds(&features)?;
            for axis in 0..2 {
                min[axis] = min[axis].min(i128::from(bounds.min2[axis]));
                max[axis] = max[axis].max(i128::from(bounds.max2[axis]));
            }
        }
    }
    let mut outside =
        crate::compiler::validate::validate_board_outline(&ir.parts, &outline.geometry, ir.units)?;
    if !outside.is_empty() {
        let fatal = outside.remove(0);
        return Err(CompileError::diagnostic(fatal).with_diagnostics(outside));
    }
    let intents = intent_regions(ir);
    for intent in &intents {
        let bounds = checked.declared[intent.region];
        for axis in 0..2 {
            min[axis] = min[axis].min(bounds.min2[axis]);
            max[axis] = max[axis].max(bounds.max2[axis]);
        }
    }
    // Include constraint intent and assembly reservations/documentation that may extend outside the board.
    let pad = (w.max(h) / 25).max(2_000_000);
    let vx = min[0] - pad;
    let vy = min[1] - pad;
    let vw = max[0] - min[0] + pad * 2;
    let vh = max[1] - min[1] + pad * 2;
    let mut svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}mm\" height=\"{}mm\" viewBox=\"{} {} {} {}\" data-units=\"mm\" role=\"img\" aria-label=\"Board placement preview\">\n<title>{}</title>\n<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"#e3f0ea\" stroke=\"#587a70\" stroke-width=\"0.08\" />\n",
        mm(vw),
        mm(vh),
        mm(vx),
        mm(vy),
        mm(vw),
        mm(vh),
        escape(&ir.board.id)?,
        mm(x),
        mm(y),
        mm(w),
        mm(h)
    );
    let mut layers = Vec::new();
    let copper: Vec<_> = ir
        .board
        .layers
        .stackup
        .entries
        .iter()
        .filter_map(|layer| {
            if let StackupLayer::Copper { id, .. } = layer {
                Some(id.as_str())
            } else {
                None
            }
        })
        .collect();
    for (index, id) in copper.iter().enumerate() {
        let color = if index == 0 {
            "#bd6a27"
        } else if index == copper.len() - 1 {
            "#5176ac"
        } else {
            "#8173a4"
        };
        layers.push((*id, "copper", color));
    }
    for layer in &ir.board.layers.technical {
        let (kind, color) = match layer {
            TechnicalLayer::SolderMask { .. } => ("solder-mask", "#398f78"),
            TechnicalLayer::Paste { .. } => ("paste", "#8d99ae"),
            TechnicalLayer::Silkscreen { .. } => ("silkscreen", "#f5faf7"),
            TechnicalLayer::Mechanical { .. } => ("mechanical", "#6379b8"),
        };
        layers.push((layer.id(), kind, color));
    }
    let mut layer_ids = BTreeSet::new();
    for (layer, kind, color) in layers {
        if !layer_ids.insert(layer) {
            return Err(invalid("duplicate board layer ID"));
        }
        writeln!(
            svg,
            "<g data-layer-id=\"{}\" data-kind=\"{kind}\" fill=\"{color}\" stroke=\"{color}\">",
            escape(layer)?
        )
        .unwrap();
        for part in &parts {
            for f in part
                .physical_features
                .values()
                .filter(|f| f.layers.iter().any(|id| id == layer))
            {
                let f = &f.geometry;
                write!(svg, "{} id=\"{}\" data-part-id=\"{}\" data-feature-id=\"{}\" data-purpose=\"{}\" transform=\"translate({} {}) rotate({})\"", geometry(f), identity(&part.id, &format!("layer/{layer}"), &f.id), escape(&part.id)?, escape(&f.id)?, serde_json::to_value(f.purpose).unwrap().as_str().unwrap(), mm(i128::from(f.at[0])*2), mm(i128::from(f.at[1])*2), f.rotation).unwrap();
                if let Some(stroke) = f.stroke {
                    write!(
                        svg,
                        " fill=\"none\" stroke-width=\"{}\"",
                        mm(i128::from(stroke) * 2)
                    )
                    .unwrap();
                } else {
                    svg.push_str(" stroke=\"none\"");
                }
                writeln!(
                    svg,
                    "><title>{}: {}</title></{}>",
                    escape(&part.reference)?,
                    escape(&f.id)?,
                    if matches!(f.shape, crate::physical::Shape::Circle { .. }) {
                        "circle"
                    } else {
                        "rect"
                    }
                )
                .unwrap();
            }
        }
        svg.push_str("</g>\n");
    }
    svg.push_str("<g data-overlay=\"drills\" fill=\"#1a3546\">\n");
    for part in &parts {
        for f in part
            .physical_features
            .values()
            .filter(|f| f.geometry.drill.is_some())
        {
            let mut shape = f.geometry.clone();
            let drill = shape.drill.as_ref().unwrap();
            shape.shape = if let Some(size) = drill.slot {
                crate::physical::Shape::Oval { size }
            } else {
                crate::physical::Shape::Circle {
                    diameter: drill.diameter,
                }
            };
            writeln!(svg, "{} id=\"{}\" data-part-id=\"{}\" data-feature-id=\"{}\" data-purpose=\"drill\" transform=\"translate({} {}) rotate({})\" />", geometry(&shape), identity(&part.id,"overlay/drill",&shape.id), escape(&part.id)?, escape(&shape.id)?, mm(i128::from(shape.at[0])*2), mm(i128::from(shape.at[1])*2), shape.rotation).unwrap();
        }
    }
    svg.push_str("</g>\n");
    for (overlay, color, dash) in [
        ("zones", "#28988d", ""),
        ("keepouts", "#ac536d", "0.25 0.15"),
        ("waypoints", "#8173c5", "0.08 0.12"),
    ] {
        writeln!(svg, "<g data-overlay=\"{overlay}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"0.06\" stroke-dasharray=\"{dash}\"> ").unwrap();
        for intent in intents.iter().filter(|intent| intent.overlay == overlay) {
            let [x, y, w, h] = checked.declared[intent.region].xywh2();
            writeln!(svg, "<rect data-constraint-id=\"{}\" data-constraint-type=\"{}\" data-region-id=\"{}\" data-waypoint=\"{}\" data-net-ids=\"{}\" data-label=\"{}\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" tabindex=\"0\" role=\"button\" aria-label=\"{}\"><title>{}</title></rect>",
                escape(intent.owner)?, intent.kind, escape(intent.region)?, intent.waypoint.map_or(String::new(), |n| n.to_string()),
                escape(&serde_json::to_string(&intent.nets).unwrap())?, escape(&intent.label)?, mm(x), mm(y), mm(w), mm(h), escape(&intent.label)?, escape(&intent.label)?).unwrap();
        }
        svg.push_str("</g>\n");
    }
    for (side, name) in [(BoardSide::Front, "front"), (BoardSide::Back, "back")] {
        let references: Vec<_> = parts
            .iter()
            .filter(|part| part.side == side && part.at.is_some())
            .collect();
        if references.is_empty() {
            continue;
        }
        writeln!(svg, "<g data-overlay=\"references\" data-side=\"{name}\" font-family=\"monospace\" font-size=\"0.8\" fill=\"#1a3546\" stroke=\"#f9fbfd\" stroke-width=\"0.05\" paint-order=\"stroke\" text-anchor=\"middle\">").unwrap();
        for part in references {
            let at = part.at.unwrap();
            writeln!(
                svg,
                "<text data-part-id=\"{}\" x=\"{}\" y=\"{}\">{}</text>",
                escape(&part.id)?,
                mm(i128::from(nm(at[0], ir.units)?) * 2),
                mm(i128::from(nm(at[1], ir.units)?) * 2 - 2_000_000),
                escape(&part.reference)?
            )
            .unwrap();
        }
        svg.push_str("</g>\n");
    }
    svg.push_str("</svg>\n");
    Ok(BoardProjection { svg, diagnostics })
}
