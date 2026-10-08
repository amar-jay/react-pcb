//! Restricted absolute, fixed-size Flexbox, and explicit Grid layout authoring. Frontend declarations never enter IR.
use crate::physical::{self, Bounds, Drill, Feature, PhysicalFootprint, Purpose, Role, Shape};
use crate::{CompileError, DeclarationNode, Diagnostic};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub const LAYOUT_PROTOCOL_VERSION: u32 = 1;
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FootprintDeclarations {
    pub protocol_version: u32,
    pub kind: String,
    pub root: DeclarationNode,
}

fn invalid(message: impl Into<String>) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBFP002", message).with_help(
        "Use fixed physical dimensions, absolute offsets, row/column Flexbox, or explicit Grid tracks, and supported typed transforms. See docs/physical-footprints.md.",
    ))
}
fn attach(mut error: CompileError, node: &DeclarationNode, entity: &str) -> CompileError {
    if error.diagnostic.entity.is_none() {
        error.diagnostic.entity = Some(entity.into());
    }
    let mut retained = error
        .diagnostic
        .source
        .take()
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    // A child's identity hint must not prevent inheritance of the nearest
    // available file location. Never mix locations from two different files.
    if !retained.contains_key("file")
        && let Some(source) = node.props.get("source").and_then(Value::as_object)
    {
        for (key, value) in source {
            retained.entry(key.clone()).or_insert_with(|| value.clone());
        }
    }
    if let Some(key) = &node.source_key {
        retained
            .entry("sourceKey".to_owned())
            .or_insert_with(|| json!(key));
    }
    if !retained.is_empty() {
        error.diagnostic.source = Some(Box::new(Value::Object(retained)));
    }

    error
}
fn object<'a>(
    value: &'a Value,
    label: &str,
) -> Result<&'a serde_json::Map<String, Value>, CompileError> {
    value
        .as_object()
        .ok_or_else(|| invalid(format!("{label} must be an object")))
}
fn keys(value: &Value, allowed: &[&str], label: &str) -> Result<(), CompileError> {
    for key in object(value, label)?.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(invalid(format!("unsupported {label} property {key}")));
        }
    }
    Ok(())
}
fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str, CompileError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(format!("{key} must be a string")))
}
fn length(value: &Value, key: &str) -> Result<i64, CompileError> {
    physical::length(string(value, key)?).map_err(|mut error| {
        error.diagnostic.message = format!("{key}: {}", error.diagnostic.message);
        error
    })
}
fn name(node: &DeclarationNode) -> Result<Option<&str>, CompileError> {
    node.props
        .get("name")
        .map(|_| {
            let name = string(&node.props, "name")?;
            if name.trim().is_empty() {
                return Err(invalid("name must not be empty"));
            }
            Ok(name)
        })
        .transpose()
}

/// Exact affine transform in doubled nanometres; entries are -1, 0, or 1.
#[derive(Clone, Copy)]
struct Transform {
    a: [[i128; 2]; 2],
    t: [i128; 2],
}
impl Transform {
    const IDENTITY: Self = Self {
        a: [[1, 0], [0, 1]],
        t: [0, 0],
    };
    fn linear(self, p: [i128; 2]) -> [i128; 2] {
        [
            self.a[0][0] * p[0] + self.a[0][1] * p[1],
            self.a[1][0] * p[0] + self.a[1][1] * p[1],
        ]
    }
    fn apply(self, p: [i128; 2]) -> [i128; 2] {
        let p = self.linear(p);
        [p[0] + self.t[0], p[1] + self.t[1]]
    }
    fn compose(self, child: Self) -> Self {
        let x = self.linear([child.a[0][0], child.a[1][0]]);
        let y = self.linear([child.a[0][1], child.a[1][1]]);
        Self {
            a: [[x[0], y[0]], [x[1], y[1]]],
            t: self.apply(child.t),
        }
    }
    fn rotation(self) -> u16 {
        match [self.a[0][0], self.a[1][0]] {
            [1, 0] => 0,
            [0, 1] => 90,
            [-1, 0] => 180,
            _ => 270,
        }
    }
}
#[derive(Clone, Copy)]
enum Alignment {
    Start,
    Center,
    End,
}
impl Alignment {
    // Doubled-nm origins retain exact half-nm alignment without rounding.
    fn offset2(self, free: i128) -> i128 {
        match self {
            Self::Start => 0,
            Self::Center => free,
            Self::End => free * 2,
        }
    }
}
struct Flex {
    axis: usize,
    gap: i64,
    justify: Alignment,
    align: Alignment,
}
fn flex(style: &Value, container: bool) -> Result<Option<Flex>, CompileError> {
    let properties = ["flexDirection", "gap", "justifyContent", "alignItems"];
    if style.get("display").is_none() {
        if properties.iter().any(|key| style.get(key).is_some()) {
            return Err(invalid("layout properties require display: flex or grid"));
        }
        return Ok(None);
    }
    if style["display"].as_str() == Some("grid") {
        if ["flexDirection", "justifyContent"]
            .iter()
            .any(|key| style.get(key).is_some())
        {
            return Err(invalid(
                "flexDirection and justifyContent require display: flex",
            ));
        }
        return Ok(None);
    }
    if !container {
        return Err(invalid(
            "unsupported style property display on a physical feature; only containers support flex",
        ));
    }
    if style["display"].as_str() != Some("flex") {
        return Err(invalid("display must be flex or grid"));
    }
    let axis = match style.get("flexDirection").map(Value::as_str) {
        None | Some(Some("row")) => 0,
        Some(Some("column")) => 1,
        _ => return Err(invalid("flexDirection must be row or column")),
    };
    let gap = style
        .get("gap")
        .map(|_| length(style, "gap"))
        .transpose()?
        .unwrap_or(0);
    if gap < 0 {
        return Err(invalid("flex gap must not be negative"));
    }
    let alignment = |key: &str| -> Result<Alignment, CompileError> {
        match style.get(key).map(Value::as_str) {
            None | Some(Some("flex-start")) => Ok(Alignment::Start),
            Some(Some("center")) => Ok(Alignment::Center),
            Some(Some("flex-end")) => Ok(Alignment::End),
            _ => Err(invalid(format!(
                "{key} must be flex-start, center, or flex-end; distributed spacing and stretch are unsupported"
            ))),
        }
    };
    Ok(Some(Flex {
        axis,
        gap,
        justify: alignment("justifyContent")?,
        align: alignment("alignItems")?,
    }))
}

