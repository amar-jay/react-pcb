use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub outline: String,
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
    Copper {
        id: String,
        thickness: f64,
        usage: CopperUsage,
    },
    #[serde(rename = "dielectric")]
    Dielectric {
        id: String,
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
        id: String,
        side: BoardSide,
        expansion: Option<f64>,
    },
    #[serde(rename = "paste")]
    Paste { id: String, side: BoardSide },
    #[serde(rename = "silkscreen")]
    Silkscreen {
        id: String,
        side: BoardSide,
        color: Option<String>,
    },
    #[serde(rename = "mechanical")]
    Mechanical {
        id: String,
        purpose: MechanicalPurpose,
        side: Option<BoardSide>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BoardSide {
    Front,
    Back,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
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

impl StackupLayer {
    pub fn id(&self) -> &str {
        match self {
            Self::Copper { id, .. } | Self::Dielectric { id, .. } => id,
        }
    }
}
impl TechnicalLayer {
    pub fn id(&self) -> &str {
        match self {
            Self::SolderMask { id, .. }
            | Self::Paste { id, .. }
            | Self::Silkscreen { id, .. }
            | Self::Mechanical { id, .. } => id,
        }
    }
}
