use crate::local_preview::normalize_loopback_url;
use crate::settings::{normalize_control_plane_url, read};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn open_external(app: AppHandle, target: String) -> Result<(), String> {
    let settings = read(&app)?;
    let url = match target.as_str() {
        "preview" => normalize_loopback_url(&settings.preview_url)?,
        "dashboard" => normalize_control_plane_url(&settings.control_plane_url)?
            .join("/dashboard")
            .map_err(|_| "Impossible de préparer l’adresse du dashboard.".to_string())?,
        "login" => normalize_control_plane_url(&settings.control_plane_url)?
            .join("/login")
            .map_err(|_| "Impossible de préparer l’adresse de connexion.".to_string())?,
        _ => return Err("Cette destination externe n’est pas autorisée.".into()),
    };

    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| format!("Impossible d’ouvrir le navigateur système : {error}"))
}
