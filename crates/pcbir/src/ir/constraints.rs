use super::{NetId, PinRef};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DifferentialPairConstraint {
    pub id: String,
    pub positive: NetId,
    pub negative: NetId,
    pub from: [PinRef; 2],
    pub to: [PinRef; 2],
    pub width: Option<f64>,
    pub gap: Option<f64>,
    pub target_impedance: Option<f64>,
    pub through: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ZoneConstraint {
    pub id: String,
    pub net: NetId,
    pub layers: Vec<String>,
    pub boundary: String,
    pub clearance: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KeepoutConstraint {
    pub id: String,
    pub region: String,
    pub disallow: Vec<String>,
    pub except: Vec<NetId>,
}
