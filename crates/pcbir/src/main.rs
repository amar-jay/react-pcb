use pcbir::{CompileError, DeclarationTransaction, compile};
use std::io::{self, Read};

fn main() {
    let command = std::env::args().nth(1);
    if !matches!(
        command.as_deref(),
        Some("compile" | "footprint" | "migrate-footprint" | "footprint-svg")
    ) {
        eprintln!(
            "usage: pcbir compile|footprint|migrate-footprint|footprint-svg < declarations.json"
        );
        std::process::exit(2);
    }
    let mut input = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input) {
        fail(format!("failed to read declarations: {error}"));
    }
    if command.as_deref() == Some("footprint-svg") {
        let footprint = serde_json::from_str(&input)
            .unwrap_or_else(|e| fail(format!("invalid compiled footprint: {e}")));
        let svg = pcbir::footprint_svg(&footprint).unwrap_or_else(|e| fail_compile(e));
        print!("{svg}");
        return;
    }
    if command.as_deref() == Some("migrate-footprint") {
        let migration: pcbir::physical::MigrationInput = serde_json::from_str(&input)
            .unwrap_or_else(|e| fail(format!("invalid migration: {e}")));
        let footprint = pcbir::physical::migrate_footprint(
            &migration.footprint,
            migration.units,
            &migration.layer_roles,
        )
        .unwrap_or_else(|e| fail_compile(e));
        println!(
            "{}",
            serde_json::to_string_pretty(&footprint).expect("footprint is serializable")
        );
        return;
    }
    if command.as_deref() == Some("footprint") {
        let definition: serde_json::Value = serde_json::from_str(&input)
            .unwrap_or_else(|e| fail(format!("invalid footprint declaration: {e}")));
        let footprint = if definition.get("kind").is_some() {
            let declaration = serde_json::from_value(definition).unwrap_or_else(|e| {
                fail_compile(CompileError::invalid(format!(
                    "invalid footprint declarations: {e}"
                )))
            });
            pcbir::layout::compile_layout(declaration)
        } else {
            let declaration = serde_json::from_value(definition).unwrap_or_else(|e| {
                fail_compile(CompileError::invalid(format!(
                    "invalid footprint declaration: {e}"
                )))
            });
            pcbir::physical::compile_footprint(declaration)
        }
        .unwrap_or_else(|e| fail_compile(e));
        println!(
            "{}",
            serde_json::to_string_pretty(&footprint).expect("footprint is serializable")
        );
        return;
    }
    let transaction: DeclarationTransaction = match serde_json::from_str(&input) {
        Ok(transaction) => transaction,
        Err(error) => fail(format!("invalid declaration transaction: {error}")),
    };
    let output = match compile(transaction) {
        Ok(output) => output,
        Err(error) => fail_compile(error),
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&output).expect("compile output is serializable")
    );
}

fn fail_compile(error: CompileError) -> ! {
    eprintln!(
        "{}",
        serde_json::to_string(&error).expect("compile errors are serializable")
    );
    std::process::exit(1);
}

fn fail(message: String) -> ! {
    eprintln!("pcbir: {message}");
    std::process::exit(1);
}
