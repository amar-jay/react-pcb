//! Board inspection projection. Only realized physical geometry is drawn.
use crate::svg::{escape, geometry_mm as geometry, identity, mm};
use crate::{
    BoardIr, BoardSide, CompileError, Diagnostic, LengthUnit, StackupLayer, TechnicalLayer,
};
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
fn nm(value: f64, units: LengthUnit) -> Result<i64, CompileError> {
    let unit = match units {
        LengthUnit::Mm => "mm",
        LengthUnit::Mil => "mil",
        LengthUnit::In => "in",
    };
    crate::physical::length(&format!("{value}{unit}"))
}
fn rect(region: &crate::Rect, units: LengthUnit) -> Result<[i128; 4], CompileError> {
    let result = [region.x, region.y, region.width, region.height]
        .map(|v| nm(v, units).map(|n| i128::from(n) * 2));
    let [x, y, w, h] = result;
    let result = [x?, y?, w?, h?];
    if result[2] <= 0 || result[3] <= 0 {
        return Err(invalid("preview regions must have positive dimensions"));
    }
    Ok(result)
}

pub fn board_svg(ir: &BoardIr) -> Result<BoardProjection, CompileError> {
    if ir.schema_version != crate::SCHEMA_VERSION {
        return Err(invalid("unsupported board IR version for preview"));
    }
    let outline = ir
        .regions
        .get(&ir.board.outline)
        .ok_or_else(|| invalid("board outline region is missing"))?;
    let [x, y, w, h] = rect(&outline.geometry, ir.units)?;
    let mut min = [x, y];
    let mut max = [x + w, y + h];
    let mut diagnostics = vec![];
    let mut parts: Vec<_> = ir.parts.iter().collect();
    parts.sort_by(|a, b| a.id.cmp(&b.id));
    let mut ids = BTreeSet::new();
    for part in &parts {
        if part.id.trim().is_empty() || !ids.insert(&part.id) {
            return Err(invalid("duplicate placed part ID"));
        }
        escape(&part.id)?;
        let definition = ir
            .footprint_definitions
            .get(&part.footprint)
            .ok_or_else(|| invalid("part footprint definition is missing"))?;
        // Verify submitted realization against its authoritative definition and placement.
        if let Some(physical) = &definition.physical {
            physical.validate()?;
            if let Some(at) = part.at {
                if ![0.0, 90.0, 180.0, 270.0].contains(&part.rotation) {
                    return Err(invalid("physical preview requires quarter-turn placement"));
                }
                let expected = physical.place(
                    [nm(at[0], ir.units)?, nm(at[1], ir.units)?],
                    part.rotation as u16,
                    part.side == BoardSide::Back,
                    &ir.board.layers,
                )?;
                if expected != part.physical_features {
                    return Err(invalid(
                        "placed geometry does not match its footprint and placement",
                    ));
                }
            } else if !part.physical_features.is_empty() {
                return Err(invalid("unplaced part cannot have world geometry"));
            }
        } else if !part.physical_features.is_empty() {
            return Err(invalid(
                "world geometry requires a physical footprint definition",
            ));
        }
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
    // Include geometry outside the board, without clipping or silently moving it.
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
    svg.push_str("</g>\n<g data-overlay=\"constraints\" fill=\"none\" stroke=\"#ac536d\" stroke-width=\"0.06\" stroke-dasharray=\"0.25 0.15\">\n");
    let regions: BTreeSet<_> = ir
        .keepouts
        .iter()
        .map(|k| &k.region)
        .chain(ir.route_constraints.iter().flat_map(|r| r.through.iter()))
        .chain(ir.differential_pairs.iter().flat_map(|r| r.through.iter()))
        .collect();
    for id in regions {
        let region = ir
            .regions
            .get(id)
            .ok_or_else(|| invalid("constraint region is missing"))?;
        let [x, y, w, h] = rect(&region.geometry, ir.units)?;
        writeln!(svg, "<rect data-region-id=\"{}\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"><title>Constraint region: {}</title></rect>", escape(id)?, mm(x), mm(y), mm(w), mm(h), escape(id)?).unwrap();
    }
    svg.push_str("</g>\n<g data-overlay=\"references\" font-family=\"monospace\" font-size=\"0.8\" fill=\"#1a3546\" stroke=\"#f9fbfd\" stroke-width=\"0.05\" paint-order=\"stroke\" text-anchor=\"middle\">\n");
    for part in &parts {
        if let Some(at) = part.at {
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
    }
    svg.push_str("</g>\n</svg>\n");
    Ok(BoardProjection { svg, diagnostics })
}
