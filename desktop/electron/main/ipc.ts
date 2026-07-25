import {
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
import { externalUrlFor } from "./navigation.ts";
import { probePreview } from "./preview.ts";
import { inspectProject, RuntimeManager } from "./project.ts";
import {
  LaunchAuthorizationStore,
  requestLaunchAuthorization,
} from "./launch-authorization.ts";
import { SettingsStore } from "./settings.ts";
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
};

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

  handle(IPC_CHANNELS.selectProject, services, async () => {
    launchAuthorizations.revokeAll();
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

  handle(IPC_CHANNELS.inspectStoredProject, services, async () => {
    launchAuthorizations.revokeAll();
    const settings = await services.settings.read();
    if (!settings.projectPath) {
      selectedProject = null;
      return null;
    }
    selectedProject = await inspectProject(settings.projectPath);
    return selectedProject;
  });

  handle(IPC_CHANNELS.loadSettings, services, () =>
    services.settings.read(),
  );

  handle(IPC_CHANNELS.saveSettings, services, async (_event, payload) => {
    const input = parseSettingsInput(payload);
    const current = await services.settings.read();
    const projectPath = selectedProject?.path ?? current.projectPath;
    if (projectPath) {
      const inspected = await inspectProject(projectPath);
      if (!selectedProject) selectedProject = inspected;
    }
    return services.settings.save(input, projectPath);
  });

  handle(IPC_CHANNELS.runtimeStatus, services, () =>
    services.runtime.status(),
  );

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

  handle(IPC_CHANNELS.stopDevServer, services, () =>
    services.runtime.stop(),
  );

  handle(IPC_CHANNELS.probePreview, services, (_event, payload) =>
    probePreview(payload),
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
    for (const channel of [
      IPC_CHANNELS.selectProject,
      IPC_CHANNELS.inspectStoredProject,
      IPC_CHANNELS.loadSettings,
      IPC_CHANNELS.saveSettings,
      IPC_CHANNELS.runtimeStatus,
      IPC_CHANNELS.startDevServer,
      IPC_CHANNELS.stopDevServer,
      IPC_CHANNELS.probePreview,
      IPC_CHANNELS.openExternal,
    ]) {
      ipcMain.removeHandler(channel);
    }
  };
}
