use std::fs;
use std::path::Path;
use regex::Regex;
use std::collections::HashSet;

#[test]
fn test_ipc_contract() {
    let main_rs = fs::read_to_string("src/main.rs").expect("Unable to read main.rs");

    // Extract registered handlers
    // Allow spaces and newlines within the generate_handler! macro
    let handler_re = Regex::new(r"tauri::generate_handler!\[([^\]]*)\]").unwrap();
    let handler_match = handler_re.captures(&main_rs).expect("Could not find tauri::generate_handler!");
    let handlers_str = handler_match.get(1).unwrap().as_str();

    let mut registered_handlers = HashSet::new();
    for handler in handlers_str.split(',') {
        let trimmed = handler.trim();
        if !trimmed.is_empty() {
            registered_handlers.insert(trimmed.to_string());
        }
    }

    // Find all invokes in src/
    let invoke_re = Regex::new(r#"\.invoke\(['"]([^'"]+)['"]"#).unwrap();
    let mut invoked_commands = HashSet::new();

    fn visit_dirs(dir: &Path, cb: &mut dyn FnMut(&Path)) {
        if dir.is_dir() {
            for entry in fs::read_dir(dir).unwrap() {
                let entry = entry.unwrap();
                let path = entry.path();
                if path.is_dir() {
                    visit_dirs(&path, cb);
                } else {
                    cb(&path);
                }
            }
        }
    }

    let mut check_file = |path: &Path| {
        if let Some(ext) = path.extension() {
            if ext == "ts" || ext == "tsx" {
                if let Ok(content) = fs::read_to_string(path) {
                    for cap in invoke_re.captures_iter(&content) {
                        invoked_commands.insert(cap[1].to_string());
                    }
                }
            }
        }
    };

    visit_dirs(Path::new("../src"), &mut check_file);

    for cmd in invoked_commands {
        assert!(registered_handlers.contains(&cmd), "Command '{}' is invoked but not registered!", cmd);
    }
}
