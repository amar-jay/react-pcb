use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Output, Stdio};

fn run(args: &[&str], input: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_pcbir"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn help_and_version_succeed_without_json_input() {
    for args in [
        vec!["--help"],
        vec!["help", "compile"],
        vec!["compile", "--help"],
        vec!["--version"],
        vec!["compile", "--version"],
    ] {
        let output = run(&args, "");
        assert!(output.status.success(), "{args:?}: {output:?}");
        assert!(!output.stdout.is_empty());
        assert!(output.stderr.is_empty());
    }
    let output = run(&["--version"], "");
    assert_eq!(
        String::from_utf8(output.stdout).unwrap(),
        format!("pcbir {}\n", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn existing_command_names_have_help() {
    for name in [
        "compile",
        "footprint",
        "migrate-footprint",
        "footprint-svg",
        "validate-footprint",
        "validate-board",
        "board-svg",
        "upgrade-board",
    ] {
        let output = run(&[name, "--help"], "");
        assert!(output.status.success(), "{name}: {output:?}");
        let help = String::from_utf8(output.stdout).unwrap();
        assert!(help.contains(&format!("Usage: pcbir {name}")), "{help}");
    }
}

#[test]
fn usage_errors_exit_with_status_two_before_processing_input() {
    for args in [
        vec![],
        vec!["unknown"],
        vec!["compile", "--unknown"],
        vec!["compile", "unexpected"],
    ] {
        let output = run(&args, "");
        assert_eq!(output.status.code(), Some(2), "{args:?}: {output:?}");
        assert!(output.stdout.is_empty());
        assert!(!output.stderr.is_empty());
    }
}

#[test]
fn compile_preserves_the_json_stream_contract() {
    let transaction = json!({
        "protocolVersion": pcbir::PROTOCOL_VERSION,
        "declarations": {
            "kind": "react-pcb-declarations",
            "children": [{
                "type": "pcb-board",
                "props": {
                    "outline": {"kind": "rect", "x": 0, "y": 0, "width": 10, "height": 10},
                    "layers": {
                        "kind": "layer-set",
                        "stackup": {"kind": "stackup", "entries": [
                            {"kind": "copper", "id": "copper/1", "thickness": 0.035, "usage": "signal"}
                        ]},
                        "technical": []
                    }
                },
                "children": []
            }]
        }
    });
    let expected = pcbir::compile(serde_json::from_value(transaction.clone()).unwrap()).unwrap();
    let output = run(&["compile"], &transaction.to_string());
    assert!(output.status.success(), "{output:?}");
    assert!(output.stderr.is_empty());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap(),
        format!("{}\n", serde_json::to_string_pretty(&expected).unwrap())
    );
}

#[test]
fn compiler_and_manufacturing_errors_remain_json_on_stderr() {
    for (command, input, code) in [
        (
            "compile",
            r#"{"protocolVersion":0,"declarations":{"kind":"react-pcb-declarations","children":[]}}"#,
            "PCBIR100",
        ),
        ("validate-footprint", "{}", "PCBMFG001"),
        ("validate-board", "{}", "PCBMFG001"),
    ] {
        let output = run(&[command], input);
        assert_eq!(output.status.code(), Some(1), "{command}: {output:?}");
        assert!(output.stdout.is_empty());
        let error: Value = serde_json::from_slice(&output.stderr).unwrap();
        assert_eq!(error["diagnostic"]["code"], code);
    }
}

#[test]
fn malformed_json_remains_a_command_error() {
    let output = run(&["compile"], "not json");
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    assert!(
        String::from_utf8(output.stderr)
            .unwrap()
            .starts_with("pcbir: invalid declaration transaction:")
    );
}
