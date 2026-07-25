mod local_preview;
mod navigation;
mod project;
mod settings;

use project::{stop_managed_child, AppState};
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            local_preview::probe_preview,
            navigation::open_external,
            project::inspect_project,
            project::runtime_status,
            project::start_dev_server,
            project::stop_dev_server,
            settings::load_settings,
            settings::save_settings,
        ])
        .build(tauri::generate_context!())
        .expect("impossible de construire l’application Revaloop");

    application.run(|app, event| {
        if matches!(event, RunEvent::Exit) {
            let state = app.state::<AppState>();
            let _ = stop_managed_child(&state);
        }
    });
}
