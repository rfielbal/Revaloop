import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleStop,
  Cloud,
  CloudOff,
  Code2,
  Copy,
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
  Share2,
  SquareTerminal,
} from "lucide-react";
import {
  DEFAULT_CONTROL_PLANE_URL,
  DEFAULT_PREVIEW_URL,
} from "../electron/shared/contract";
import {
  chooseNativeProject,
  copyNativeTunnelUrl,
  getRuntimeStatus,
  getTunnelStatus,
  hasNativeRuntime,
  hasTunnelRuntime,
  inspectStoredProject,
  loadDesktopSettings,
  onNativePreviewLog,
  onNativeRuntimeStatus,
  onNativeTunnelStatus,
  openNativeExternal,
  openNativeTunnelPreview,
  openNativeTunnelWorkspace,
  probeNativePreview,
  saveDesktopSettings,
  startNativeDevServer,
  startNativeTunnel,
  stopNativeDevServer,
  stopNativeTunnel,
  type DesktopSettings,
  type LogLine,
  type ProbeResult,
  type ProjectInfo,
  type RuntimeStatus,
  type TunnelStatus,
} from "./desktop-runtime";
import {
  DESKTOP_SECTION_IDS,
  activeSectionFromPositions,
  sectionActivationLine,
  type DesktopSectionId,
} from "./section-navigation";
import { persistControlPlaneSettings } from "../electron/shared/control-plane-settings";
import { persistPreviewSettings } from "../electron/shared/preview-settings";

const DEFAULT_SETTINGS: DesktopSettings = {
  projectPath: null,
  previewUrl: DEFAULT_PREVIEW_URL,
  controlPlaneUrl: DEFAULT_CONTROL_PLANE_URL,
};

