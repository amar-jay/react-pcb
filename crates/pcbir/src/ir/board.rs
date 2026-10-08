use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

use super::Rect;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub outline: Rect,
    pub layers: LayerSet,
    pub metadata: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerSet {
    pub kind: String,
    pub stackup: Stackup,
    pub technical: Vec<TechnicalLayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stackup {
    pub kind: String,
    pub entries: Vec<StackupLayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum StackupLayer {
    #[serde(rename = "copper")]
    Copper { thickness: f64, usage: CopperUsage },
    #[serde(rename = "dielectric")]
    Dielectric {
        material: String,
        thickness: f64,
        #[serde(rename = "epsilonR")]
        epsilon_r: f64,
        #[serde(rename = "lossTangent")]
        loss_tangent: Option<f64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CopperUsage {
    Signal,
    Plane,
    Mixed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum TechnicalLayer {
    #[serde(rename = "solder-mask")]
    SolderMask {
        side: BoardSide,
        expansion: Option<f64>,
    },
    #[serde(rename = "paste")]
    Paste { side: BoardSide },
    #[serde(rename = "silkscreen")]
    Silkscreen {
        side: BoardSide,
        color: Option<String>,
    },
    #[serde(rename = "mechanical")]
    Mechanical {
        purpose: MechanicalPurpose,
        side: Option<BoardSide>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BoardSide {
    Front,
    Back,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LengthUnit {
    Mm,
    Mil,
    In,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MechanicalPurpose {
    Assembly,
    Courtyard,
    Fabrication,
    Other,
}