const GRID_PLACEMENT: [&str; 4] = ["gridColumn", "gridRow", "gridColumnSpan", "gridRowSpan"];
struct Track {
    offset: i128,
    size: i64,
}
struct Grid {
    tracks: [Vec<Track>; 2],
    alignment: [Alignment; 2],
}
fn grid(style: &Value, container: bool, size: [i64; 2]) -> Result<Option<Grid>, CompileError> {
    let properties = ["gridTemplateColumns", "gridTemplateRows", "justifyItems"];
    if style.get("display").and_then(Value::as_str) != Some("grid") {
        if properties.iter().any(|key| style.get(key).is_some()) {
            return Err(invalid("grid container properties require display: grid"));
        }
        return Ok(None);
    }
    if !container {
        return Err(invalid("only containers support display: grid"));
    }
    let gap = style
        .get("gap")
        .map(|_| length(style, "gap"))
        .transpose()?
        .unwrap_or(0);
    if gap < 0 {
        return Err(invalid("grid gap must not be negative"));
    }
    let mut tracks = [Vec::new(), Vec::new()];
    for (axis, key) in [(0, "gridTemplateColumns"), (1, "gridTemplateRows")] {
        let values = style
            .get(key)
            .and_then(Value::as_array)
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                invalid(format!(
                    "{key} requires a nonempty array of explicit physical track sizes"
                ))
            })?;
        let mut offset = 0_i128;
        for value in values {
            let track_size = physical::length(value.as_str().ok_or_else(|| {
                invalid(format!("{key} track sizes must be physical-unit strings"))
            })?)?;
            if track_size <= 0 {
                return Err(invalid(format!("{key} track sizes must be positive")));
            }
            tracks[axis].push(Track {
                offset,
                size: track_size,
            });
            offset += i128::from(track_size) + i128::from(gap);
        }
        if offset - i128::from(gap) > i128::from(size[axis]) {
            return Err(invalid(format!(
                "{key} tracks and gaps exceed container size"
            )));
        }
    }
    let alignment = |key: &str| -> Result<Alignment, CompileError> {
        match style.get(key).map(Value::as_str) {
            None | Some(Some("start")) => Ok(Alignment::Start),
            Some(Some("center")) => Ok(Alignment::Center),
            Some(Some("end")) => Ok(Alignment::End),
            _ => Err(invalid(format!(
                "grid {key} must be start, center, or end; stretch is unsupported"
            ))),
        }
    };
    Ok(Some(Grid {
        tracks,
        alignment: [alignment("justifyItems")?, alignment("alignItems")?],
    }))
}
impl Grid {
    fn origin(&self, props: &Value) -> Result<Option<[i128; 2]>, CompileError> {
        let style = props
            .get("style")
            .ok_or_else(|| invalid("style is required"))?;
        if style.get("position").and_then(Value::as_str) == Some("absolute") {
            return Ok(None);
        }
        let mut origin = [0; 2];
        for (axis, start_key, span_key, dimension) in [
            (0, "gridColumn", "gridColumnSpan", "width"),
            (1, "gridRow", "gridRowSpan", "height"),
        ] {
            let index = |value: &Value, key: &str| -> Result<usize, CompileError> {
                value
                    .as_u64()
                    .filter(|n| *n > 0)
                    .and_then(|n| usize::try_from(n).ok())
                    .ok_or_else(|| invalid(format!("{key} must be a positive integer")))
            };
            let start = index(
                style.get(start_key).ok_or_else(|| {
                    invalid(format!("grid flow child requires explicit {start_key}"))
                })?,
                start_key,
            )? - 1;
            let span = style
                .get(span_key)
                .map(|v| index(v, span_key))
                .transpose()?
                .unwrap_or(1);
            let end = start
                .checked_add(span)
                .filter(|end| *end <= self.tracks[axis].len())
                .ok_or_else(|| {
                    invalid(format!(
                        "{start_key} and {span_key} reference tracks outside the explicit grid"
                    ))
                })?;
            let first = &self.tracks[axis][start];
            let last = &self.tracks[axis][end - 1];
            let cell_size = last.offset + i128::from(last.size) - first.offset;
            let child_size = length(style, dimension)?;
            if child_size <= 0 {
                return Err(invalid(
                    "width and height must be positive physical lengths",
                ));
            }
            if i128::from(child_size) > cell_size {
                return Err(invalid(format!(
                    "grid child {dimension} exceeds its assigned cell or span"
                )));
            }
            origin[axis] =
                2 * first.offset + self.alignment[axis].offset2(cell_size - i128::from(child_size));
        }
        Ok(Some(origin))
    }
}

