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
    pub units: LengthUnit,
    pub board: Board,
    pub components: BTreeMap<String, Value>,
    pub parts: Vec<Part>,
    pub nets: Vec<NetId>,
    pub route_constraints: Vec<RouteConstraint>,
}
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
    Copper { thickness: f64, role: CopperRole },
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
pub enum CopperRole {
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
    pub component: String,
    pub at: Option<[f64; 2]>,
    pub side: BoardSide,
    pub rotation: f64,
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
