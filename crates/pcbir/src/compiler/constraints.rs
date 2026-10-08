use super::{
    CompileError,
    parse::{
        parse_pin, parse_rect, require_name, string, validate_keepout, validate_zone, value_number,
    },
};
use crate::Diagnostic;
use crate::ir::{
    DifferentialPairConstraint, KeepoutConstraint, LayerSet, NetId, PinRef, RegionDefinition,
    RouteConstraint, StackupLayer, ZoneConstraint,
};
use crate::protocol::DeclarationNode;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub(super) struct Constraints {
    pub routes: Vec<RouteConstraint>,
    pub pairs: Vec<DifferentialPairConstraint>,
    pub zones: Vec<ZoneConstraint>,
    pub keepouts: Vec<KeepoutConstraint>,
    pub regions: BTreeMap<String, RegionDefinition>,
    ids: BTreeMap<String, String>,
}

// Fixed FNV-1a 128-bit algorithm, independent of Rust's randomized hashers.
// The registry checks collisions before assigning an ID.
fn encode(value: &str) -> String {
    let mut hash = 0x6c62272e07bb014262b821756295c58d_u128;
    for byte in value.bytes() {
        hash = (hash ^ u128::from(byte)).wrapping_mul(0x1000000000000000000013b);
    }
    format!("{hash:032x}")
}
impl Constraints {
    fn identity(
        &mut self,
        kind: &str,
        scope: Option<&str>,
        node: &DeclarationNode,
        anchor: Value,
    ) -> Result<String, CompileError> {
        if let Some(key) = &node.source_key {
            require_name(key, "source identity", "PCBIR029")?;
        }
        let identity = json!([
            scope.unwrap_or(""),
            node.source_key,
            if node.source_key.is_some() {
                Value::Null
            } else {
                anchor
            }
        ])
        .to_string();
        let id = format!("{kind}/{}", encode(&identity));
        if let Some(previous) = self.ids.insert(id.clone(), identity.clone()) {
            if previous != identity {
                return Err(CompileError::invalid("compiler identity hash collision"));
            }
            return Err(CompileError::diagnostic(Diagnostic::error("PCBIR029", "ambiguous declaration identity")
                .with_entity(id).with_help("Distinguish repeated anonymous declarations with frontend identity hints, such as React keys. No JSX IR ID is required.")));
        }
        Ok(id)
    }
    fn region(&mut self, id: String, value: &Value) -> Result<String, CompileError> {
        let geometry = parse_rect(value)?;
        if self
            .regions
            .insert(
                id.clone(),
                RegionDefinition {
                    id: id.clone(),
                    geometry,
                },
            )
            .is_some()
        {
            return Err(CompileError::invalid("duplicate region identity"));
        }
        Ok(id)
    }
    fn through(
        &mut self,
        node: &DeclarationNode,
        owner: &str,
    ) -> Result<Vec<String>, CompileError> {
        node.children
            .iter()
            .map(|child| {
                if child.node_type != "pcb-route-through" {
                    return Err(CompileError::invalid(
                        "routing constraints may only contain route-through declarations",
                    ));
                }
                let id = self.identity("region", Some(owner), child, Value::Null)?;
                self.region(id, property(&child.props, "region")?)
            })
            .collect()
    }
    pub fn route(
        &mut self,
        node: &DeclarationNode,
        scope: Option<&str>,
    ) -> Result<(), CompileError> {
        let net = net(property(&node.props, "net")?)?;
        let from = parse_pin(property(&node.props, "from")?)?;
        let to = parse_pin(property(&node.props, "to")?)?;
        distinct(&from, &to)?;
        let width = positive(&node.props, "width")?;
        let id = self.identity("route", scope, node, json!([net, from, to]))?;
        let through = self.through(node, &id)?;
        self.routes.push(RouteConstraint {
            id,
            net,
            from,
            to,
            width,
            through,
        });
        Ok(())
    }
    pub fn pair(
        &mut self,
        node: &DeclarationNode,
        scope: Option<&str>,
    ) -> Result<(), CompileError> {
        let positive_net = net(property(&node.props, "positive")?)?;
        let negative = net(property(&node.props, "negative")?)?;
        if positive_net == negative {
            return Err(CompileError::invalid("differential pair nets must differ"));
        }
        let endpoints = |name: &str| -> Result<[PinRef; 2], CompileError> {
            let values = property(&node.props, name)?
                .as_array()
                .filter(|values| values.len() == 2)
                .ok_or_else(|| {
                    CompileError::invalid("differential pair endpoints must contain two pins")
                })?;
            Ok([parse_pin(&values[0])?, parse_pin(&values[1])?])
        };
        let from = endpoints("from")?;
        let to = endpoints("to")?;
        distinct(&from[0], &to[0])?;
        distinct(&from[1], &to[1])?;
        let width = positive(&node.props, "width")?;
        let gap = positive(&node.props, "gap")?;
        let target_impedance = positive(&node.props, "targetImpedance")?;
        let id = self.identity(
            "differential-pair",
            scope,
            node,
            json!([positive_net, negative, from, to]),
        )?;
        let through = self.through(node, &id)?;
        self.pairs.push(DifferentialPairConstraint {
            id,
            positive: positive_net,
            negative,
            from,
            to,
            width,
            gap,
            target_impedance,
            through,
        });
        Ok(())
    }
    pub fn zone(
        &mut self,
        node: &DeclarationNode,
        scope: Option<&str>,
        board_layers: &LayerSet,
    ) -> Result<(), CompileError> {
        validate_zone(&node.props)?;
        let net = net(property(&node.props, "net")?)?;
        let mut layers = Vec::new();
        for value in property(&node.props, "layers")?.as_array().unwrap() {
            let id = value
                .as_str()
                .map(str::to_owned)
                .map(Ok)
                .unwrap_or_else(|| string(value, "id"))?;
            if !board_layers
                .stackup
                .entries
                .iter()
                .any(|layer| matches!(layer, StackupLayer::Copper {id: known, ..} if known == &id))
            {
                return Err(CompileError::diagnostic(
                    Diagnostic::error("PCBIR028", "zone references an unknown or non-copper layer")
                        .with_entity(id),
                ));
            }
            layers.push(id);
        }
        layers.sort();
        if layers.windows(2).any(|ids| ids[0] == ids[1]) {
            return Err(CompileError::invalid("zone contains duplicate layer IDs"));
        }
        let id = self.identity("zone", scope, node, json!([net, layers]))?;
        let boundary = match property(&node.props, "boundary")? {
            Value::String(value) if value == "board" => "region/board-outline".to_owned(),
            value => self.region(format!("region/{id}/boundary"), value)?,
        };
        let clearance = node.props.get("clearance").map(value_number).transpose()?;
        self.zones.push(ZoneConstraint {
            id,
            net,
            layers,
            boundary,
            clearance,
        });
        Ok(())
    }
    pub fn keepout(
        &mut self,
        node: &DeclarationNode,
        scope: Option<&str>,
    ) -> Result<(), CompileError> {
        validate_keepout(&node.props)?;
        let id = self.identity("keepout", scope, node, Value::Null)?;
        let region = self.region(
            format!("region/{id}/boundary"),
            property(&node.props, "region")?,
        )?;
        let mut disallow: Vec<_> = property(&node.props, "disallow")?
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap().to_owned())
            .collect();
        disallow.sort();
        let mut except = Vec::new();
        if let Some(values) = node.props.get("except") {
            for value in values
                .as_array()
                .ok_or_else(|| CompileError::invalid("keepout exceptions must be an array"))?
            {
                except.push(net(value)?);
            }
        }
        except.sort();
        self.keepouts.push(KeepoutConstraint {
            id,
            region,
            disallow,
            except,
        });
        Ok(())
    }
    pub fn nets(&self) -> BTreeSet<NetId> {
        self.routes
            .iter()
            .map(|route| route.net.clone())
            .chain(
                self.pairs
                    .iter()
                    .flat_map(|pair| [pair.positive.clone(), pair.negative.clone()]),
            )
            .chain(self.zones.iter().map(|zone| zone.net.clone()))
            .chain(
                self.keepouts
                    .iter()
                    .flat_map(|keepout| keepout.except.iter().cloned()),
            )
            .collect()
    }
    pub fn endpoint_routes(&self) -> Vec<RouteConstraint> {
        self.routes
            .clone()
            .into_iter()
            .chain(self.pairs.iter().flat_map(|pair| {
                (0..2).map(|index| RouteConstraint {
                    id: pair.id.clone(),
                    net: if index == 0 {
                        pair.positive.clone()
                    } else {
                        pair.negative.clone()
                    },
                    from: pair.from[index].clone(),
                    to: pair.to[index].clone(),
                    width: pair.width,
                    through: pair.through.clone(),
                })
            }))
            .collect()
    }
}
fn property<'a>(props: &'a Value, key: &str) -> Result<&'a Value, CompileError> {
    props
        .get(key)
        .ok_or_else(|| CompileError::invalid(format!("{key} is required")))
}
fn net(value: &Value) -> Result<NetId, CompileError> {
    let id = string(value, "id")?;
    require_name(&id, "net ID", "PCBIR019")?;
    Ok(NetId(id))
}
fn positive(props: &Value, key: &str) -> Result<Option<f64>, CompileError> {
    let value = props.get(key).map(value_number).transpose()?;
    if value.is_some_and(|value| value <= 0.0) {
        return Err(CompileError::diagnostic(Diagnostic::error(
            "PCBIR020",
            format!("{key} must be positive"),
        )));
    }
    Ok(value)
}
fn distinct(from: &PinRef, to: &PinRef) -> Result<(), CompileError> {
    if from.part == to.part && from.name == to.name {
        return Err(CompileError::diagnostic(Diagnostic::error(
            "PCBIR020",
            "route endpoints must differ",
        )));
    }
    Ok(())
}