const DEFAULT_TUNNEL_STATUS: TunnelStatus = {
  state: "checking",
  available: null,
  url: null,
  message: "Recherche de cloudflared sur ce poste…",
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
  const nativeRuntime = hasNativeRuntime();
  const tunnelRuntime = hasTunnelRuntime();
  const [settings, setSettings] =
    useState<DesktopSettings>(DEFAULT_SETTINGS);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus>({
    running: false,
    pid: null,
  });
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [tunnel, setTunnel] = useState<TunnelStatus>(
    DEFAULT_TUNNEL_STATUS,
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [consent, setConsent] = useState(false);
  const [activeSection, setActiveSection] =
    useState<DesktopSectionId>("overview");
  const [busy, setBusy] = useState<string | null>("initialisation");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlPlaneFeedback, setControlPlaneFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLElement>(null);
  const settingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistedSettingsRef =
    useRef<DesktopSettings>(DEFAULT_SETTINGS);

  const appendLog = useCallback((entry: LogLine) => {
    setLogs((current) => [...current.slice(-249), entry]);
  }, []);

  const enqueueSettingsWrite = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const result = settingsWriteQueueRef.current.then(operation);
      settingsWriteQueueRef.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [],
  );

  const inspectProject = useCallback(async (path: string) => {
    const inspected = await inspectStoredProject(path);
    if (!inspected) {
      throw new Error("Le projet mémorisé n’est plus accessible.");
    }
    setProject(inspected);
    setConsent(false);
    return inspected;
  }, []);

  const refreshRuntime = useCallback(async () => {
    if (!nativeRuntime) return;
    const status = await getRuntimeStatus();
    setRuntime(status);
  }, [nativeRuntime]);

  const probePreview = useCallback(
    async (quiet = false) => {
      if (!nativeRuntime) {
        setProbe({
          reachable: false,
          normalizedUrl: settings.previewUrl,
          message:
            "La vérification nécessite l’application Electron ou le fallback Tauri.",
        });
        return;
      }

      if (!quiet) setBusy("probe");
      setError(null);
      try {
        const result = await probeNativePreview(settings.previewUrl);
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
    let unlistenTunnelStatus: (() => void) | undefined;

    async function initialise() {
      if (!nativeRuntime) {
        setBusy(null);
        setNotice(
          "Aperçu web de l’interface : les actions natives sont disponibles avec npm run desktop:dev.",
        );
        return;
      }

      try {
        const subscriptions = await Promise.allSettled([
          onNativePreviewLog((line) => {
            if (mounted) appendLog(line);
          }),
          onNativeRuntimeStatus((status) => {
            if (mounted) setRuntime(status);
          }),
          tunnelRuntime
            ? onNativeTunnelStatus((status) => {
                if (mounted) setTunnel(status);
              })
            : Promise.resolve(undefined),
        ]);

        if (!mounted) {
          for (const subscription of subscriptions) {
            if (
              subscription.status === "fulfilled" &&
              typeof subscription.value === "function"
            ) {
              subscription.value();
            }
          }
          return;
        }

        if (subscriptions[0].status === "fulfilled") {
          unlistenLog = subscriptions[0].value;
        }
        if (subscriptions[1].status === "fulfilled") {
          unlistenStatus = subscriptions[1].value;
        }
        if (
          subscriptions[2].status === "fulfilled" &&
          typeof subscriptions[2].value === "function"
        ) {
          unlistenTunnelStatus = subscriptions[2].value;
        }

        const [storedResult, statusResult, tunnelResult] =
          await Promise.allSettled([
          loadDesktopSettings(),
          getRuntimeStatus(),
          tunnelRuntime
            ? getTunnelStatus()
            : Promise.resolve<TunnelStatus>({
                state: "unavailable",
                available: false,
                url: null,
                message:
                  "Le tunnel temporaire nécessite le compagnon Electron.",
              }),
          ]);
        if (!mounted) return;

        const initialisationErrors = subscriptions
          .filter((result) => result.status === "rejected")
          .map((result) => errorMessage(result.reason));

        if (storedResult.status === "fulfilled") {
          persistedSettingsRef.current = storedResult.value;
          setSettings(storedResult.value);
        } else {
          initialisationErrors.push(errorMessage(storedResult.reason));
        }
        if (statusResult.status === "fulfilled") {
          setRuntime(statusResult.value);
        } else {
          initialisationErrors.push(errorMessage(statusResult.reason));
        }
        if (tunnelResult.status === "fulfilled") {
          setTunnel(tunnelResult.value);
        } else {
          setTunnel({
            state: "error",
            available: null,
            url: null,
            message:
              "Le diagnostic cloudflared a échoué. Le projet local reste utilisable.",
          });
          initialisationErrors.push(errorMessage(tunnelResult.reason));
        }

        if (initialisationErrors.length) {
          setError([...new Set(initialisationErrors)].join(" "));
        }

        if (
          storedResult.status === "fulfilled" &&
          storedResult.value.projectPath
        ) {
          try {
            await inspectProject(storedResult.value.projectPath);
          } catch {
            setNotice(
              "Le projet mémorisé n’est plus accessible. Choisissez son dossier à nouveau.",
            );
          }
        }
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
      unlistenTunnelStatus?.();
    };
  }, [appendLog, inspectProject, nativeRuntime, tunnelRuntime]);

  useEffect(() => {
    if (logs.length && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const main = mainContainerRef.current;
    if (!main) return;

    let frame: number | null = null;
    const update = () => {
      frame = null;
      const mainStyle = window.getComputedStyle(main);
      const mainScrolls =
        mainStyle.overflowY !== "visible" &&
        main.scrollHeight > main.clientHeight + 1;
      const activationLine = sectionActivationLine({
        containerTop: main.getBoundingClientRect().top,
        containerHeight: main.clientHeight,
        viewportHeight: window.innerHeight,
        scrollsInternally: mainScrolls,
      });
      const positions = DESKTOP_SECTION_IDS.flatMap((id) => {
        const section = document.getElementById(id);
        return section ? [{ id, top: section.getBoundingClientRect().top }] : [];
      });
      setActiveSection(
        activeSectionFromPositions(positions, activationLine),
      );
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    main.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(main);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      main.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, []);

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
      const inspected = await chooseNativeProject();
      if (!inspected) return;
      await enqueueSettingsWrite(async () => {
        const saved = await saveDesktopSettings({
          ...persistedSettingsRef.current,
          projectPath: inspected.path,
        });
        persistedSettingsRef.current = saved;
        setSettings((current) => ({
          ...current,
          projectPath: saved.projectPath,
        }));
      });
      setProject(inspected);
      setConsent(false);
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
      const status = await startNativeDevServer(project);
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
      const status = await stopNativeDevServer();
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

  async function refreshTunnel() {
    if (!tunnelRuntime) {
      setNotice(
        "Le tunnel temporaire nécessite Electron (npm run desktop:dev).",
      );
      return;
    }
    setBusy("tunnel-check");
    setError(null);
    try {
      setTunnel(await getTunnelStatus());
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setBusy(null);
    }
  }

  async function startTunnel() {
    if (!tunnelRuntime) return;
    setBusy("tunnel-start");
    setError(null);
    setNotice(null);
    try {
      if (!(await persistPreviewUrl())) return;
      const localProbe = await probeNativePreview(settings.previewUrl);
      setProbe(localProbe);
      if (!localProbe.reachable) {
        throw new Error(
          "La preview locale ne répond pas encore en HTTP. Vérifiez son adresse avant de la partager.",
        );
      }
      const status = await startNativeTunnel();
      setTunnel(status);
      setNotice(
        "Lien temporaire créé. Il reste public jusqu’à l’arrêt du tunnel ou du projet.",
      );
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setBusy(null);
    }
  }

  async function stopTunnel() {
    if (!tunnelRuntime) return;
    setBusy("tunnel-stop");
    setError(null);
    try {
      const status = await stopNativeTunnel();
      setTunnel(status);
      setNotice("Le lien public temporaire a été révoqué.");
    } catch (currentError) {
      setError(errorMessage(currentError));
    } finally {
      setBusy(null);
    }
  }

  async function copyTunnelUrl() {
    setError(null);
    try {
      await copyNativeTunnelUrl();
      setNotice(
        "Adresse publique copiée pour vérification. Transmettez ensuite l’invitation Revaloop à la cliente.",
      );
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  async function openTunnelPreview() {
    setError(null);
    try {
      await openNativeTunnelPreview();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  async function continueWithTunnel() {
    setError(null);
    try {
      if (!(await persistControlPlaneUrl())) return;
      await openNativeTunnelWorkspace();
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  async function persistPreviewUrl(): Promise<boolean> {
    const previewUrl = settings.previewUrl;
    setError(null);
    return enqueueSettingsWrite(async () => {
      const persisted = persistedSettingsRef.current;
      const candidate: DesktopSettings = {
        ...persisted,
        previewUrl,
      };
      const result = await persistPreviewSettings({
        candidate,
        persisted,
        save: nativeRuntime
          ? saveDesktopSettings
          : async (next) => next,
      });
      if (result.ok) {
        persistedSettingsRef.current = result.settings;
      }
      setSettings((current) =>
        current.previewUrl === previewUrl
          ? {
              ...current,
              previewUrl: result.settings.previewUrl,
            }
          : current,
      );
      setProbe(null);
      if (!result.ok) setError(result.message);
      return result.ok;
    });
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
      const ready =
        target === "preview"
          ? await persistPreviewUrl()
          : await persistControlPlaneUrl();
      if (!ready) return;
      await openNativeExternal(target);
    } catch (currentError) {
      setError(errorMessage(currentError));
    }
  }

  async function persistControlPlaneUrl() {
    const controlPlaneUrl = settings.controlPlaneUrl;
    setControlPlaneFeedback(null);
    return enqueueSettingsWrite(async () => {
      const persisted = persistedSettingsRef.current;
      const candidate: DesktopSettings = {
        ...persisted,
        controlPlaneUrl,
      };
      const result = await persistControlPlaneSettings({
        candidate,
        persisted,
        save: nativeRuntime
          ? saveDesktopSettings
          : async (next) => next,
      });
      if (result.ok) {
        persistedSettingsRef.current = result.settings;
      }
      setSettings((current) =>
        current.controlPlaneUrl === controlPlaneUrl
          ? {
              ...current,
              controlPlaneUrl: result.settings.controlPlaneUrl,
            }
          : current,
      );
      setControlPlaneFeedback({
        tone: result.ok ? "success" : "error",
        message: result.message,
      });
      return result.ok;
    });
  }

  return (
    <div className="desktop-shell">
      <a className="skip-link" href="#desktop-content">
        Aller au contenu
      </a>

      <aside className="desktop-sidebar">
        <Brand />
        <p className="sidebar-edition">Mode local · sans compte</p>

        <nav aria-label="Repères de l’application">
          <a
            className={`sidebar-link ${activeSection === "overview" ? "active" : ""}`}
            href="#overview"
            aria-label="Aperçu — état du poste"
            aria-current={
              activeSection === "overview" ? "location" : undefined
            }
            onClick={() => setActiveSection("overview")}
          >
            <Laptop2 aria-hidden="true" />
            <span>
              <strong>Aperçu</strong>
              <small>État du poste</small>
            </span>
          </a>
          <a
            className={`sidebar-link ${activeSection === "project" ? "active" : ""}`}
            href="#project"
            aria-label="Projet local — script et preview"
            aria-current={
              activeSection === "project" ? "location" : undefined
            }
            onClick={() => setActiveSection("project")}
          >
            <Code2 aria-hidden="true" />
            <span>
              <strong>Projet local</strong>
              <small>Script et preview</small>
            </span>
          </a>
          <a
            className={`sidebar-link ${activeSection === "workspace" ? "active" : ""}`}
            href="#workspace"
            aria-label="Espace en ligne — navigateur séparé"
            aria-current={
              activeSection === "workspace" ? "location" : undefined
            }
            onClick={() => setActiveSection("workspace")}
          >
            <MessageCircleMore aria-hidden="true" />
            <span>
              <strong>Espace en ligne</strong>
              <small>Navigateur séparé</small>
            </span>
          </a>
        </nav>

        <div className="sidebar-security">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Deux espaces séparés</strong>
            <p>
              Le projet se lance ici sans compte. La connexion et les retours
              restent dans le navigateur.
            </p>
          </div>
        </div>
      </aside>

      <main
        className="desktop-main"
        id="desktop-content"
        ref={mainContainerRef}
      >
        <header className="desktop-topbar" data-tauri-drag-region>
          <div>
            <span className="eyebrow">Compagnon local · non connecté</span>
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
              <em> Le web reste séparé.</em>
            </h2>
            <p>
              Cette fenêtre ne possède aucun compte Revaloop. Elle choisit et
              lance un projet sur ce poste ; l’espace web s’ouvre séparément
              dans votre navigateur pour la connexion, les invitations et les
              retours.
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
              <small>navigateur séparé</small>
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

            <div className="project-contract" role="note">
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>Un dossier local, pas un téléversement.</strong>
                <p>
                  Choisissez la racine contenant un <code>package.json</code>{" "}
                  et un script <code>scripts.dev</code>. Aucun fichier du projet
                  n’est envoyé à Revaloop.
                </p>
              </div>
            </div>

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
                  La racine doit déclarer package.json → scripts.dev.
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
                      ? "Serveur lancé, preview à vérifier"
                      : "Preview hors ligne"}
                </strong>
                <p>
                  {probe?.message ??
                    (tunnelRuntime
                      ? "Electron vérifie une réponse HTTP locale sans suivre de redirection."
                      : "Le fallback Tauri vérifie seulement l’ouverture TCP du port local.")}
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
                Vérifier la preview
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

            <div
              className={`tunnel-panel tunnel-panel-${tunnel.state}`}
              aria-live="polite"
            >
              <header className="tunnel-heading">
                <span className="tunnel-icon" aria-hidden="true">
                  {tunnel.state === "starting" ||
                  tunnel.state === "stopping" ||
                  tunnel.state === "checking" ? (
                    <LoaderCircle className="spin" />
                  ) : tunnel.state === "online" ? (
                    <Cloud />
                  ) : (
                    <CloudOff />
                  )}
                </span>
                <div>
                  <span className="eyebrow">Adresse publique temporaire</span>
                  <strong>
                    {tunnel.state === "online"
                      ? "Adresse publique créée"
                      : tunnel.state === "starting"
                        ? "Création du lien en cours"
                        : tunnel.state === "stopping"
                          ? "Révocation du lien en cours"
                          : tunnel.state === "unavailable"
                            ? "cloudflared doit être installé"
                            : "Aucun lien public actif"}
                  </strong>
                </div>
              </header>

              <p className="tunnel-message">{tunnel.message}</p>

              {tunnel.state === "unavailable" && tunnelRuntime && (
                <div className="tunnel-install" role="note">
                  <strong>Installation manuelle requise</strong>
                  <code>brew install cloudflared</code>
                  <small>
                    Windows : <code>winget install Cloudflare.cloudflared</code>.
                    Revaloop ne télécharge, n’installe et ne met jamais à jour
                    cet outil silencieusement.
                  </small>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void refreshTunnel()}
                    disabled={busy !== null}
                  >
                    <RefreshCw aria-hidden="true" />
                    Revérifier
                  </button>
                </div>
              )}

              {tunnel.state === "unavailable" && !tunnelRuntime && (
                <div className="tunnel-install" role="note">
                  <strong>Ouvrez la version Electron</strong>
                  <code>npm run desktop:dev</code>
                  <small>
                    La variante Tauri reste limitée au lancement local dans ce
                    pilote ; elle ne démarre aucun tunnel.
                  </small>
                </div>
              )}

              {tunnel.state === "online" && tunnel.url && (
                <div className="tunnel-link">
                  <label htmlFor="tunnel-public-url">
                    Adresse de preview à vérifier
                  </label>
                  <input
                    id="tunnel-public-url"
                    type="url"
                    value={tunnel.url}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <div className="tunnel-link-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void copyTunnelUrl()}
                    >
                      <Copy aria-hidden="true" />
                      Copier pour vérifier
                    </button>
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={() => void openTunnelPreview()}
                    >
                      Ouvrir
                      <ArrowUpRight aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              <div className="tunnel-actions">
                {tunnel.state === "online" ||
                tunnel.state === "starting" ||
                tunnel.state === "stopping" ? (
                  <button
                    className="secondary-button tunnel-stop-button"
                    type="button"
                    onClick={() => void stopTunnel()}
                    disabled={
                      tunnel.state === "stopping" || busy === "tunnel-stop"
                    }
                  >
                    {tunnel.state === "stopping" ? (
                      <LoaderCircle className="spin" aria-hidden="true" />
                    ) : (
                      <CircleStop aria-hidden="true" />
                    )}
                    Révoquer le lien
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void startTunnel()}
                    disabled={
                      !tunnelRuntime ||
                      !runtime.running ||
                      tunnel.available === false ||
                      busy !== null
                    }
                  >
                    {busy === "tunnel-start" ? (
                      <LoaderCircle className="spin" aria-hidden="true" />
                    ) : (
                      <Share2 aria-hidden="true" />
                    )}
                    Partager cette preview
                  </button>
                )}
                {tunnel.state === "online" && (
                  <button
                    className="primary-button tunnel-continue-button"
                    type="button"
                    onClick={() => void continueWithTunnel()}
                  >
                    Continuer dans Revaloop
                    <ArrowUpRight aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div className="boundary-note">
              <LockKeyhole aria-hidden="true" />
              <p>
                Le sous-domaine <code>trycloudflare.com</code> est public,
                aléatoire et non durable. Revaloop redemande avant chaque
                partage de confirmer une base isolée, des données fictives et
                des intégrations sandbox ; il ne peut pas isoler automatiquement
                la base d’un projet arbitraire. Après vérification, transmettez
                normalement l’invitation Revaloop à la cliente, pas cette
                adresse brute.
              </p>
            </div>
          </article>
        </section>

        <section className="workspace-section" id="workspace">
          <article className="workspace-card">
            <div className="workspace-copy">
              <span className="eyebrow">Espace web séparé</span>
              <h2>Connexion et retours restent dans votre navigateur.</h2>
              <p>
                Cette application native ne possède pas de session Revaloop,
                n’upload aucun projet et n’affiche pas encore les retours.
                Les boutons ci-dessous ouvrent le site dans le navigateur, où
                le compte et les cookies restent isolés de l’application.
              </p>
              <div className="workspace-boundary" role="note">
                <KeyRound aria-hidden="true" />
                <div>
                  <strong>Vous n’êtes pas connecté dans l’application.</strong>
                  <p>
                    Une connexion ouverte dans le navigateur n’est pas importée
                    dans le compagnon. L’accès dépend aussi des droits de
                    l’instance choisie.
                  </p>
                </div>
              </div>
              <label className="field-label" htmlFor="control-plane-url">
                Instance Revaloop
              </label>
              <div
                className={`url-field url-field-light ${
                  controlPlaneFeedback?.tone === "error"
                    ? "url-field-error"
                    : ""
                }`}
              >
                <span aria-hidden="true">
                  <Globe2 />
                </span>
                <input
                  id="control-plane-url"
                  type="url"
                  spellCheck="false"
                  value={settings.controlPlaneUrl}
                  aria-invalid={controlPlaneFeedback?.tone === "error"}
                  aria-describedby={
                    controlPlaneFeedback
                      ? "control-plane-feedback"
                      : undefined
                  }
                  onChange={(event) => {
                    setControlPlaneFeedback(null);
                    setSettings((current) => ({
                      ...current,
                      controlPlaneUrl: event.target.value,
                    }));
                  }}
                  onBlur={() => void persistControlPlaneUrl()}
                />
              </div>
              <p className="workspace-instance-help">
                Cette origine vise le service Revaloop, jamais la preview locale.
                Vous pouvez indiquer une autre instance HTTPS compatible, mais
                l’auto-hébergement hors Sites n’est pas encore qualifié par le
                projet.
              </p>
              {controlPlaneFeedback && (
                <p
                  className={`field-feedback field-feedback-${controlPlaneFeedback.tone}`}
                  id="control-plane-feedback"
                  role={
                    controlPlaneFeedback.tone === "error"
                      ? "alert"
                      : "status"
                  }
                >
                  {controlPlaneFeedback.message}
                </p>
              )}
              <div className="workspace-actions">
                <button
                  className="primary-button primary-button-light"
                  type="button"
                  onClick={() => void openExternal("dashboard")}
                  disabled={!nativeRuntime}
                >
                  Ouvrir le tableau de bord web
                  <ArrowUpRight aria-hidden="true" />
                </button>
                <button
                  className="workspace-login"
                  type="button"
                  onClick={() => void openExternal("login")}
                  disabled={!nativeRuntime}
                >
                  <KeyRound aria-hidden="true" />
                  Se connecter sur le web
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
            Le compagnon garde le code sur ce poste et ne publie la preview
            qu’après une confirmation native explicite et temporaire.
          </p>
          <span>Open source · pilote sécurisé</span>
        </footer>
      </main>
    </div>
  );
}
