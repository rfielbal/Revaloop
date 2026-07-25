use crate::local_preview::normalize_loopback_url;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use url::{Host, Url};

const SETTINGS_FILENAME: &str = "settings.json";
const DEFAULT_PREVIEW_URL: &str = "http://127.0.0.1:3000/";
const LEGACY_DEFAULT_CONTROL_PLANE_URL: &str = "http://127.0.0.1:3000/";
const DEFAULT_CONTROL_PLANE_URL: &str = "https://revaloop-rfielbal.moulbyte.chatgpt.site/";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    pub project_path: Option<String>,
    pub preview_url: String,
    pub control_plane_url: String,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            project_path: None,
            preview_url: DEFAULT_PREVIEW_URL.into(),
            control_plane_url: DEFAULT_CONTROL_PLANE_URL.into(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(SETTINGS_FILENAME))
        .map_err(|error| format!("Le dossier de configuration est indisponible : {error}"))
}

fn normalize_project_path(raw: &str) -> Result<String, String> {
    let canonical = fs::canonicalize(raw)
        .map_err(|_| "Le dossier du projet n’existe plus ou n’est pas accessible.")?;
    if !canonical.is_dir() || !canonical.join("package.json").is_file() {
        return Err("Le dossier choisi ne contient pas de package.json.".into());
    }
    Ok(canonical.to_string_lossy().into_owned())
}

pub fn normalize_control_plane_url(raw: &str) -> Result<Url, String> {
    let candidate = raw.trim();
    if candidate.is_empty() || candidate.len() > 2_048 {
        return Err("L’adresse de l’instance Revaloop est vide ou trop longue.".into());
    }
    let url =
        Url::parse(candidate).map_err(|_| "L’adresse de l’instance Revaloop est invalide.")?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("L’instance Revaloop ne doit contenir aucun identifiant dans son URL.".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("L’instance Revaloop ne doit contenir ni query string ni fragment.".into());
    }
    if url.path() != "/" && !url.path().is_empty() {
        return Err("Indiquez uniquement l’origine de l’instance Revaloop, sans chemin.".into());
    }

    match url.scheme() {
        "https" => {}
        "http" => match url.host() {
            Some(Host::Domain(domain)) if domain.eq_ignore_ascii_case("localhost") => {}
            Some(Host::Ipv4(address)) if address.is_loopback() => {}
            Some(Host::Ipv6(address)) if address.is_loopback() => {}
            _ => return Err("HTTP n’est accepté que pour une instance locale.".into()),
        },
        _ => return Err("L’instance Revaloop doit utiliser HTTPS, ou HTTP en local.".into()),
    }

    Ok(url)
}

fn validate(mut settings: DesktopSettings) -> Result<DesktopSettings, String> {
    settings.project_path = settings
        .project_path
        .as_deref()
        .map(normalize_project_path)
        .transpose()?;
    settings.preview_url = normalize_loopback_url(&settings.preview_url)?.to_string();
    settings.control_plane_url =
        normalize_control_plane_url(&settings.control_plane_url)?.to_string();
    Ok(settings)
}

fn migrate_legacy_defaults(mut settings: DesktopSettings) -> (DesktopSettings, bool) {
    let should_migrate = settings.preview_url == DEFAULT_PREVIEW_URL
        && settings.control_plane_url == LEGACY_DEFAULT_CONTROL_PLANE_URL;
    if should_migrate {
        settings.control_plane_url = DEFAULT_CONTROL_PLANE_URL.into();
    }
    (settings, should_migrate)
}

pub fn read(app: &AppHandle) -> Result<DesktopSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(DesktopSettings::default());
    }
    let bytes = fs::read(&path)
        .map_err(|error| format!("Impossible de lire la configuration locale : {error}"))?;
    if bytes.len() > 64 * 1_024 {
        return Err("La configuration locale dépasse la taille autorisée.".into());
    }
    let settings: DesktopSettings = serde_json::from_slice(&bytes)
        .map_err(|_| "La configuration locale est illisible.".to_string())?;
    let validated = validate(settings)?;
    let (migrated, changed) = migrate_legacy_defaults(validated);
    if changed {
        let serialized = serde_json::to_vec_pretty(&migrated)
            .map_err(|_| "Impossible de préparer la configuration locale.".to_string())?;
        write_file(&path, &serialized)?;
    }
    Ok(migrated)
}

fn write_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Le dossier de configuration est invalide.".to_string())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Impossible de créer le dossier de configuration : {error}"))?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, contents)
        .map_err(|error| format!("Impossible d’écrire la configuration locale : {error}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Impossible de protéger la configuration locale : {error}"))?;
    }

    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            format!("Impossible de remplacer la configuration locale : {error}")
        })?;
    }

    fs::rename(&temporary, path)
        .map_err(|error| format!("Impossible de finaliser la configuration locale : {error}"))
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<DesktopSettings, String> {
    read(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: DesktopSettings) -> Result<DesktopSettings, String> {
    let validated = validate(settings)?;
    let serialized = serde_json::to_vec_pretty(&validated)
        .map_err(|_| "Impossible de préparer la configuration locale.".to_string())?;
    write_file(&settings_path(&app)?, &serialized)?;
    Ok(validated)
}

#[cfg(test)]
mod tests {
    use super::{
        migrate_legacy_defaults, normalize_control_plane_url, DesktopSettings,
        DEFAULT_CONTROL_PLANE_URL, DEFAULT_PREVIEW_URL, LEGACY_DEFAULT_CONTROL_PLANE_URL,
    };

    #[test]
    fn allows_https_and_loopback_http_control_planes() {
        assert!(normalize_control_plane_url("https://revaloop.example").is_ok());
        assert!(normalize_control_plane_url("http://127.0.0.1:3000").is_ok());
    }

    #[test]
    fn rejects_insecure_remote_control_planes() {
        assert!(normalize_control_plane_url("http://revaloop.example").is_err());
        assert!(normalize_control_plane_url("https://revaloop.example/path").is_err());
    }

    #[test]
    fn uses_the_remote_control_plane_by_default() {
        let settings = DesktopSettings::default();
        assert_eq!(settings.preview_url, DEFAULT_PREVIEW_URL);
        assert_eq!(settings.control_plane_url, DEFAULT_CONTROL_PLANE_URL);
    }

    #[test]
    fn migrates_only_the_legacy_ambiguous_pair() {
        let legacy = DesktopSettings {
            project_path: Some("/projets/site-client".into()),
            preview_url: DEFAULT_PREVIEW_URL.into(),
            control_plane_url: LEGACY_DEFAULT_CONTROL_PLANE_URL.into(),
        };
        let (migrated, changed) = migrate_legacy_defaults(legacy);
        assert!(changed);
        assert_eq!(migrated.control_plane_url, DEFAULT_CONTROL_PLANE_URL);
        assert_eq!(
            migrated.project_path.as_deref(),
            Some("/projets/site-client")
        );

        let custom = DesktopSettings {
            project_path: None,
            preview_url: "http://127.0.0.1:4173/".into(),
            control_plane_url: LEGACY_DEFAULT_CONTROL_PLANE_URL.into(),
        };
        let (preserved, changed) = migrate_legacy_defaults(custom);
        assert!(!changed);
        assert_eq!(
            preserved.control_plane_url,
            LEGACY_DEFAULT_CONTROL_PLANE_URL
        );
    }
}
