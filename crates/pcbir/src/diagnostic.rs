use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Warning,
    Error,
}

/// Exact failed placement geometry, independent of any viewer or accepted board IR.
/// Bounds and overflows use doubled nanometres to preserve half-nm edges.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineFeatureViolation {
    pub geometry: crate::physical::Feature,
    pub bounds: crate::physical::Bounds,
    /// Left, top, right, bottom; zero means contained at that edge.
    pub overflow2: [i128; 4],
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DiagnosticGeometry {
    #[serde(rename_all = "camelCase")]
    BoardOutline {
        board_bounds: OutlineBounds,
        features: Vec<OutlineFeatureViolation>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineBounds {
    pub min2: [i128; 2],
    pub max2: [i128; 2],
}

#[derive(Debug, Clone, Serialize)]
pub struct Diagnostic {
    pub code: &'static str,
    pub severity: Severity,
    pub message: String,
    pub entity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub help: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<Box<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geometry: Option<DiagnosticGeometry>,
}

impl Diagnostic {
    pub fn error(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            severity: Severity::Error,
            message: message.into(),
            entity: None,
            help: None,
            source: None,
            geometry: None,
        }
    }

    pub fn warning(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            severity: Severity::Warning,
            message: message.into(),
            entity: None,
            help: None,
            source: None,
            geometry: None,
        }
    }

    pub fn with_entity(mut self, entity: impl Into<String>) -> Self {
        self.entity = Some(entity.into());
        self
    }

    pub fn with_help(mut self, help: impl Into<String>) -> Self {
        self.help = Some(help.into());
        self
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let severity = match self.severity {
            Severity::Warning => "warning",
            Severity::Error => "error",
        };
        write!(formatter, "{severity}[{}]: {}", self.code, self.message)?;
        if let Some(entity) = &self.entity {
            write!(formatter, "\n  --> {entity}")?;
        }
        if let Some(source) = &self.source
            && let Some(file) = source.get("file").and_then(serde_json::Value::as_str)
        {
            write!(formatter, "\n  at {file}")?;
            if let Some(line) = source.get("line").and_then(serde_json::Value::as_u64) {
                write!(formatter, ":{line}")?;
            }
            if let Some(column) = source.get("column").and_then(serde_json::Value::as_u64) {
                write!(formatter, ":{column}")?;
            }
        }
        if let Some(help) = &self.help {
            write!(formatter, "\n  help: {help}")?;
        }
        Ok(())
    }
}
