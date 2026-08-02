import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type DesktopBridge,
  type LogLine,
  type RuntimeStatus,
  type TunnelStatus,
} from "../shared/contract.ts";

function onEvent<T>(
  channel: string,
  listener: (payload: T) => void,
): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => {
    listener(payload);
  };
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const bridge: DesktopBridge = Object.freeze({
  runtime: "electron" as const,
  selectProject: () => ipcRenderer.invoke(IPC_CHANNELS.selectProject),
  inspectStoredProject: () =>
    ipcRenderer.invoke(IPC_CHANNELS.inspectStoredProject),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.loadSettings),
  saveSettings: (settings) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveSettings, {
      previewUrl: settings.previewUrl,
      controlPlaneUrl: settings.controlPlaneUrl,
    }),
  runtimeStatus: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeStatus),
  startDevServer: (expectedScript) =>
    ipcRenderer.invoke(IPC_CHANNELS.startDevServer, expectedScript),
  stopDevServer: () => ipcRenderer.invoke(IPC_CHANNELS.stopDevServer),
  probePreview: (url) =>
    ipcRenderer.invoke(IPC_CHANNELS.probePreview, url),
  tunnelStatus: () => ipcRenderer.invoke(IPC_CHANNELS.tunnelStatus),
  startTunnel: () => ipcRenderer.invoke(IPC_CHANNELS.startTunnel),
  stopTunnel: () => ipcRenderer.invoke(IPC_CHANNELS.stopTunnel),
  copyTunnelUrl: () => ipcRenderer.invoke(IPC_CHANNELS.copyTunnelUrl),
  openTunnelPreview: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openTunnelPreview),
  openTunnelWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openTunnelWorkspace),
  openExternal: (target) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternal, target),
  onPreviewLog: (listener) =>
    onEvent<LogLine>(IPC_CHANNELS.previewLogEvent, listener),
  onRuntimeStatus: (listener) =>
    onEvent<RuntimeStatus>(IPC_CHANNELS.runtimeStatusEvent, listener),
  onTunnelStatus: (listener) =>
    onEvent<TunnelStatus>(IPC_CHANNELS.tunnelStatusEvent, listener),
});

contextBridge.exposeInMainWorld("revaloopDesktop", bridge);
