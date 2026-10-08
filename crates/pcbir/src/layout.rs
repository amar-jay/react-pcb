//! Restricted absolute layout authoring. Frontend declarations never enter IR.
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
        "Use fixed physical dimensions, position: absolute, one offset per axis, and supported typed transforms. See docs/physical-footprints.md.",
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
struct BoxLayout {
    size: [i64; 2],
    transform: Transform,
}
fn layout(
    style: &Value,
    parent: Option<[i64; 2]>,
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
        ],
        "style",
    )?;
    if let Some(position) = style.get("position") {
        if position.as_str() != Some("absolute") {
            return Err(invalid("only position: absolute is supported"));
        }
    } else if parent.is_some() {
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
    let mut origin = [0_i128; 2];
    for (axis, near, far) in [(0, "left", "right"), (1, "top", "bottom")] {
        let n = style.get(near).map(|_| length(style, near)).transpose()?;
        let f = style.get(far).map(|_| length(style, far)).transpose()?;
        origin[axis] = match (parent, n, f) {
            (Some(_), Some(n), None) => i128::from(n) * 2,
            (Some(p), None, Some(f)) => {
                (i128::from(p[axis]) - i128::from(f) - i128::from(size[axis])) * 2
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
impl Compiler<'_> {
    fn walk(
        &mut self,
        node: &DeclarationNode,
        parent: [i64; 2],
        transform: Transform,
        scope: &[String],
    ) -> Result<(), CompileError> {
        let id = name(node)
            .map_err(|e| attach(e, node, self.key))?
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
        let entity = format!("{}/{}", self.key, id);
        self.walk_inner(node, parent, transform, scope, &id)
            .map_err(|e| attach(e, node, &entity))
    }
    fn walk_inner(
        &mut self,
        node: &DeclarationNode,
        parent: [i64; 2],
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
            for child in &node.children {
                self.walk(child, box_layout.size, transform, &scope)?;
            }
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
        for node in &root.children {
            compiler.walk(node, root_box.size, root_box.transform, &[])?;
        }
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
}
