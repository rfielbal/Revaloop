export type DesktopSettings = {
  projectPath: string | null;
  previewUrl: string;
  controlPlaneUrl: string;
};

export type SettingsInput = Pick<
  DesktopSettings,
  "previewUrl" | "controlPlaneUrl"
>;

export type ProjectInfo = {
  path: string;
  name: string;
  version: string | null;
  devScript: string;
  packageManager: string;
  command: string;
};

export type RuntimeStatus = {
  running: boolean;
  pid: number | null;
};

export type ProbeResult = {
  reachable: boolean;
  normalizedUrl: string;
  message: string;
};

export type LogLine = {
  stream: "stdout" | "stderr" | "system";
  line: string;
};

export type ExternalTarget = "preview" | "dashboard" | "login";

export const IPC_CHANNELS = Object.freeze({
  selectProject: "revaloop:project:select",
  inspectStoredProject: "revaloop:project:inspect-stored",
  loadSettings: "revaloop:settings:load",
  saveSettings: "revaloop:settings:save",
  runtimeStatus: "revaloop:runtime:status",
  startDevServer: "revaloop:runtime:start",
  stopDevServer: "revaloop:runtime:stop",
  probePreview: "revaloop:preview:probe",
  openExternal: "revaloop:external:open",
  previewLogEvent: "revaloop:event:preview-log",
  runtimeStatusEvent: "revaloop:event:runtime-status",
} as const);

export type DesktopBridge = Readonly<{
  runtime: "electron";
  selectProject: () => Promise<ProjectInfo | null>;
  inspectStoredProject: () => Promise<ProjectInfo | null>;
  loadSettings: () => Promise<DesktopSettings>;
  saveSettings: (settings: SettingsInput) => Promise<DesktopSettings>;
  runtimeStatus: () => Promise<RuntimeStatus>;
  startDevServer: (expectedScript: string) => Promise<RuntimeStatus>;
  stopDevServer: () => Promise<RuntimeStatus>;
  probePreview: (url: string) => Promise<ProbeResult>;
  openExternal: (target: ExternalTarget) => Promise<void>;
  onPreviewLog: (listener: (line: LogLine) => void) => () => void;
  onRuntimeStatus: (
    listener: (status: RuntimeStatus) => void,
  ) => () => void;
}>;
