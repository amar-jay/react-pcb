use crate::cli::Command;
use pcbir::{CompileError, DeclarationTransaction, Diagnostic};
use serde::{Serialize, de::DeserializeOwned};
use std::fmt;

#[derive(Debug)]
pub(crate) enum CliError {
    Message(String),
    Compile(CompileError),
}

impl From<CompileError> for CliError {
    fn from(error: CompileError) -> Self {
        Self::Compile(error)
    }
}

impl fmt::Display for CliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Message(message) => write!(formatter, "pcbir: {message}"),
            Self::Compile(error) => formatter
                .write_str(&serde_json::to_string(error).expect("compile errors are serializable")),
        }
    }
}

pub(crate) fn run(command: Command, input: &str) -> Result<String, CliError> {
    match command {
        Command::Compile => compile(input),
        Command::Footprint => footprint(input),
        Command::MigrateFootprint => migrate_footprint(input),
        Command::FootprintSvg => footprint_svg(input),
        Command::ValidateFootprint => validate_footprint(input),
        Command::ValidateBoard => validate_board(input),
        Command::BoardSvg => board_svg(input),
        Command::UpgradeBoard => upgrade_board(input),
    }
}

fn compile(input: &str) -> Result<String, CliError> {
    let transaction: DeclarationTransaction = parse_json(input, "declaration transaction")?;
    Ok(json_output(&pcbir::compile(transaction)?))
}

fn footprint(input: &str) -> Result<String, CliError> {
    let definition: serde_json::Value = parse_json(input, "footprint declaration")?;
    let footprint = if definition.get("kind").is_some() {
        let declaration = serde_json::from_value(definition).map_err(|error| {
            CompileError::invalid(format!("invalid footprint declarations: {error}"))
        })?;
        pcbir::layout::compile_layout(declaration)
    } else {
        let declaration = serde_json::from_value(definition).map_err(|error| {
            CompileError::invalid(format!("invalid footprint declaration: {error}"))
        })?;
        pcbir::physical::compile_footprint(declaration)
    }?;
    Ok(json_output(&footprint))
}

fn migrate_footprint(input: &str) -> Result<String, CliError> {
    let migration: pcbir::physical::MigrationInput = parse_json(input, "migration")?;
    let footprint = pcbir::physical::migrate_footprint(
        &migration.footprint,
        migration.units,
        &migration.layer_roles,
    )?;
    Ok(json_output(&footprint))
}

fn footprint_svg(input: &str) -> Result<String, CliError> {
    let footprint = parse_json(input, "compiled footprint")?;
    Ok(pcbir::footprint_svg(&footprint)?)
}

fn validate_footprint(input: &str) -> Result<String, CliError> {
    let input: pcbir::manufacturing::ValidationInput =
        serde_json::from_str(input).map_err(|error| {
            CompileError::diagnostic(Diagnostic::error(
                "PCBMFG001",
                format!("invalid manufacturing input: {error}"),
            ))
        })?;
    let profile = input.profile.compile()?;
    Ok(json_output(&pcbir::manufacturing::validate(
        &input.footprint,
        &profile,
    )?))
}

fn validate_board(input: &str) -> Result<String, CliError> {
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct BoardInput {
        board: serde_json::Value,
        profile: pcbir::manufacturing::ProfileInput,
    }

    let input: BoardInput = serde_json::from_str(input).map_err(|error| {
        CompileError::diagnostic(Diagnostic::error(
            "PCBMFG001",
            format!("invalid board manufacturing input: {error}"),
        ))
    })?;
    let board = pcbir::decode_board_ir(input.board)?;
    let profile = input.profile.compile()?;
    Ok(json_output(&pcbir::manufacturing::validate_board(
        &board, &profile,
    )?))
}

fn board_svg(input: &str) -> Result<String, CliError> {
    let value = parse_json(input, "board IR")?;
    let ir = pcbir::decode_board_ir(value)?;
    let projection = pcbir::board_svg(&ir)?;
    Ok(format!(
        "{}\n",
        serde_json::to_string(&projection).expect("projection is serializable")
    ))
}

fn upgrade_board(input: &str) -> Result<String, CliError> {
    let value = parse_json(input, "board JSON")?;
    Ok(json_output(&pcbir::upgrade_board_ir(value)?))
}

fn parse_json<T: DeserializeOwned>(input: &str, description: &str) -> Result<T, CliError> {
    serde_json::from_str(input)
        .map_err(|error| CliError::Message(format!("invalid {description}: {error}")))
}

fn json_output(value: &impl Serialize) -> String {
    format!(
        "{}\n",
        serde_json::to_string_pretty(value).expect("command output is serializable")
    )
}
