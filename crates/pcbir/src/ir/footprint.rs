use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FootprintDefinition {
    pub key: String,
    /// False for library references whose geometry has not been loaded.
    pub resolved: bool,
    pub pads: Vec<FootprintPad>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FootprintPad {
    pub id: String,
    pub at: [f64; 2],
    pub shape: PadShape,
    pub size: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
    pub layers: Vec<PadLayer>,
    pub drill: Option<PadDrill>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PadShape {
    Rect,
    Circle,
    Oval,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PadLayer {
    Id(String),
    Selector(CopperLayerSelector),
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum CopperLayerSelector {
    #[serde(rename = "all-copper")]
    AllCopper,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PadDrill {
    pub diameter: f64,
    pub plated: bool,
}
