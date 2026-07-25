use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const MAX_PACKAGE_JSON_BYTES: u64 = 1_048_576;
const MAX_SCRIPT_LENGTH: usize = 1_024;
const MAX_LOG_LINE_LENGTH: usize = 2_000;
const NPM_RUN_ARGUMENTS: [&str; 3] = ["--ignore-scripts", "run", "dev"];
const NPM_RUN_LABEL: &str = "npm --ignore-scripts run dev";

#[derive(Default)]
pub struct AppState {
    child: Mutex<Option<Child>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageManifest {
    name: Option<String>,
    version: Option<String>,
    package_manager: Option<String>,
    scripts: Option<HashMap<String, String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    path: String,
    name: String,
    version: Option<String>,
    dev_script: String,
    package_manager: String,
    command: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    running: bool,
    pid: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogLine {
    stream: String,
    line: String,
}

fn clean_label(value: Option<String>, fallback: &str, max: usize) -> String {
    let candidate = value.unwrap_or_else(|| fallback.into());
    let cleaned: String = candidate
        .chars()
        .filter(|character| !character.is_control())
        .take(max)
        .collect();
    if cleaned.trim().is_empty() {
        fallback.into()
    } else {
        cleaned
    }
}

fn canonical_project_path(raw: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(raw).map_err(|_| "Le dossier choisi n’est pas accessible.")?;
    if !canonical.is_dir() {
        return Err("Le projet choisi n’est pas un dossier.".into());
    }
    Ok(canonical)
}

fn read_manifest(path: &Path) -> Result<PackageManifest, String> {
    let package_path = path.join("package.json");
    let metadata = fs::metadata(&package_path)
        .map_err(|_| "Le dossier choisi ne contient pas de package.json.")?;
    if !metadata.is_file() || metadata.len() > MAX_PACKAGE_JSON_BYTES {
        return Err("Le package.json est absent ou dépasse 1 Mio.".into());
    }
    let bytes =
        fs::read(&package_path).map_err(|_| "Le package.json ne peut pas être lu.".to_string())?;
    serde_json::from_slice(&bytes).map_err(|_| "Le package.json est invalide.".into())
}

fn inspect(path: &str) -> Result<ProjectInfo, String> {
    let canonical = canonical_project_path(path)?;
    let manifest = read_manifest(&canonical)?;
    let dev_script = manifest
        .scripts
        .and_then(|scripts| scripts.get("dev").cloned())
        .ok_or_else(|| {
            "Ce projet ne déclare aucun script « dev » dans package.json.".to_string()
        })?;
    if dev_script.is_empty() || dev_script.len() > MAX_SCRIPT_LENGTH {
        return Err("Le script « dev » est vide ou trop long.".into());
    }
    let fallback_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Projet");
    let package_manager = clean_label(manifest.package_manager, "npm", 80);

    Ok(ProjectInfo {
        path: canonical.to_string_lossy().into_owned(),
        name: clean_label(manifest.name, fallback_name, 100),
        version: manifest
            .version
            .map(|version| clean_label(Some(version), "", 40))
            .filter(|version| !version.is_empty()),
        dev_script,
        package_manager,
        command: NPM_RUN_LABEL.into(),
    })
}

#[tauri::command]
pub fn inspect_project(path: String) -> Result<ProjectInfo, String> {
    inspect(&path)
}

fn redact_log_line(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|character| !character.is_control() || *character == '\t')
        .take(MAX_LOG_LINE_LENGTH)
        .collect();
    let lowercase = cleaned.to_ascii_lowercase();
    let sensitive_markers = [
        "authorization:",
        "proxy-authorization:",
        "cookie:",
        "set-cookie:",
        "password=",
        "passwd=",
        "secret=",
        "token=",
        "api_key=",
        "apikey=",
    ];
    if sensitive_markers
        .iter()
        .any(|marker| lowercase.contains(marker))
    {
        "[ligne masquée : donnée potentiellement sensible]".into()
    } else {
        cleaned
    }
}

fn stream_logs<R: std::io::Read + Send + 'static>(reader: R, stream: &'static str, app: AppHandle) {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let _ = app.emit(
                "preview-log",
                LogLine {
                    stream: stream.into(),
                    line: redact_log_line(&line),
                },
            );
        }
    });
}

fn executable_in_path(name: &str) -> Option<PathBuf> {
    env::var_os("PATH").and_then(|path| {
        env::split_paths(&path)
            .map(|directory| directory.join(name))
            .find(|candidate| candidate.is_file())
    })
}

fn npm_executable() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let executable_name = "npm.cmd";
    #[cfg(not(target_os = "windows"))]
    let executable_name = "npm";

    if let Some(path) = executable_in_path(executable_name) {
        return Ok(path);
    }

    #[cfg(target_os = "macos")]
    {
        for candidate in ["/opt/homebrew/bin/npm", "/usr/local/bin/npm"] {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Ok(path);
            }
        }
    }

    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        for relative in [
            ".volta/bin/npm",
            ".asdf/shims/npm",
            ".local/share/mise/shims/npm",
        ] {
            let candidate = home.join(relative);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }

        let nvm_versions = home.join(".nvm/versions/node");
        if let Ok(entries) = fs::read_dir(nvm_versions) {
            let mut candidates: Vec<PathBuf> = entries
                .filter_map(Result::ok)
                .map(|entry| entry.path().join("bin/npm"))
                .filter(|candidate| candidate.is_file())
                .collect();
            candidates.sort();
            if let Some(candidate) = candidates.pop() {
                return Ok(candidate);
            }
        }
    }

    Err(
        "npm est introuvable. Installez Node.js/npm ou lancez Revaloop depuis un terminal où npm est disponible."
            .into(),
    )
}

