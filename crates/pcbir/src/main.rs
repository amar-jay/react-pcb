use pcbir::{CompileError, DeclarationTransaction, compile};
use std::io::{self, Read};

fn main() {
    if std::env::args().nth(1).as_deref() != Some("compile") {
        eprintln!("usage: pcbir compile < declarations.json");
        std::process::exit(2);
    }
    let mut input = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input) {
        fail(format!("failed to read declarations: {error}"));
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
