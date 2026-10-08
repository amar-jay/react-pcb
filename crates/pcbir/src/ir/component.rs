use serde::Serialize;
use std::collections::BTreeMap;

use super::{BoardSide, NetId};

#[derive(Debug, Clone, Serialize)]
pub struct ComponentInstance {
    pub id: String,
    pub reference: String,
    pub definition: String,
    pub at: Option<[f64; 2]>,
    pub side: BoardSide,
    pub rotation: f64,
    pub connections: BTreeMap<String, NetId>,
}
