use serde::Serialize;
use std::collections::BTreeMap;

use super::{BoardSide, NetId};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartInstance {
    pub id: String,
    pub reference: String,
    pub component: String,
    pub footprint: String,
    pub pin_map: BTreeMap<String, Vec<String>>,
    /// Concrete board layer IDs per physical pad, after side resolution.
    pub pad_layers: BTreeMap<String, Vec<String>>,
    pub at: Option<[f64; 2]>,
    pub side: BoardSide,
    pub rotation: f64,
    pub connections: BTreeMap<String, NetId>,
}
