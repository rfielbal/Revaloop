import {
  clipboard,
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import type {
  DesktopSettings,
  ProjectInfo,
} from "../shared/contract.ts";
import { IPC_CHANNELS } from "../shared/contract.ts";
import {
  connectPreviewUrlFor,
  externalUrlFor,
  quickTunnelPreviewUrl,
} from "./navigation.ts";
import { probePreview } from "./preview.ts";
import { inspectProject, RuntimeManager } from "./project.ts";
import {
  LaunchAuthorizationStore,
  requestLaunchAuthorization,
} from "./launch-authorization.ts";
import { SettingsStore } from "./settings.ts";
import {
  requestTunnelAuthorization,
  TunnelAuthorizationStore,
} from "./tunnel-authorization.ts";
import { TunnelManager } from "./tunnel.ts";
import {
  isTrustedRendererUrl,
  parseExpectedScript,
  parseExternalTarget,
  parseSettingsInput,
} from "./validation.ts";

type IpcServices = {
  getWindow: () => BrowserWindow | null;
  rendererDevUrl: string | null;
  settings: SettingsStore;
  runtime: RuntimeManager;
  tunnel: TunnelManager;
};

function assertNoPayload(payload: unknown): void {
  if (payload !== undefined) {
    throw new Error("Cet appel IPC n’accepte aucune donnée.");
  }
}

function activeTunnelUrl(tunnel: TunnelManager): string {
  const status = tunnel.status();
  if (status.state !== "online" || !status.url) {
    throw new Error("Aucun lien public temporaire n’est actif.");
  }
  return status.url;
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  services: IpcServices,
): void {
  const window = services.getWindow();
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isTrustedRendererUrl(
      event.senderFrame.url,
      services.rendererDevUrl,
    )
  ) {
    throw new Error("Appel IPC refusé.");
  }
}

function handle(
  channel: string,
  services: IpcServices,
  handler: (
    event: IpcMainInvokeEvent,
    payload: unknown,
  ) => unknown | Promise<unknown>,
): void {
  ipcMain.handle(channel, async (event, payload) => {
    assertTrustedSender(event, services);
    return handler(event, payload);
  });
}

