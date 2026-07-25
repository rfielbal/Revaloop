import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleStop,
  Code2,
  FolderOpen,
  Globe2,
  KeyRound,
  Laptop2,
  LoaderCircle,
  LockKeyhole,
  MessageCircleMore,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";

type DesktopSettings = {
  projectPath: string | null;
  previewUrl: string;
  controlPlaneUrl: string;
};

type ProjectInfo = {
  path: string;
  name: string;
  version: string | null;
  devScript: string;
  packageManager: string;
  command: string;
};

type RuntimeStatus = {
  running: boolean;
  pid: number | null;
};

type ProbeResult = {
  reachable: boolean;
  normalizedUrl: string;
  message: string;
};

type LogLine = {
  stream: "stdout" | "stderr" | "system";
  line: string;
};

const DEFAULT_SETTINGS: DesktopSettings = {
  projectPath: null,
  previewUrl: "http://127.0.0.1:3000",
  controlPlaneUrl: "http://127.0.0.1:3000",
};

function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue.";
}

function Brand() {
  return (
    <span className="desktop-brand" aria-label="Revaloop">
      <span className="desktop-brand-mark" aria-hidden="true">
        <i />
        <i />
        <b />
      </span>
      <strong>revaloop</strong>
    </span>
  );
}

function StatusGlyph({
  tone,
}: {
  tone: "idle" | "ready" | "running" | "error";
}) {
  return (
    <span className={`status-glyph status-glyph-${tone}`} aria-hidden="true">
      {tone === "ready" || tone === "running" ? <Check /> : <span />}
    </span>
  );
}

