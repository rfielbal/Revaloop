export type DesktopSettings = {
  projectPath: string | null;
  previewUrl: string;
  controlPlaneUrl: string;
};

export const DEFAULT_PREVIEW_URL = "http://127.0.0.1:3000/";
export const DEFAULT_CONTROL_PLANE_URL =
  "https://revaloop-rfielbal.moulbyte.chatgpt.site/";

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

export type TunnelState =
  | "checking"
  | "unavailable"
  | "offline"
  | "starting"
  | "online"
  | "stopping"
  | "error";

export type TunnelStatus = {
  state: TunnelState;
  available: boolean | null;
  url: string | null;
  message: string;
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
  tunnelStatus: "revaloop:tunnel:status",
  startTunnel: "revaloop:tunnel:start",
  stopTunnel: "revaloop:tunnel:stop",
  copyTunnelUrl: "revaloop:tunnel:copy-url",
  openTunnelPreview: "revaloop:tunnel:open-preview",
  openTunnelWorkspace: "revaloop:tunnel:open-workspace",
  openExternal: "revaloop:external:open",
  previewLogEvent: "revaloop:event:preview-log",
  runtimeStatusEvent: "revaloop:event:runtime-status",
  tunnelStatusEvent: "revaloop:event:tunnel-status",
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
  tunnelStatus: () => Promise<TunnelStatus>;
  startTunnel: () => Promise<TunnelStatus>;
  stopTunnel: () => Promise<TunnelStatus>;
  copyTunnelUrl: () => Promise<void>;
  openTunnelPreview: () => Promise<void>;
  openTunnelWorkspace: () => Promise<void>;
  openExternal: (target: ExternalTarget) => Promise<void>;
  onPreviewLog: (listener: (line: LogLine) => void) => () => void;
  onRuntimeStatus: (
    listener: (status: RuntimeStatus) => void,
  ) => () => void;
  onTunnelStatus: (
    listener: (status: TunnelStatus) => void,
  ) => () => void;
}>;