#[derive(Clone, Copy)]
struct ParentBox {
    size: [i64; 2],
    flow_origin: Option<[i128; 2]>,
    grid_item: bool,
}
struct BoxLayout {
    size: [i64; 2],
    transform: Transform,
}
fn layout(
    style: &Value,
    parent: Option<ParentBox>,
    container: bool,
) -> Result<BoxLayout, CompileError> {
    keys(
        style,
        &[
            "position",
            "width",
            "height",
            "left",
            "right",
            "top",
            "bottom",
            "borderRadius",
            "transform",
            "display",
            "flexDirection",
            "gap",
            "justifyContent",
            "alignItems",
            "gridTemplateColumns",
            "gridTemplateRows",
            "justifyItems",
            "gridColumn",
            "gridRow",
            "gridColumnSpan",
            "gridRowSpan",
        ],
        "style",
    )?;
    if let Some(position) = style.get("position") {
        if position.as_str() != Some("absolute") {
            return Err(invalid("only position: absolute is supported"));
        }
    } else if parent.is_some_and(|p| p.flow_origin.is_none()) {
        return Err(invalid("child style requires position: absolute"));
    }
    let size = [length(style, "width")?, length(style, "height")?];
    if size.iter().any(|n| *n <= 0) {
        return Err(invalid(
            "width and height must be positive physical lengths",
        ));
    }
    if container && style.get("borderRadius").is_some() {
        return Err(invalid(
            "layout containers cannot have borderRadius or manufacturing geometry",
        ));
    }
    flex(style, container)?;
    grid(style, container, size)?;
    if GRID_PLACEMENT.iter().any(|key| style.get(key).is_some())
        && !parent.is_some_and(|p| p.grid_item)
    {
        return Err(invalid(
            "grid placement properties require a flow child of a grid container",
        ));
    }
    let mut origin = [0_i128; 2];
    for (axis, near, far) in [(0, "left", "right"), (1, "top", "bottom")] {
        let n = style.get(near).map(|_| length(style, near)).transpose()?;
        let f = style.get(far).map(|_| length(style, far)).transpose()?;
        if let Some(flow) = parent.and_then(|p| p.flow_origin) {
            if n.is_some() || f.is_some() || style.get("position").is_some() {
                return Err(invalid("flow children cannot use position or offsets"));
            }
            origin[axis] = flow[axis];
            continue;
        }
        origin[axis] = match (parent, n, f) {
            (Some(_), Some(n), None) => i128::from(n) * 2,
            (Some(p), None, Some(f)) => {
                (i128::from(p.size[axis]) - i128::from(f) - i128::from(size[axis])) * 2
            }
            (None, n, None) => i128::from(n.unwrap_or(0)) * 2,
            (None, _, Some(_)) => {
                return Err(invalid(
                    "root style cannot use right or bottom without a parent box",
                ));
            }
            (_, Some(_), Some(_)) => {
                return Err(invalid(format!("{near} and {far} overdetermine the box")));
            }
            _ => return Err(invalid(format!("absolute box requires {near} or {far}"))),
        };
    }
    let mut transform = Transform::IDENTITY;
    let mut translation = [0_i128; 2];
    if let Some(value) = style.get("transform") {
        keys(
            value,
            &["translate", "rotate", "reflectX", "reflectY"],
            "transform",
        )?;
        let rotation = value
            .get("rotate")
            .map(|v| {
                v.as_u64()
                    .ok_or_else(|| invalid("rotate must be 0, 90, 180, or 270"))
            })
            .transpose()?
            .unwrap_or(0);
        transform.a = match rotation {
            0 => [[1, 0], [0, 1]],
            90 => [[0, -1], [1, 0]],
            180 => [[-1, 0], [0, -1]],
            270 => [[0, 1], [-1, 0]],
            _ => return Err(invalid("rotate must be 0, 90, 180, or 270")),
        };
        for (axis, key) in [(0, "reflectX"), (1, "reflectY")] {
            if value
                .get(key)
                .map(|v| {
                    v.as_bool()
                        .ok_or_else(|| invalid(format!("{key} must be boolean")))
                })
                .transpose()?
                .unwrap_or(false)
            {
                transform.a[0][axis] *= -1;
                transform.a[1][axis] *= -1;
            }
        }
        if let Some(v) = value.get("translate") {
            let v = v
                .as_array()
                .filter(|v| v.len() == 2)
                .ok_or_else(|| invalid("translate requires two physical lengths"))?;
            for axis in 0..2 {
                translation[axis] =
                    i128::from(physical::length(v[axis].as_str().ok_or_else(|| {
                        invalid("translate requires physical-unit strings")
                    })?)?)
                        * 2;
            }
        }
    }
    let center = size.map(i128::from);
    let rotated_center = transform.linear(center);
    transform.t = [
        origin[0] + center[0] - rotated_center[0] + translation[0],
        origin[1] + center[1] - rotated_center[1] + translation[1],
    ];
    Ok(BoxLayout { size, transform })
}
fn source(node: &DeclarationNode) -> Result<(), CompileError> {
    if node
        .source_key
        .as_ref()
        .is_some_and(|key| key.trim().is_empty())
    {
        return Err(invalid("sourceKey must not be empty"));
    }
    if let Some(value) = node.props.get("source") {
        keys(value, &["file", "line", "column"], "source")?;
        if string(value, "file")?.trim().is_empty() {
            return Err(invalid("source.file must not be empty"));
        }
        for key in ["line", "column"] {
            if value
                .get(key)
                .is_some_and(|v| v.as_u64().is_none_or(|n| n == 0))
            {
                return Err(invalid(format!("source.{key} must be a positive integer")));
            }
        }
    }
    Ok(())
}
fn hash(value: &str) -> String {
    let mut hash = 0x6c62272e07bb014262b821756295c58d_u128;
    for byte in value.bytes() {
        hash = (hash ^ u128::from(byte)).wrapping_mul(0x1000000000000000000013b);
    }
    format!("{hash:032x}")
}
struct Compiler<'a> {
    key: &'a str,
    features: Vec<Feature>,
    ids: BTreeSet<String>,
    groups: BTreeSet<String>,
}
fn feature_id(node: &DeclarationNode, scope: &[String], key: &str) -> Result<String, CompileError> {
    let id = name(node)
        .map_err(|e| attach(e, node, key))?
        .map(str::to_owned)
        .unwrap_or_else(|| {
            let anchor = json!([
                scope,
                node.node_type,
                node.props.get("purpose"),
                node.source_key
            ])
            .to_string();
            format!("feature/{}", hash(&anchor))
        });
    Ok(id)
}

