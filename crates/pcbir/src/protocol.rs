use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeclarationTransaction {
    pub protocol_version: u32,
    pub base_revision: Option<u64>,
    pub declarations: DeclarationTree,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclarationTree {
    pub kind: String,
    pub children: Vec<DeclarationNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclarationNode {
    /// Optional opaque identity hint supplied automatically by a frontend.
    #[serde(default, rename = "sourceKey", skip_serializing_if = "Option::is_none")]
    pub source_key: Option<String>,
    #[serde(rename = "type")]
    pub node_type: String,
    pub props: Value,
    #[serde(default)]
    pub children: Vec<DeclarationNode>,
}
