import type {
  DesktopBridge,
  DesktopSettings,
  ExternalTarget,
  LogLine,
  ProbeResult,
  ProjectInfo,
  RuntimeStatus,
} from "../electron/shared/contract";

declare global {
  interface Window {
    revaloopDesktop?: DesktopBridge;
    __TAURI_INTERNALS__?: unknown;
  }
}

function electronBridge(): DesktopBridge | null {
  return window.revaloopDesktop?.runtime === "electron"
    ? window.revaloopDesktop
    : null;
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function hasNativeRuntime(): boolean {
  return Boolean(electronBridge()) || isTauriRuntime();
}

async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function loadDesktopSettings(): Promise<DesktopSettings> {
  const bridge = electronBridge();
  if (bridge) return bridge.loadSettings();
  return tauriInvoke<DesktopSettings>("load_settings");
}

export async function saveDesktopSettings(
  settings: DesktopSettings,
): Promise<DesktopSettings> {
  const bridge = electronBridge();
  if (bridge) {
    return bridge.saveSettings({
      previewUrl: settings.previewUrl,
      controlPlaneUrl: settings.controlPlaneUrl,
    });
  }
  return tauriInvoke<DesktopSettings>("save_settings", { settings });
}

export async function chooseNativeProject(): Promise<ProjectInfo | null> {
  const bridge = electronBridge();
  if (bridge) return bridge.selectProject();

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    directory: true,
    multiple: false,
    title: "Choisir le projet à tester",
  });
  if (!selection || Array.isArray(selection)) return null;
  return tauriInvoke<ProjectInfo>("inspect_project", { path: selection });
}

export async function inspectStoredProject(
  path: string,
): Promise<ProjectInfo | null> {
  const bridge = electronBridge();
  if (bridge) return bridge.inspectStoredProject();
  return tauriInvoke<ProjectInfo>("inspect_project", { path });
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const bridge = electronBridge();
  if (bridge) return bridge.runtimeStatus();
  return tauriInvoke<RuntimeStatus>("runtime_status");
}

export async function startNativeDevServer(
  project: ProjectInfo,
): Promise<RuntimeStatus> {
  const bridge = electronBridge();
  if (bridge) return bridge.startDevServer(project.devScript);
  return tauriInvoke<RuntimeStatus>("start_dev_server", {
    path: project.path,
    expectedScript: project.devScript,
  });
}

export async function stopNativeDevServer(): Promise<RuntimeStatus> {
  const bridge = electronBridge();
  if (bridge) return bridge.stopDevServer();
  return tauriInvoke<RuntimeStatus>("stop_dev_server");
}

export async function probeNativePreview(url: string): Promise<ProbeResult> {
  const bridge = electronBridge();
  if (bridge) return bridge.probePreview(url);
  return tauriInvoke<ProbeResult>("probe_preview", { url });
}

export async function openNativeExternal(
  target: ExternalTarget,
): Promise<void> {
  const bridge = electronBridge();
  if (bridge) return bridge.openExternal(target);
  return tauriInvoke<void>("open_external", { target });
}

export async function onNativePreviewLog(
  listener: (line: LogLine) => void,
): Promise<() => void> {
  const bridge = electronBridge();
  if (bridge) return bridge.onPreviewLog(listener);
  const { listen } = await import("@tauri-apps/api/event");
  return listen<LogLine>("preview-log", (event) => listener(event.payload));
}

export async function onNativeRuntimeStatus(
  listener: (status: RuntimeStatus) => void,
): Promise<() => void> {
  const bridge = electronBridge();
  if (bridge) return bridge.onRuntimeStatus(listener);
  const { listen } = await import("@tauri-apps/api/event");
  return listen<RuntimeStatus>("runtime-status", (event) =>
    listener(event.payload),
  );
}

export type {
  DesktopSettings,
  ExternalTarget,
  LogLine,
  ProbeResult,
  ProjectInfo,
  RuntimeStatus,
};