export function App() {
  const nativeRuntime = isTauri();
  const [settings, setSettings] =
    useState<DesktopSettings>(DEFAULT_SETTINGS);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus>({
    running: false,
    pid: null,
  });
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string | null>("initialisation");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((entry: LogLine) => {
    setLogs((current) => [...current.slice(-249), entry]);
  }, []);

  const inspectProject = useCallback(async (path: string) => {
    const inspected = await invoke<ProjectInfo>("inspect_project", { path });
    setProject(inspected);
    setConsent(false);
    return inspected;
  }, []);

  const saveSettings = useCallback(
    async (next: DesktopSettings) => {
      setSettings(next);
      if (nativeRuntime) {
        const saved = await invoke<DesktopSettings>("save_settings", {
          settings: next,
        });
        setSettings(saved);
      }
    },
    [nativeRuntime],
  );

  const refreshRuntime = useCallback(async () => {
    if (!nativeRuntime) return;
    const status = await invoke<RuntimeStatus>("runtime_status");
    setRuntime(status);
  }, [nativeRuntime]);

  const probePreview = useCallback(
    async (quiet = false) => {
      if (!nativeRuntime) {
        setProbe({
          reachable: false,
          normalizedUrl: settings.previewUrl,
          message: "La vérification du port nécessite l’application native.",
        });
        return;
      }

      if (!quiet) setBusy("probe");
      setError(null);
      try {
        const result = await invoke<ProbeResult>("probe_preview", {
          url: settings.previewUrl,
        });
        setProbe(result);
      } catch (currentError) {
        setProbe(null);
        setError(errorMessage(currentError));
      } finally {
        if (!quiet) setBusy(null);
      }
    },
    [nativeRuntime, settings.previewUrl],
  );

  useEffect(() => {
    let mounted = true;
    let unlistenLog: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    async function initialise() {
      if (!nativeRuntime) {
        setBusy(null);
        setNotice(
          "Aperçu web de l’interface : les actions natives sont disponibles avec npm run desktop:dev.",
        );
        return;
      }

      try {
        const [stored, status] = await Promise.all([
          invoke<DesktopSettings>("load_settings"),
          invoke<RuntimeStatus>("runtime_status"),
        ]);
        if (!mounted) return;
        setSettings(stored);
        setRuntime(status);
        if (stored.projectPath) {
          try {
            await inspectProject(stored.projectPath);
          } catch {
            setNotice(
              "Le projet mémorisé n’est plus accessible. Choisissez son dossier à nouveau.",
            );
          }
        }

        unlistenLog = await listen<LogLine>("preview-log", (event) => {
          if (mounted) appendLog(event.payload);
        });
        unlistenStatus = await listen<RuntimeStatus>(
          "runtime-status",
          (event) => {
            if (mounted) setRuntime(event.payload);
          },
        );
      } catch (currentError) {
        if (mounted) setError(errorMessage(currentError));
      } finally {
        if (mounted) setBusy(null);
      }
    }

    void initialise();
    return () => {
      mounted = false;
      unlistenLog?.();
      unlistenStatus?.();
    };
  }, [appendLog, inspectProject, nativeRuntime]);

  useEffect(() => {
    if (logs.length && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const localState = useMemo(() => {
    if (runtime.running) {
      return {
        tone: "running" as const,
        label: "Serveur local actif",
        detail: probe?.reachable
          ? "La preview répond sur la boucle locale."
          : "Le processus démarre. Vérifiez le port quand il est prêt.",
      };
    }
    if (project) {
      return {
        tone: "ready" as const,
        label: "Projet prêt",
        detail: "Le script a été identifié et attend votre autorisation.",
      };
    }
    return {
      tone: "idle" as const,
      label: "Aucun projet sélectionné",
      detail: "Revaloop n’accède à aucun dossier sans votre choix.",
    };
  }, [probe?.reachable, project, runtime.running]);

  async function chooseProject() {
    if (!nativeRuntime) {
      setNotice("L’ouverture d’un dossier nécessite l’application native.");
      return;
    }
    setBusy("project");
    setError(null);
    setNotice(null);
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: "Choisir le projet à tester",
      });
      if (!selection || Array.isArray(selection)) return;
      const inspected = await inspectProject(selection);
      await saveSettings({ ...settings, projectPath: inspected.path });
      setNotice(
        "Projet vérifié. Aucun fichier n’a été modifié et aucun script n’a été exécuté.",
      );
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setBusy(null);
    }
  }

  async function startProject() {
    if (!project || !consent || !nativeRuntime) return;
    setBusy("start");
    setError(null);
    setNotice(null);
    setLogs([]);
    try {
      await saveSettings(settings);
      const status = await invoke<RuntimeStatus>("start_dev_server", {
        path: project.path,
        expectedScript: project.devScript,
      });
      setRuntime(status);
      appendLog({
        stream: "system",
        line: `Lancement explicite de ${project.command} dans ${project.name}.`,
      });
      window.setTimeout(() => void probePreview(true), 1400);
    } catch (currentError) {
      setError(errorMessage(currentError));
      await refreshRuntime();
    } finally {
      setBusy(null);
    }
  }

  async function stopProject() {
    if (!nativeRuntime) return;
    setBusy("stop");
    setError(null);
    try {
      const status = await invoke<RuntimeStatus>("stop_dev_server");
      setRuntime(status);
      setProbe(null);
      appendLog({
        stream: "system",
        line: "Le processus lancé par Revaloop a été arrêté.",
      });
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setBusy(null);
    }
  }

  async function persistPreviewUrl() {
    setBusy("save-url");
    setError(null);
    try {
      await saveSettings(settings);
      setProbe(null);
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setBusy(null);
    }
  }

  async function openExternal(
    target: "preview" | "dashboard" | "login",
  ) {
    if (!nativeRuntime) {
      setNotice("Cette action s’ouvre dans le navigateur depuis l’app native.");
      return;
    }
    setError(null);
    try {
      await saveSettings(settings);
      await invoke("open_external", { target });
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  return (
    <div className="desktop-shell">
      <a className="skip-link" href="#desktop-content">
        Aller au contenu
      </a>

      <aside className="desktop-sidebar">
        <Brand />
        <p className="sidebar-edition">Compagnon local · alpha</p>

        <nav aria-label="Repères de l’application">
          <a className="sidebar-link active" href="#overview">
            <Laptop2 aria-hidden="true" />
            <span>
              <strong>Aperçu</strong>
              <small>État du poste</small>
            </span>
          </a>
          <a className="sidebar-link" href="#project">
            <Code2 aria-hidden="true" />
            <span>
              <strong>Projet local</strong>
              <small>Script et preview</small>
            </span>
          </a>
          <a className="sidebar-link" href="#workspace">
            <MessageCircleMore aria-hidden="true" />
            <span>
              <strong>Espace en ligne</strong>
              <small>Retours et invitations</small>
            </span>
          </a>
        </nav>

        <div className="sidebar-security">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Accès minimal</strong>
            <p>
              Aucun secret Revaloop dans cette interface. Aucun dossier sans
              sélection explicite.
            </p>
          </div>
        </div>
      </aside>

      <main className="desktop-main" id="desktop-content">
        <header className="desktop-topbar" data-tauri-drag-region>
          <div>
            <span className="eyebrow">Poste développeur</span>
            <h1>Votre boucle locale, sous contrôle.</h1>
          </div>
          <div className={`runtime-pill runtime-pill-${localState.tone}`}>
            <StatusGlyph tone={localState.tone} />
            <span>
              <strong>{localState.label}</strong>
              <small>{localState.detail}</small>
            </span>
          </div>
        </header>

        {(notice || error) && (
          <div
            className={`desktop-notice ${error ? "desktop-notice-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {error ? <LockKeyhole aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            <p>{error ?? notice}</p>
            <button
              type="button"
              aria-label="Fermer le message"
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
            >
              Fermer
            </button>
          </div>
        )}

        <section className="desktop-intro" id="overview">
          <div className="intro-copy">
            <span className="eyebrow">Le rôle de l’application</span>
            <h2>
              Le code reste ici.
              <em> Le dialogue reste partagé.</em>
            </h2>
            <p>
              L’app prépare et surveille votre environnement local. L’espace
              web garde les invitations, messages et validations accessibles
              au client sans installation.
            </p>
          </div>
          <div className="trust-path" aria-label="Architecture actuelle">
            <div>
              <span>
                <Code2 aria-hidden="true" />
              </span>
              <strong>Votre projet</strong>
              <small>sur ce Mac</small>
            </div>
            <i aria-hidden="true">
              <ArrowRight />
            </i>
            <div>
              <span>
                <Laptop2 aria-hidden="true" />
              </span>
              <strong>Compagnon</strong>
              <small>accès explicites</small>
            </div>
            <i aria-hidden="true">
              <ArrowRight />
            </i>
            <div className="trust-path-online">
              <span>
                <Globe2 aria-hidden="true" />
              </span>
              <strong>Espace web</strong>
              <small>retours partagés</small>
            </div>
          </div>
        </section>

        <section className="desktop-grid" id="project">
          <article className="desktop-card project-card">
            <header className="card-heading">
              <div>
                <span className="eyebrow">Projet local</span>
                <h2>Choisissez ce que Revaloop peut lancer.</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => void chooseProject()}
                disabled={busy !== null || runtime.running}
                aria-label={project ? "Changer de dossier" : "Choisir un dossier"}
              >
                {busy === "project" ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <FolderOpen aria-hidden="true" />
                )}
              </button>
            </header>

            {project ? (
              <div className="project-summary">
                <div className="project-monogram" aria-hidden="true">
                  {project.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{project.name}</strong>
                  <p title={project.path}>{project.path}</p>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void chooseProject()}
                  disabled={busy !== null || runtime.running}
                >
                  Changer
                </button>
              </div>
            ) : (
              <button
                className="project-empty"
                type="button"
                onClick={() => void chooseProject()}
                disabled={busy !== null}
              >
                <span>
                  <FolderOpen aria-hidden="true" />
                </span>
                <strong>Sélectionner le dossier du projet</strong>
                <small>
                  Seul son package.json sera inspecté avant votre confirmation.
                </small>
              </button>
            )}

            <div className="script-panel">
              <div className="script-panel-label">
                <SquareTerminal aria-hidden="true" />
                <span>Commande autorisée</span>
                <small>{project?.packageManager ?? "npm"}</small>
              </div>
              <code>{project ? project.command : "en attente d’un projet"}</code>
              {project && (
                <p>
                  Script déclaré : <span>{project.devScript}</span>
                </p>
              )}
            </div>

            <label
              className={`consent-row ${!project || runtime.running ? "disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={consent}
                disabled={!project || runtime.running}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span aria-hidden="true">
                <Check />
              </span>
              <p>
                Je confirme que ce projet est fiable et j’autorise l’exécution
                de son seul script <code>dev</code>, sans{" "}
                <code>predev</code> ni <code>postdev</code>.
              </p>
            </label>

            <div className="project-actions">
              {runtime.running ? (
                <button
                  className="primary-button primary-button-stop"
                  type="button"
                  onClick={() => void stopProject()}
                  disabled={busy !== null}
                >
                  {busy === "stop" ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <CircleStop aria-hidden="true" />
                  )}
                  Arrêter le projet
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void startProject()}
                  disabled={!project || !consent || busy !== null || !nativeRuntime}
                >
                  {busy === "start" ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <Play aria-hidden="true" />
                  )}
                  Lancer le projet
                </button>
              )}
              <p>
                Revaloop ne peut arrêter que le processus qu’il a lui-même
                démarré.
              </p>
            </div>
          </article>

          <article className="desktop-card preview-card">
            <header className="card-heading">
              <div>
                <span className="eyebrow">Preview locale</span>
                <h2>Un port local, une cible explicite.</h2>
              </div>
              <span className="card-icon">
                <Radio aria-hidden="true" />
              </span>
            </header>

            <label className="field-label" htmlFor="preview-url">
              Adresse locale autorisée
            </label>
            <div className="url-field">
              <span aria-hidden="true">
                <Globe2 />
              </span>
              <input
                id="preview-url"
                type="url"
                spellCheck="false"
                value={settings.previewUrl}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    previewUrl: event.target.value,
                  }))
                }
                onBlur={() => void persistPreviewUrl()}
                disabled={busy === "save-url"}
              />
            </div>
            <p className="field-help">
              Seules les adresses <code>127.0.0.1</code>, <code>localhost</code>{" "}
              et <code>::1</code> sont acceptées par le backend natif.
            </p>

            <div
              className={`probe-panel ${
                probe?.reachable ? "probe-panel-ready" : ""
              }`}
            >
              <StatusGlyph
                tone={probe?.reachable ? "running" : runtime.running ? "ready" : "idle"}
              />
              <div>
                <strong>
                  {probe?.reachable
                    ? "La preview répond"
                    : runtime.running
                      ? "Serveur lancé, port à vérifier"
                      : "Preview hors ligne"}
                </strong>
                <p>
                  {probe?.message ??
                    "Le test ouvre seulement une connexion TCP locale courte."}
                </p>
              </div>
            </div>

            <div className="preview-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void probePreview()}
                disabled={busy !== null || !nativeRuntime}
              >
                {busy === "probe" ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                Vérifier le port
              </button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void openExternal("preview")}
                disabled={busy !== null || !nativeRuntime}
              >
                Ouvrir
                <ArrowUpRight aria-hidden="true" />
              </button>
            </div>

            <div className="boundary-note">
              <LockKeyhole aria-hidden="true" />
              <p>
                Cette alpha ne publie pas encore <code>localhost</code> sur
                Internet. Le futur tunnel utilisera une connexion sortante et
                une autorisation courte, jamais un port entrant.
              </p>
            </div>
          </article>
        </section>

        <section className="workspace-section" id="workspace">
          <article className="workspace-card">
            <div className="workspace-copy">
              <span className="eyebrow">Espace en ligne</span>
              <h2>Retrouvez les retours sans déplacer la session.</h2>
              <p>
                L’authentification web reste dans votre navigateur. L’app
                desktop ne lit ni votre mot de passe, ni vos cookies, ni le
                secret d’une invitation cliente.
              </p>
              <label className="field-label" htmlFor="control-plane-url">
                Instance Revaloop
              </label>
              <div className="url-field url-field-light">
                <span aria-hidden="true">
                  <Globe2 />
                </span>
                <input
                  id="control-plane-url"
                  type="url"
                  spellCheck="false"
                  value={settings.controlPlaneUrl}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      controlPlaneUrl: event.target.value,
                    }))
                  }
                  onBlur={() => void saveSettings(settings)}
                />
              </div>
              <div className="workspace-actions">
                <button
                  className="primary-button primary-button-light"
                  type="button"
                  onClick={() => void openExternal("dashboard")}
                  disabled={!nativeRuntime}
                >
                  Ouvrir mes retours
                  <ArrowUpRight aria-hidden="true" />
                </button>
                <button
                  className="workspace-login"
                  type="button"
                  onClick={() => void openExternal("login")}
                  disabled={!nativeRuntime}
                >
                  <KeyRound aria-hidden="true" />
                  Se connecter
                </button>
              </div>
            </div>

            <div className="workspace-illustration" aria-hidden="true">
              <div className="workspace-window">
                <span />
                <span />
                <span />
                <article>
                  <small>Retour client</small>
                  <strong>Le formulaire confirme-t-il bien l’envoi ?</strong>
                  <i />
                  <i />
                </article>
                <b>✓</b>
              </div>
              <div className="workspace-thread">
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        </section>

        <section className="log-section" aria-labelledby="log-title">
          <header>
            <div>
              <span className="eyebrow">Journal éphémère</span>
              <h2 id="log-title">Ce que dit le serveur local.</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setLogs([])}
              disabled={logs.length === 0}
            >
              Effacer
            </button>
          </header>
          <div
            className="terminal"
            ref={logContainerRef}
            role="log"
            aria-live="polite"
          >
            {logs.length ? (
              logs.map((entry, index) => (
                <p key={`${index}-${entry.line}`} data-stream={entry.stream}>
                  <span>
                    {entry.stream === "stderr"
                      ? "erreur"
                      : entry.stream === "system"
                        ? "revaloop"
                        : "serveur"}
                  </span>
                  {entry.line}
                </p>
              ))
            ) : (
              <div className="terminal-empty">
                <SquareTerminal aria-hidden="true" />
                <p>
                  Les logs apparaîtront ici, resteront en mémoire et seront
                  oubliés à la fermeture de l’app.
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="desktop-footer">
          <p>
            Revaloop desktop ne remplace pas le service partagé : il prépare le
            futur agent local sans affaiblir la sécurité du site.
          </p>
          <span>Open source · alpha locale</span>
        </footer>
      </main>
    </div>
  );
}
