use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Revision(pub u64);
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct NetId(pub String);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardIr {
    pub revision: Revision,
    pub board: Board,
    pub parts: Vec<Part>,
    pub nets: Vec<NetId>,
    pub route_constraints: Vec<RouteConstraint>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub outline: Rect,
    pub layer_count: u8,
    pub metadata: BTreeMap<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Debug, Clone, Serialize)]
pub struct Part {
    pub id: String,
    pub reference: String,
    pub mpn: Option<String>,
    pub value: Option<String>,
    pub footprint: String,
    pub at: Option<[f64; 2]>,
    pub connections: BTreeMap<String, NetId>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinRef {
    pub part: String,
    pub name: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct RouteConstraint {
    pub net: NetId,
    pub from: PinRef,
    pub to: PinRef,
    pub width: Option<f64>,
    pub through: Vec<Rect>,
}
