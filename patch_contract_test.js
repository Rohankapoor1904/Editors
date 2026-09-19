const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/tests/contract_test.rs', 'utf8');
code = code.replace(/let invoke_re = Regex::new\\(r#"\\\\.invoke\\\\\(\\[\\'"\\]\\(\\[^\\'"\\]\\+\\)\\[\\'"\\]"#\\).unwrap\\(\\);/, 'let invoke_re = Regex::new(r#"invoke\\([\'"]([^\'"]+)[\'"]"#).unwrap();');
fs.writeFileSync('src-tauri/src/tests/contract_test.rs', code);