export function registerIpcHandlers(services: IpcServices): () => void {
  let selectedProject: ProjectInfo | null = null;
  const launchAuthorizations = new LaunchAuthorizationStore();
  const tunnelAuthorizations = new TunnelAuthorizationStore();

  handle(IPC_CHANNELS.selectProject, services, async (_event, payload) => {
    assertNoPayload(payload);
    launchAuthorizations.revokeAll();
    tunnelAuthorizations.revokeAll();
    await services.tunnel.stop();
    const window = services.getWindow();
    if (!window) throw new Error("La fenêtre principale est indisponible.");
    const result = await dialog.showOpenDialog(window, {
      title: "Choisir le projet à tester",
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    selectedProject = await inspectProject(result.filePaths[0]);
    const current = await services.settings.read();
    await services.settings.save(
      {
        previewUrl: current.previewUrl,
        controlPlaneUrl: current.controlPlaneUrl,
      },
      selectedProject.path,
    );
    return selectedProject;
  });

  handle(
    IPC_CHANNELS.inspectStoredProject,
    services,
    async (_event, payload) => {
      assertNoPayload(payload);
      launchAuthorizations.revokeAll();
      tunnelAuthorizations.revokeAll();
      const settings = await services.settings.read();
      if (!settings.projectPath) {
        selectedProject = null;
        return null;
      }
      selectedProject = await inspectProject(settings.projectPath);
      return selectedProject;
    },
  );

  handle(IPC_CHANNELS.loadSettings, services, (_event, payload) => {
    assertNoPayload(payload);
    return services.settings.read();
  });

  handle(IPC_CHANNELS.saveSettings, services, async (_event, payload) => {
    const input = parseSettingsInput(payload);
    const current = await services.settings.read();
    if (input.previewUrl !== current.previewUrl) {
      tunnelAuthorizations.revokeAll();
      await services.tunnel.stop();
    }
    const projectPath = selectedProject?.path ?? current.projectPath;
    if (projectPath) {
      const inspected = await inspectProject(projectPath);
      if (!selectedProject) selectedProject = inspected;
    }
    return services.settings.save(input, projectPath);
  });

  handle(IPC_CHANNELS.runtimeStatus, services, (_event, payload) => {
    assertNoPayload(payload);
    return services.runtime.status();
  });

  handle(
    IPC_CHANNELS.startDevServer,
    services,
    async (_event, payload) => {
      if (!selectedProject) {
        throw new Error("Choisissez et vérifiez d’abord un projet.");
      }
      const window = services.getWindow();
      if (!window) {
        throw new Error("La fenêtre principale est indisponible.");
      }
      const confirmedProject = selectedProject;
      const expectedScript = parseExpectedScript(payload);
      const ticket = await requestLaunchAuthorization({
        window,
        project: confirmedProject,
        expectedScript,
        authorizations: launchAuthorizations,
        showDialog: (dialogWindow, options) =>
          dialog.showMessageBox(dialogWindow, options),
      });
      if (!selectedProject) {
        throw new Error("Le projet vérifié n’est plus sélectionné.");
      }
      launchAuthorizations.consume(
        ticket,
        selectedProject,
        expectedScript,
      );
      return services.runtime.start(selectedProject, expectedScript);
    },
  );

  handle(IPC_CHANNELS.stopDevServer, services, async (_event, payload) => {
    assertNoPayload(payload);
    tunnelAuthorizations.revokeAll();
    await services.tunnel.stop();
    return services.runtime.stop();
  });

  handle(IPC_CHANNELS.probePreview, services, (_event, payload) =>
    probePreview(payload),
  );

  handle(IPC_CHANNELS.tunnelStatus, services, async (_event, payload) => {
    assertNoPayload(payload);
    return services.tunnel.refreshStatus();
  });

  handle(IPC_CHANNELS.startTunnel, services, async (_event, payload) => {
    assertNoPayload(payload);
    if (!services.runtime.status().running) {
      throw new Error(
        "Lancez d’abord le projet avec Revaloop avant de créer un lien public.",
      );
    }
    const settings = await services.settings.read();
    const localProbe = await probePreview(settings.previewUrl);
    if (!localProbe.reachable) {
      throw new Error(
        "La preview locale ne répond pas encore. Vérifiez son port avant de la partager.",
      );
    }
    const availability = await services.tunnel.refreshStatus();
    if (availability.available === false) {
      throw new Error(
        "cloudflared est introuvable. Installez-le manuellement, puis relancez la vérification.",
      );
    }
    const window = services.getWindow();
    if (!window) throw new Error("La fenêtre principale est indisponible.");
    const ticket = await requestTunnelAuthorization({
      window,
      previewUrl: settings.previewUrl,
      authorizations: tunnelAuthorizations,
      showDialog: (dialogWindow, options) =>
        dialog.showMessageBox(dialogWindow, options),
    });
    const current = await services.settings.read();
    if (!services.runtime.status().running) {
      tunnelAuthorizations.revokeAll();
      throw new Error("Le projet s’est arrêté avant la création du tunnel.");
    }
    const confirmedProbe = await probePreview(current.previewUrl);
    if (!confirmedProbe.reachable) {
      tunnelAuthorizations.revokeAll();
      throw new Error("La preview s’est arrêtée avant la création du tunnel.");
    }
    tunnelAuthorizations.consume(ticket, current.previewUrl);
    return services.tunnel.start(current.previewUrl);
  });

  handle(IPC_CHANNELS.stopTunnel, services, (_event, payload) => {
    assertNoPayload(payload);
    tunnelAuthorizations.revokeAll();
    return services.tunnel.stop();
  });

  handle(IPC_CHANNELS.copyTunnelUrl, services, (_event, payload) => {
    assertNoPayload(payload);
    clipboard.writeText(activeTunnelUrl(services.tunnel));
  });

  handle(
    IPC_CHANNELS.openTunnelPreview,
    services,
    async (_event, payload) => {
      assertNoPayload(payload);
      const url = quickTunnelPreviewUrl(activeTunnelUrl(services.tunnel));
      await shell.openExternal(url.toString(), { activate: true });
    },
  );

  handle(
    IPC_CHANNELS.openTunnelWorkspace,
    services,
    async (_event, payload) => {
      assertNoPayload(payload);
      const settings = await services.settings.read();
      const url = connectPreviewUrlFor(
        settings,
        activeTunnelUrl(services.tunnel),
      );
      await shell.openExternal(url.toString(), { activate: true });
    },
  );

  handle(
    IPC_CHANNELS.openExternal,
    services,
    async (_event, payload) => {
      const target = parseExternalTarget(payload);
      const settings: DesktopSettings = await services.settings.read();
      const url = externalUrlFor(settings, target);
      await shell.openExternal(url.toString(), { activate: true });
    },
  );

  return () => {
    launchAuthorizations.revokeAll();
    tunnelAuthorizations.revokeAll();
    for (const channel of [
      IPC_CHANNELS.selectProject,
      IPC_CHANNELS.inspectStoredProject,
      IPC_CHANNELS.loadSettings,
      IPC_CHANNELS.saveSettings,
      IPC_CHANNELS.runtimeStatus,
      IPC_CHANNELS.startDevServer,
      IPC_CHANNELS.stopDevServer,
      IPC_CHANNELS.probePreview,
      IPC_CHANNELS.tunnelStatus,
      IPC_CHANNELS.startTunnel,
      IPC_CHANNELS.stopTunnel,
      IPC_CHANNELS.copyTunnelUrl,
      IPC_CHANNELS.openTunnelPreview,
      IPC_CHANNELS.openTunnelWorkspace,
      IPC_CHANNELS.openExternal,
    ]) {
      ipcMain.removeHandler(channel);
    }
  };
}
