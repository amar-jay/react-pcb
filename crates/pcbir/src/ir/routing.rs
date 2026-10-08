use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct NetId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinRef {
    pub part: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteConstraint {
    pub id: String,
    pub net: NetId,
    pub from: PinRef,
    pub to: PinRef,
    pub width: Option<f64>,
    pub through: Vec<String>,
}
