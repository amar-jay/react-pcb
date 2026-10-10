use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct NetId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetDefinition {
    pub id: NetId,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinRef {
    pub part: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RouteConstraint {
    pub id: String,
    pub net: NetId,
    pub from: PinRef,
    pub to: PinRef,
    pub width: Option<f64>,
    /// Ordered centerline waypoint region IDs; coordinates are global to the board.
    pub through: Vec<String>,
}