impl Compiler<'_> {
    fn children(
        &mut self,
        node: &DeclarationNode,
        box_layout: &BoxLayout,
        transform: Transform,
        scope: &[String],
    ) -> Result<(), CompileError> {
        if let Some(grid) = grid(&node.props["style"], true, box_layout.size)? {
            for child in &node.children {
                let id = feature_id(child, scope, self.key)?;
                let origin = grid
                    .origin(&child.props)
                    .map_err(|e| attach(e, child, &format!("{}/{id}", self.key)))?;
                self.walk(
                    child,
                    ParentBox {
                        size: box_layout.size,
                        grid_item: origin.is_some(),
                        flow_origin: origin,
                    },
                    transform,
                    scope,
                )?;
            }
            return Ok(());
        }
        let flex = flex(&node.props["style"], true)?;
        let mut sizes = Vec::new();
        let mut used = 0_i128;
        let mut has_flow_child = false;
        if let Some(flex) = &flex {
            for child in &node.children {
                let id = feature_id(child, scope, self.key)?;
                let measure = || -> Result<Option<[i64; 2]>, CompileError> {
                    let style = child
                        .props
                        .get("style")
                        .ok_or_else(|| invalid("style is required"))?;
                    if style.get("position").and_then(Value::as_str) == Some("absolute") {
                        return Ok(None);
                    }
                    let size = [length(style, "width")?, length(style, "height")?];
                    if size.iter().any(|n| *n <= 0) {
                        return Err(invalid(
                            "width and height must be positive physical lengths",
                        ));
                    }
                    if size[1 - flex.axis] > box_layout.size[1 - flex.axis] {
                        return Err(invalid(
                            "fixed flex child exceeds container cross-axis size",
                        ));
                    }
                    Ok(Some(size))
                };
                let size =
                    measure().map_err(|e| attach(e, child, &format!("{}/{id}", self.key)))?;
                if let Some(size) = size {
                    if has_flow_child {
                        used += i128::from(flex.gap);
                    }
                    used += i128::from(size[flex.axis]);
                    has_flow_child = true;
                }
                sizes.push(size);
            }
            if used > i128::from(box_layout.size[flex.axis]) {
                return Err(invalid(
                    "fixed flex children and gaps exceed container main-axis size; children never shrink",
                ));
            }
        }
        let mut cursor2 = flex.as_ref().map_or(0, |f| {
            f.justify
                .offset2(i128::from(box_layout.size[f.axis]) - used)
        });
        for (index, child) in node.children.iter().enumerate() {
            let flow_origin = if let Some(flex) = &flex {
                sizes[index].map(|size| {
                    let mut origin = [0; 2];
                    origin[flex.axis] = cursor2;
                    origin[1 - flex.axis] = flex.align.offset2(
                        i128::from(box_layout.size[1 - flex.axis])
                            - i128::from(size[1 - flex.axis]),
                    );
                    cursor2 += 2 * (i128::from(size[flex.axis]) + i128::from(flex.gap));
                    origin
                })
            } else {
                None
            };
            self.walk(
                child,
                ParentBox {
                    size: box_layout.size,
                    flow_origin,
                    grid_item: false,
                },
                transform,
                scope,
            )?;
        }
        Ok(())
    }
    fn walk(
        &mut self,
        node: &DeclarationNode,
        parent: ParentBox,
        transform: Transform,
        scope: &[String],
    ) -> Result<(), CompileError> {
        let id = feature_id(node, scope, self.key)?;
        let entity = format!("{}/{}", self.key, id);
        self.walk_inner(node, parent, transform, scope, &id)
            .map_err(|e| attach(e, node, &entity))
    }
    fn walk_inner(
        &mut self,
        node: &DeclarationNode,
        parent: ParentBox,
        transform: Transform,
        scope: &[String],
        id: &str,
    ) -> Result<(), CompileError> {
        source(node)?;
        let container = node.node_type == "fp-group";
        let allowed: &[&str] = match node.node_type.as_str() {
            "fp-group" => &["name", "style", "source"],
            "fp-pad" => &["name", "style", "source", "shape", "layers", "drill"],
            "fp-hole" => &["name", "style", "source", "plated"],
            "fp-graphic" => &[
                "name", "style", "source", "shape", "layers", "purpose", "stroke",
            ],
            _ => {
                return Err(invalid(format!(
                    "unsupported footprint declaration {}",
                    node.node_type
                )));
            }
        };
        keys(&node.props, allowed, "declaration")?;
        let style = node
            .props
            .get("style")
            .ok_or_else(|| invalid("style is required"))?;
        let box_layout = layout(style, Some(parent), container)?;
        let transform = transform.compose(box_layout.transform);
        if container {
            let mut scope = scope.to_vec();
            if let Some(n) = name(node)? {
                scope.push(format!("name:{n}"));
            } else if let Some(k) = &node.source_key {
                scope.push(format!("key:{k}"));
            }
            // Unnamed, unkeyed layout wrappers do not affect feature identity.
            if (name(node)?.is_some() || node.source_key.is_some())
                && !self.groups.insert(json!(scope).to_string())
            {
                return Err(invalid(
                    "duplicate group identity; use distinct names or React keys",
                ));
            }
            self.children(node, &box_layout, transform, &scope)?;
            return Ok(());
        }
        if !node.children.is_empty() {
            return Err(invalid("footprint features cannot contain children"));
        }
        if !self.ids.insert(id.into()) {
            return Err(invalid(
                "duplicate or ambiguous feature identity; use distinct names or React keys",
            ));
        }
        let purpose = match node.node_type.as_str() {
            "fp-pad" => Purpose::Pad,
            "fp-hole" => {
                if node
                    .props
                    .get("plated")
                    .and_then(Value::as_bool)
                    .ok_or_else(|| invalid("hole plated must be boolean"))?
                {
                    Purpose::PlatedHole
                } else {
                    Purpose::NonPlatedHole
                }
            }
            _ => {
                let purpose: Purpose = serde_json::from_value(
                    node.props
                        .get("purpose")
                        .cloned()
                        .ok_or_else(|| invalid("graphic purpose is required"))?,
                )
                .map_err(|_| invalid("unsupported graphic purpose"))?;
                if matches!(
                    purpose,
                    Purpose::Pad | Purpose::PlatedHole | Purpose::NonPlatedHole
                ) {
                    return Err(invalid("use Pad or Hole for pads and drills"));
                }
                purpose
            }
        };
        let shape_name = if node.node_type == "fp-hole" {
            "circle"
        } else {
            node.props
                .get("shape")
                .map(|_| string(&node.props, "shape"))
                .transpose()?
                .unwrap_or("rect")
        };
        let shape = match shape_name {
            "rect" => Shape::Rect {
                size: box_layout.size,
            },
            "oval" => Shape::Oval {
                size: box_layout.size,
            },
            "rounded-rect" => Shape::RoundedRect {
                size: box_layout.size,
                radius: length(style, "borderRadius")?,
            },
            "circle" => {
                if box_layout.size[0] != box_layout.size[1] {
                    return Err(invalid("circle width and height must be equal"));
                }
                Shape::Circle {
                    diameter: box_layout.size[0],
                }
            }
            _ => return Err(invalid("unsupported feature shape")),
        };
        if shape_name != "rounded-rect" && style.get("borderRadius").is_some() {
            return Err(invalid("borderRadius requires shape: rounded-rect"));
        }
        let position2 = transform.apply(box_layout.size.map(i128::from));
        let mut at = [0_i64; 2];
        for axis in 0..2 {
            if position2[axis] % 2 != 0 {
                return Err(invalid(
                    "layout resolves a half-nanometre feature center; adjust dimensions or offsets",
                ));
            }
            at[axis] = i64::try_from(position2[axis] / 2)
                .map_err(|_| invalid("layout coordinate overflow"))?;
        }
        let hole = node.node_type == "fp-hole";
        let layers: Vec<Role> = if hole {
            Vec::new()
        } else {
            serde_json::from_value(
                node.props
                    .get("layers")
                    .cloned()
                    .ok_or_else(|| invalid("feature layers are required"))?,
            )
            .map_err(|_| invalid("layers must contain semantic footprint roles"))?
        };
        let drill = if hole {
            Some(Drill {
                diameter: box_layout.size[0],
                slot: None,
                plated: purpose == Purpose::PlatedHole,
            })
        } else {
            node.props
                .get("drill")
                .map(|v| {
                    keys(v, &["diameter", "slot", "plated"], "drill")?;
                    Ok(Drill {
                        diameter: length(v, "diameter")?,
                        slot: v
                            .get("slot")
                            .map(|s| {
                                let s = s
                                    .as_array()
                                    .filter(|s| s.len() == 2)
                                    .ok_or_else(|| invalid("slot requires two physical lengths"))?;
                                Ok([
                                    physical::length(s[0].as_str().ok_or_else(|| {
                                        invalid("slot requires physical-unit strings")
                                    })?)?,
                                    physical::length(s[1].as_str().ok_or_else(|| {
                                        invalid("slot requires physical-unit strings")
                                    })?)?,
                                ])
                            })
                            .transpose()?,
                        plated: v
                            .get("plated")
                            .and_then(Value::as_bool)
                            .ok_or_else(|| invalid("drill plated must be boolean"))?,
                    })
                })
                .transpose()?
        };
        let feature = Feature {
            id: id.into(),
            purpose,
            at,
            shape,
            rotation: transform.rotation(),
            layers,
            drill,
            stroke: node
                .props
                .get("stroke")
                .map(|_| length(&node.props, "stroke"))
                .transpose()?,
        };
        let features = vec![feature];
        let bounds = physical::bounds(&features)?;
        let checked = PhysicalFootprint {
            schema_version: physical::FOOTPRINT_VERSION,
            key: self.key.into(),
            units: "nm".into(),
            features,
            bounds,
        };
        checked.validate()?;
        self.features.extend(checked.features);
        Ok(())
    }
}

