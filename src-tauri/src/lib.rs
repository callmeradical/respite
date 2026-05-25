use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

/// Write arbitrary text content to a file path chosen by the user via the
/// native save dialog.  The path comes from `tauri-plugin-dialog` on the
/// frontend, so the Rust side just performs the raw write.
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
    Migration {
        version: 1,
        description: "create_initial_schema",
        sql: r#"
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                pay_period_cadence TEXT NOT NULL DEFAULT 'biweekly',
                days_per_year REAL NOT NULL DEFAULT 15.0,
                accrual_start_date TEXT NOT NULL DEFAULT (date('now', 'start of year')),
                opening_balance REAL NOT NULL DEFAULT 0.0,
                max_balance_days REAL
            );

            INSERT OR IGNORE INTO settings (id, pay_period_cadence, days_per_year, opening_balance)
            VALUES (1, 'biweekly', 15.0, 0.0);

            CREATE TABLE IF NOT EXISTS time_off_entries (
                id TEXT PRIMARY KEY,
                entry_type TEXT NOT NULL CHECK (entry_type IN ('pto', 'holiday')),
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                days REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('taken', 'scheduled')),
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS holidays (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                date TEXT NOT NULL UNIQUE,
                is_company_holiday INTEGER NOT NULL DEFAULT 1
            );
        "#,
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "add_carryover_settings",
        sql: r#"
            ALTER TABLE settings ADD COLUMN hours_per_day REAL NOT NULL DEFAULT 8.0;
            ALTER TABLE settings ADD COLUMN carryover_limit_hours REAL;
        "#,
        kind: MigrationKind::Up,
    },
    Migration {
        version: 3,
        description: "add_theme_setting",
        sql: "ALTER TABLE settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'auto';",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:respite.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
