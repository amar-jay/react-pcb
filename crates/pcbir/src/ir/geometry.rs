use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Referenceable region identity is separate from its mutable geometry.
#[derive(Debug, Clone, Serialize)]
pub struct RegionDefinition {
    pub id: String,
    pub geometry: Rect,
}
