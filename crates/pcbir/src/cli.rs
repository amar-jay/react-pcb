use clap::{Parser, Subcommand};

/// Compile, inspect, and validate PCB intermediate representations.
#[derive(Debug, Parser)]
#[command(
    name = "pcbir",
    version,
    propagate_version = true,
    after_help = "Commands read JSON from stdin and write results to stdout.\nExample: pcbir compile < declarations.json > board.json"
)]
pub(crate) struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub(crate) enum Command {
    /// Compile a declaration transaction into board IR and diagnostics.
    Compile,
    /// Compile a physical footprint or layout declaration.
    Footprint,
    /// Migrate a legacy footprint using explicit units and layer roles.
    MigrateFootprint,
    /// Render a compiled physical footprint as SVG.
    FootprintSvg,
    /// Check a compiled footprint against a manufacturing profile.
    ValidateFootprint,
    /// Check board IR against a manufacturing profile.
    ValidateBoard,
    /// Project board IR into JSON containing SVG and inspection data.
    BoardSvg,
    /// Upgrade saved board IR to the current schema.
    UpgradeBoard,
}

#[cfg(test)]
mod tests {
    use super::Cli;
    use clap::CommandFactory;

    #[test]
    fn command_definition_is_valid() {
        Cli::command().debug_assert();
    }
}
