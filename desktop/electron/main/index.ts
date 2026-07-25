import {
  app,
  BrowserWindow,
  protocol,
  session,
} from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS } from "../shared/contract.ts";
import { registerIpcHandlers } from "./ipc.ts";
import {
  APP_ORIGIN,
  APP_SCHEME,
  DEVELOPMENT_CONTENT_SECURITY_POLICY,
  serveAsset,
} from "./protocol.ts";
import { RuntimeManager } from "./project.ts";
import { SettingsStore } from "./settings.ts";
import {
  isTrustedRendererUrl,
  resolveRendererDevUrl,
} from "./validation.ts";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true,
    },
  },
]);
app.enableSandbox();

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const rendererDirectory = join(currentDirectory, "../renderer");
const preloadPath = join(currentDirectory, "../preload/index.cjs");
const rendererDevUrl = resolveRendererDevUrl(
  app.isPackaged,
  process.env.ELECTRON_RENDERER_URL,
);

app.setPath(
  "userData",
  join(app.getPath("appData"), "dev.revaloop.desktop"),
);

let mainWindow: BrowserWindow | null = null;
let removeIpcHandlers: (() => void) | null = null;
let quitting = false;

function isAllowedRendererUrl(raw: string): boolean {
  return isTrustedRendererUrl(raw, rendererDevUrl);
}

function hardenWebContents(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererUrl(url)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    title: "Revaloop · Compagnon local",
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 620,
    center: true,
    show: false,
    backgroundColor: "#f7f5f0",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: Boolean(rendererDevUrl),
      spellcheck: false,
    },
  });
  mainWindow = window;
  hardenWebContents(window);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
  } else {
    await window.loadURL(`${APP_ORIGIN}/`);
  }
  return window;
}

app.whenReady().then(async () => {
  if (!rendererDevUrl) {
    protocol.handle(APP_SCHEME, (request) =>
      serveAsset(rendererDirectory, request),
    );
  }

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.on("will-download", (event) => {
    event.preventDefault();
  });
  if (rendererDevUrl) {
    session.defaultSession.webRequest.onHeadersReceived(
      { urls: ["http://127.0.0.1:1420/*"] },
      (details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [
              DEVELOPMENT_CONTENT_SECURITY_POLICY,
            ],
            "Cross-Origin-Opener-Policy": ["same-origin"],
            "X-Content-Type-Options": ["nosniff"],
            "Referrer-Policy": ["no-referrer"],
          },
        });
      },
    );
  }

  const settings = new SettingsStore(app.getPath("userData"));
  const runtime = new RuntimeManager({
    log: (line) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.previewLogEvent, line);
      }
    },
    status: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          IPC_CHANNELS.runtimeStatusEvent,
          status,
        );
      }
    },
  });

  removeIpcHandlers = registerIpcHandlers({
    getWindow: () => mainWindow,
    rendererDevUrl,
    settings,
    runtime,
  });
  await createWindow();

  app.on("activate", async () => {
    if (!mainWindow) await createWindow();
  });

  app.on("before-quit", (event) => {
    if (quitting || !runtime.status().running) return;
    event.preventDefault();
    quitting = true;
    void runtime.stop().finally(() => app.quit());
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  removeIpcHandlers?.();
  removeIpcHandlers = null;
});