pub fn compile_layout(input: FootprintDeclarations) -> Result<PhysicalFootprint, CompileError> {
    let root = &input.root;
    let key = name(root)
        .map_err(|e| attach(e, root, "footprint"))?
        .ok_or_else(|| {
            attach(
                invalid("Footprint requires a library name"),
                root,
                "footprint",
            )
        })?;
    let compile = || -> Result<PhysicalFootprint, CompileError> {
        if input.protocol_version != LAYOUT_PROTOCOL_VERSION
            || input.kind != "footprint-declarations"
        {
            return Err(invalid("unsupported footprint declaration protocol"));
        }
        if root.node_type != "fp-footprint" {
            return Err(invalid("footprint root must be fp-footprint"));
        }
        keys(&root.props, &["name", "style", "source"], "declaration")?;
        source(root)?;
        let root_box = layout(
            root.props
                .get("style")
                .ok_or_else(|| invalid("Footprint style is required"))?,
            None,
            true,
        )?;
        let mut compiler = Compiler {
            key,
            features: Vec::new(),
            ids: BTreeSet::new(),
            groups: BTreeSet::new(),
        };
        compiler.children(root, &root_box, root_box.transform, &[])?;
        let bounds: Bounds = physical::bounds(&compiler.features)?;
        let result = PhysicalFootprint {
            schema_version: physical::FOOTPRINT_VERSION,
            key: key.into(),
            units: "nm".into(),
            features: compiler.features,
            bounds,
        };
        result.validate()?;
        Ok(result)
    };
    compile().map_err(|e| attach(e, root, key))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn declaration() -> Value {
        json!({"protocolVersion":1,"kind":"footprint-declarations","root":{
            "type":"fp-footprint","props":{"name":"test:layout","style":{"width":"4mm","height":"4mm"},"source":{"file":"root.tsx","line":1}},"children":[
                {"type":"fp-pad","sourceKey":"pad-key","props":{"name":"P","style":{"position":"absolute","width":"1mm","height":"2mm","right":"0.5mm","bottom":"1mm"},"layers":["front-copper"]}}
            ]
        }})
    }
    fn compile(value: Value) -> Result<PhysicalFootprint, CompileError> {
        compile_layout(serde_json::from_value(value).unwrap())
    }
    #[test]
    fn direct_protocol_coordinates_transforms_and_round_trip() {
        let mut value = declaration();
        let before = value.clone();
        let result = compile(value.clone()).unwrap();
        assert_eq!(result.features[0].at, [3_000_000, 2_000_000]);
        assert_eq!(result.bounds.min2, [5_000_000, 2_000_000]);
        assert_eq!(result.bounds.max2, [7_000_000, 6_000_000]);
        assert_eq!(value, before);
        for (rotation, expected) in [
            (0, [3_000_000, 2_000_000]),
            (90, [2_000_000, 3_000_000]),
            (180, [1_000_000, 2_000_000]),
            (270, [2_000_000, 1_000_000]),
        ] {
            value["root"]["props"]["style"]["transform"] = json!({"rotate":rotation});
            let ir = compile(value.clone()).unwrap();
            assert_eq!(ir.features[0].at, expected);
            assert_eq!(ir.features[0].rotation, rotation);
            let decoded: PhysicalFootprint =
                serde_json::from_value(serde_json::to_value(&ir).unwrap()).unwrap();
            assert_eq!(decoded, ir);
        }
        value["root"]["props"]["style"]["transform"] =
            json!({"reflectX":true,"reflectY":true,"translate":["1mm","2mm"]});
        assert_eq!(
            compile(value).unwrap().features[0].at,
            [2_000_000, 4_000_000]
        );
    }
    #[test]
    fn invalid_direct_declarations_are_scoped_and_never_silently_dropped() {
        let mut cases = Vec::new();
        for (property, bad) in [
            ("position", json!("relative")),
            ("width", json!(null)),
            ("width", json!("1fr")),
            ("left", json!("0mm")),
            ("transform", json!({"rotate":360})),
            ("transform", json!({"translate":["0mm","0mm","1mm"]})),
            ("margin", json!("1mm")),
        ] {
            let mut v = declaration();
            v["root"]["children"][0]["props"]["style"][property] = bad;
            cases.push(v);
        }
        let mut v = declaration();
        v["root"]["children"][0]["props"]["unknown"] = json!(true);
        cases.push(v);
        let mut v = declaration();
        v["root"]["children"][0]["props"]["shape"] = json!("circle");
        cases.push(v);
        let mut v = declaration();
        v["root"]["children"][0]["props"]["drill"] = json!({"diameter":"2mm","plated":true});
        cases.push(v);
        let mut v = declaration();
        v["root"]["children"][0]["props"]["style"]["transform"] =
            json!({"translate":["9007199254740991nm","0mm"]});
        cases.push(v);
        let mut v = declaration();
        v["root"]["children"][0]["props"]["style"]["width"] = json!("1nm");
        cases.push(v);
        let mut v = declaration();
        let child = v["root"]["children"][0].clone();
        v["root"]["children"].as_array_mut().unwrap().push(child);
        cases.push(v);
        for v in cases {
            let error = compile(v).unwrap_err();
            assert_eq!(error.diagnostic.entity.as_deref(), Some("test:layout/P"));
            assert_eq!(
                error.diagnostic.source.as_ref().unwrap()["sourceKey"],
                "pad-key"
            );
            assert_eq!(
                error.diagnostic.source.as_ref().unwrap()["file"],
                "root.tsx"
            );
            assert!(!error.diagnostic.message.is_empty());
        }
        let mut v = declaration();
        v["protocolVersion"] = json!(2);
        let error = compile(v).unwrap_err();
        assert_eq!(error.diagnostic.entity.as_deref(), Some("test:layout"));
        assert_eq!(
            error.diagnostic.source.as_ref().unwrap()["file"],
            "root.tsx"
        );
    }
    #[test]
    fn group_and_graphic_identity_do_not_depend_on_geometry_or_array_positions() {
        let mut v = declaration();
        let mut graphic = v["root"]["children"][0].clone();
        graphic["type"] = json!("fp-graphic");
        graphic["sourceKey"] = json!("graphic-key");
        graphic["props"].as_object_mut().unwrap().remove("name");
        graphic["props"]["purpose"] = json!("silkscreen");
        graphic["props"]["layers"] = json!(["front-silkscreen"]);
        graphic["props"]["stroke"] = json!("0.1mm");
        v["root"]["children"].as_array_mut().unwrap().push(graphic);
        let ir = compile(v.clone()).unwrap();
        v["root"]["children"][1]["props"]["style"]["right"] = json!("0mm");
        v["root"]["children"].as_array_mut().unwrap().reverse();
        let after = compile(v).unwrap();
        assert_eq!(ir.features[0].id, after.features[1].id);
        assert_eq!(ir.features[1].id, after.features[0].id);
        assert_ne!(ir.features[1].at, after.features[0].at);
    }
    fn flex_declaration() -> Value {
        json!({"protocolVersion":1,"kind":"footprint-declarations","root":{
            "type":"fp-footprint","props":{"name":"flex-direct","style":{
                "display":"flex","width":"10nm","height":"10nm",
                "justifyContent":"center","alignItems":"center"
            }},"children":[{"type":"fp-pad","props":{
                "name":"P","style":{"width":"3nm","height":"3nm"},"layers":["front-copper"]
            }}]
        }})
    }
    #[test]
    fn flex_protocol_preserves_exact_half_nm_origins_and_rejects_final_half_nm_centers() {
        let mut v = flex_declaration();
        let ir = compile(v.clone()).unwrap();
        assert_eq!(ir.features[0].at, [5, 5]);
        assert_eq!(ir.bounds.min2, [7, 7]);
        assert_eq!(ir.bounds.max2, [13, 13]);
        v["root"]["props"]["style"]["justifyContent"] = json!("flex-start");
        let error = compile(v).unwrap_err();
        assert_eq!(error.diagnostic.entity.as_deref(), Some("flex-direct/P"));
        assert!(error.diagnostic.message.contains("half-nanometre"));
    }
    #[test]
    fn flex_direct_input_rejects_unsupported_styles_and_overflow() {
        for (property, value, message) in [
            ("gap", json!("-1nm"), "negative"),
            (
                "justifyContent",
                json!("space-between"),
                "distributed spacing",
            ),
            ("flexDirection", json!("row-reverse"), "row or column"),
            ("flexWrap", json!("wrap"), "unsupported style"),
        ] {
            let mut v = flex_declaration();
            v["root"]["props"]["style"][property] = value;
            assert!(compile(v).unwrap_err().diagnostic.message.contains(message));
        }
        // Each individual box is a valid exact JSON length; their sum is wider
        // than the container. Aggregation must not wrap or shrink the children.
        let mut v = flex_declaration();
        v["root"]["props"]["style"]["width"] = json!("9007199254740991nm");
        v["root"]["children"][0]["props"]["style"]["width"] = json!("9007199254740990nm");
        let mut other = v["root"]["children"][0].clone();
        other["props"]["name"] = json!("Q");
        v["root"]["children"].as_array_mut().unwrap().push(other);
        assert!(
            compile(v)
                .unwrap_err()
                .diagnostic
                .message
                .contains("main-axis size")
        );
    }
    #[test]
    fn flex_empty_flow_and_interleaved_absolute_children_do_not_consume_gaps() {
        let mut v = flex_declaration();
        v["root"]["props"]["style"] = json!({
            "display":"flex","width":"10nm","height":"10nm","gap":"2nm"
        });
        v["root"]["children"][0]["props"]["style"] = json!({"width":"2nm","height":"2nm"});
        let mut other = v["root"]["children"][0].clone();
        other["props"]["name"] = json!("Q");
        let absolute = json!({"type":"fp-graphic","props":{
            "name":"body","purpose":"fabrication","layers":["front-fabrication"],
            "style":{"position":"absolute","width":"20nm","height":"20nm","left":"-10nm","top":"-10nm"}
        }});
        v["root"]["children"]
            .as_array_mut()
            .unwrap()
            .extend([absolute.clone(), other]);
        let ir = compile(v.clone()).unwrap();
        assert_eq!(ir.features[0].at, [1, 1]);
        assert_eq!(ir.features[2].at, [5, 1]);
        v["root"]["children"] = json!([absolute]);
        assert_eq!(compile(v).unwrap().features[0].at, [0, 0]);
    }
    fn grid_declaration() -> Value {
        let mut v = flex_declaration();
        v["root"]["props"]["style"] = json!({
            "display":"grid","width":"10nm","height":"10nm",
            "gridTemplateColumns":["4nm","4nm"],"gridTemplateRows":["10nm"],
            "gap":"2nm","justifyItems":"center","alignItems":"center"
        });
        v["root"]["children"][0]["props"]["style"] = json!({
            "width":"2nm","height":"2nm","gridColumn":2,"gridRow":1
        });
        v
    }
    #[test]
    fn grid_protocol_resolves_gaps_spans_and_exact_centers() {
        let mut v = grid_declaration();
        assert_eq!(compile(v.clone()).unwrap().features[0].at, [8, 5]);
        v["root"]["children"][0]["props"]["style"]["gridColumn"] = json!(1);
        v["root"]["children"][0]["props"]["style"]["gridColumnSpan"] = json!(2);
        v["root"]["children"][0]["props"]["style"]["width"] = json!("3nm");
        let ir = compile(v.clone()).unwrap();
        assert_eq!(ir.features[0].at, [5, 5]);
        assert_eq!(ir.bounds.min2, [7, 8]);
        v["root"]["props"]["style"]["justifyItems"] = json!("start");
        assert!(
            compile(v)
                .unwrap_err()
                .diagnostic
                .message
                .contains("half-nanometre")
        );
    }
    #[test]
    fn grid_direct_input_checks_track_references_and_wide_arithmetic() {
        for (key, value) in [
            ("gridColumn", json!(0)),
            ("gridRow", json!(2)),
            ("gridColumn", json!(1.5)),
            ("gridColumn", json!("1 / 3")),
            ("gridRowSpan", json!(0)),
            ("gridColumnSpan", json!(u64::MAX)),
        ] {
            let mut v = grid_declaration();
            v["root"]["children"][0]["props"]["style"][key] = value;
            let error = compile(v).unwrap_err();
            assert_eq!(error.diagnostic.entity.as_deref(), Some("flex-direct/P"));
        }
        let mut v = grid_declaration();
        v["root"]["props"]["style"]["width"] = json!("9007199254740991nm");
        v["root"]["props"]["style"]["gridTemplateColumns"] =
            json!(["9007199254740990nm", "9007199254740990nm"]);
        assert!(
            compile(v)
                .unwrap_err()
                .diagnostic
                .message
                .contains("tracks and gaps exceed")
        );
        for bad in [
            json!([]),
            json!("repeat(2, 4nm)"),
            json!([null]),
            json!(["-1nm"]),
            json!(["1fr"]),
        ] {
            let mut v = grid_declaration();
            v["root"]["props"]["style"]["gridTemplateRows"] = bad;
            assert!(compile(v).is_err());
        }
    }
    #[test]
    fn grid_absolute_children_need_no_cell_and_cannot_claim_tracks() {
        let mut v = grid_declaration();
        v["root"]["children"][0]["props"]["style"] = json!({
            "position":"absolute","width":"2nm","height":"2nm","left":"-2nm","top":"0nm"
        });
        assert_eq!(compile(v.clone()).unwrap().features[0].at, [-1, 1]);
        v["root"]["children"][0]["props"]["style"]["gridColumn"] = json!(1);
        assert!(
            compile(v)
                .unwrap_err()
                .diagnostic
                .message
                .contains("grid placement properties require")
        );
    }
}
