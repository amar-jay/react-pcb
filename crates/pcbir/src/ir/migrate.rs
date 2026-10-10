use serde_json::{Value, json};

use super::{BoardIr, BoardSide, KeepoutRestriction, LayerSet, SCHEMA_VERSION, StackupLayer};
use crate::{CompileError, Diagnostic};

fn invalid(message: impl Into<String>) -> CompileError {
    CompileError::diagnostic(Diagnostic::error("PCBIR036", message)
        .with_help("Compile with declaration protocol 2 and board IR schema 3. Upgrade saved schema-2 boards explicitly with upgradeBoardIr() or pcbir upgrade-board; upgrading does not validate physical constraint satisfaction."))
}

/// Decode the current board contract without implicitly upgrading legacy data.
pub fn decode_board_ir(input: Value) -> Result<BoardIr, CompileError> {
    if input.get("schemaVersion").and_then(Value::as_u64) != Some(u64::from(SCHEMA_VERSION)) {
        return Err(invalid(format!(
            "unsupported board IR schema version {}; expected {SCHEMA_VERSION}",
            input.get("schemaVersion").unwrap_or(&Value::Null)
        )));
    }
    let ir: BoardIr = serde_json::from_value(input)
        .map_err(|error| invalid(format!("invalid board IR: {error}")))?;
    super::regions::validate_regions(&ir)?;
    Ok(ir)
}

/// Explicit schema-2 upgrade, preserving identities, geometry, revision and route
/// order. Current documents are accepted unchanged after structural validation.
pub fn upgrade_board_ir(mut input: Value) -> Result<BoardIr, CompileError> {
    match input.get("schemaVersion").and_then(Value::as_u64) {
        Some(version) if version == u64::from(SCHEMA_VERSION) => return decode_board_ir(input),
        Some(2) => {}
        _ => {
            return Err(invalid(
                "board upgrade supports schema 2 or current schema 3 only",
            ));
        }
    }
    let layers: LayerSet = serde_json::from_value(
        input
            .pointer("/board/layers")
            .cloned()
            .ok_or_else(|| invalid("legacy board layers are missing"))?,
    )
    .map_err(|error| invalid(format!("invalid legacy board layers: {error}")))?;
    let mut copper: Vec<_> = layers
        .stackup
        .entries
        .iter()
        .filter_map(|layer| match layer {
            StackupLayer::Copper { id, .. } => Some(id.clone()),
            _ => None,
        })
        .collect();
    copper.sort();
    let keepouts = input
        .get_mut("keepouts")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| invalid("legacy keepouts must be an array"))?;
    for keepout in keepouts {
        let object = keepout
            .as_object_mut()
            .ok_or_else(|| invalid("legacy keepout must be an object"))?;
        // A legacy document must not already contain ignored new scope fields.
        if object.contains_key("componentSides") || object.contains_key("copperLayers") {
            return Err(invalid(
                "schema-2 keepouts cannot contain schema-3 scope fields",
            ));
        }
        let restrictions: Vec<KeepoutRestriction> = serde_json::from_value(
            object
                .get("disallow")
                .cloned()
                .ok_or_else(|| invalid("legacy keepout restrictions are missing"))?,
        )
        .map_err(|error| invalid(format!("invalid legacy keepout restrictions: {error}")))?;
        object.insert(
            "componentSides".to_owned(),
            if restrictions.contains(&KeepoutRestriction::Components) {
                json!([BoardSide::Front, BoardSide::Back])
            } else {
                json!([])
            },
        );
        object.insert(
            "copperLayers".to_owned(),
            if restrictions.iter().any(|r| r.is_electrical()) {
                json!(copper)
            } else {
                json!([])
            },
        );
    }
    input["schemaVersion"] = json!(SCHEMA_VERSION);
    decode_board_ir(input)
}

pub(crate) fn deserialize_board_ir<'de, D>(deserializer: D) -> Result<BoardIr, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::Deserialize;
    decode_board_ir(Value::deserialize(deserializer)?)
        .map_err(|error| serde::de::Error::custom(error.diagnostic.to_string()))
}