fn process_status(child: &mut Child) -> Result<RuntimeStatus, String> {
    match child
        .try_wait()
        .map_err(|error| format!("Impossible de lire l’état du serveur local : {error}"))?
    {
        Some(_) => Ok(RuntimeStatus {
            running: false,
            pid: None,
        }),
        None => Ok(RuntimeStatus {
            running: true,
            pid: Some(child.id()),
        }),
    }
}

#[tauri::command]
pub fn runtime_status(state: State<'_, AppState>) -> Result<RuntimeStatus, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "L’état du serveur local est indisponible.".to_string())?;
    let Some(child) = guard.as_mut() else {
        return Ok(RuntimeStatus {
            running: false,
            pid: None,
        });
    };
    let status = process_status(child)?;
    if !status.running {
        *guard = None;
    }
    Ok(status)
}

#[tauri::command]
pub fn start_dev_server(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    expected_script: String,
) -> Result<RuntimeStatus, String> {
    let project = inspect(&path)?;
    if project.dev_script != expected_script {
        return Err(
            "Le script « dev » a changé depuis l’inspection. Vérifiez le projet puis réessayez."
                .into(),
        );
    }
    if !project.package_manager.starts_with("npm") {
        return Err(
            "Cette alpha exécute uniquement npm. Lancez les autres gestionnaires manuellement."
                .into(),
        );
    }

    let mut guard = state
        .child
        .lock()
        .map_err(|_| "L’état du serveur local est indisponible.".to_string())?;
    if let Some(child) = guard.as_mut() {
        if process_status(child)?.running {
            return Err("Un projet lancé par Revaloop est déjà actif.".into());
        }
        *guard = None;
    }

    let npm = npm_executable()?;
    let mut command = Command::new(&npm);
    command
        .args(NPM_RUN_ARGUMENTS)
        .current_dir(&project.path)
        .env("BROWSER", "none")
        .env("HOST", "127.0.0.1")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(binary_directory) = npm.parent() {
        let mut paths = vec![binary_directory.to_path_buf()];
        if let Some(existing_path) = env::var_os("PATH") {
            paths.extend(env::split_paths(&existing_path));
        }
        if let Ok(joined) = env::join_paths(paths) {
            command.env("PATH", joined);
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Impossible de lancer {NPM_RUN_LABEL} : {error}"))?;
    let status = RuntimeStatus {
        running: true,
        pid: Some(child.id()),
    };
    if let Some(stdout) = child.stdout.take() {
        stream_logs(stdout, "stdout", app.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        stream_logs(stderr, "stderr", app.clone());
    }
    *guard = Some(child);
    let _ = app.emit("runtime-status", status.clone());
    Ok(status)
}

fn terminate_child(child: &mut Child) -> Result<(), String> {
    let pid = child.id();

    #[cfg(unix)]
    {
        let result = unsafe { libc::kill(-(pid as i32), libc::SIGTERM) };
        if result != 0 {
            child
                .kill()
                .map_err(|error| format!("Impossible d’arrêter le serveur local : {error}"))?;
        }
        for _ in 0..8 {
            if child
                .try_wait()
                .map_err(|error| format!("Impossible de vérifier l’arrêt du serveur : {error}"))?
                .is_some()
            {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
        let _ = unsafe { libc::kill(-(pid as i32), libc::SIGKILL) };
    }

    #[cfg(windows)]
    {
        let pid_argument = pid.to_string();
        let tree_stopped = Command::new("taskkill")
            .args(["/PID", &pid_argument, "/T", "/F"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        if !tree_stopped {
            child
                .kill()
                .map_err(|error| format!("Impossible d’arrêter le serveur local : {error}"))?;
        }
    }

    child
        .wait()
        .map(|_| ())
        .map_err(|error| format!("Impossible de finaliser l’arrêt du serveur : {error}"))
}

pub fn stop_managed_child(state: &AppState) -> Result<(), String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "L’état du serveur local est indisponible.".to_string())?;
    if let Some(mut child) = guard.take() {
        terminate_child(&mut child)?;
    }
    Ok(())
}

#[tauri::command]
pub fn stop_dev_server(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RuntimeStatus, String> {
    stop_managed_child(&state)?;
    let status = RuntimeStatus {
        running: false,
        pid: None,
    };
    let _ = app.emit("runtime-status", status.clone());
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::{inspect, redact_log_line};
    use std::fs;

    #[test]
    fn redacts_sensitive_log_lines() {
        assert_eq!(
            redact_log_line("Authorization: Bearer top-secret"),
            "[ligne masquée : donnée potentiellement sensible]"
        );
        assert_eq!(
            redact_log_line("GET /join?token=secret"),
            "[ligne masquée : donnée potentiellement sensible]"
        );
        assert_eq!(
            redact_log_line("ready on http://127.0.0.1:3000"),
            "ready on http://127.0.0.1:3000"
        );
    }

    #[test]
    fn inspects_only_a_bounded_manifest_with_a_dev_script() {
        let fixture = std::env::temp_dir().join(format!(
            "revaloop-project-inspection-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&fixture);
        fs::create_dir_all(&fixture).unwrap();
        fs::write(
            fixture.join("package.json"),
            r#"{
              "name": "fixture-revaloop",
              "version": "1.0.0",
              "scripts": {
                "predev": "node predev.js",
                "dev": "vite --host 127.0.0.1",
                "postdev": "node postdev.js"
              }
            }"#,
        )
        .unwrap();

        let project = inspect(fixture.to_str().unwrap()).unwrap();
        assert_eq!(project.name, "fixture-revaloop");
        assert_eq!(project.dev_script, "vite --host 127.0.0.1");
        assert_eq!(project.command, "npm --ignore-scripts run dev");
        fs::remove_dir_all(fixture).unwrap();
    }
}
