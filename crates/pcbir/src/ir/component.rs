use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use super::{BoardSide, NetId};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentDefinition {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manufacturer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mpn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub datasheet: Option<DatasheetSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinout_coverage: Option<PinoutCoverage>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub pins: BTreeMap<String, PinDefinition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DatasheetSource {
    pub url: String,
    pub document: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PinoutCoverage {
    Complete,
    Partial,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinDefinition {
    pub electrical_type: ElectricalType,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub functions: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub required: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ElectricalType {
    PowerInput,
    PowerOutput,
    Input,
    Output,
    Bidirectional,
    Passive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
