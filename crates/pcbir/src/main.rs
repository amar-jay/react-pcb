mod cli;
mod commands;

use clap::Parser;
use cli::Cli;
use commands::CliError;
use std::io::{self, Read, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<(), CliError> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| CliError::Message(format!("failed to read declarations: {error}")))?;
    let output = commands::run(cli.command, &input)?;
    io::stdout()
        .lock()
        .write_all(output.as_bytes())
        .map_err(|error| CliError::Message(format!("failed to write output: {error}")))
}
