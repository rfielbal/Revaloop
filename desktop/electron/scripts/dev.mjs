import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  buildElectronRuntime,
  desktopRoot,
} from "./build-runtime.mjs";

await buildElectronRuntime({ sourcemap: true });

const require = createRequire(import.meta.url);
const viteCli = join(
  dirname(require.resolve("vite/package.json")),
  "bin",
  "vite.js",
);
const vite = spawn(
  process.execPath,
  [viteCli, "--host", "127.0.0.1", "--port", "1420", "--strictPort"],
  {
    cwd: desktopRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
    shell: false,
    stdio: "inherit",
  },
);

function canConnect() {
  return new Promise((resolve) => {
    const socket = createConnection(
      { host: "127.0.0.1", port: 1420 },
      () => {
        socket.destroy();
        resolve(true);
      },
    );
    socket.setTimeout(250);
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForVite() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) {
      throw new Error("Le serveur Vite s’est arrêté avant son démarrage.");
    }
    if (await canConnect()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Le serveur Vite n’a pas démarré dans le délai prévu.");
}

vite.once("error", (error) => {
  console.error(`Impossible de lancer Vite : ${error.message}`);
});
try {
  await waitForVite();
} catch (error) {
  if (vite.exitCode === null) vite.kill("SIGTERM");
  throw error;
}

const electronPath = (await import("electron")).default;
const child = spawn(electronPath, [desktopRoot], {
  cwd: desktopRoot,
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: "http://127.0.0.1:1420",
    ELECTRON_ENABLE_SECURITY_WARNINGS: "true",
    NODE_ENV: "development",
  },
  shell: false,
  stdio: "inherit",
});

let closing = false;
async function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  if (child.exitCode === null) child.kill("SIGTERM");
  if (vite.exitCode === null) vite.kill("SIGTERM");
  process.exitCode = exitCode;
}

child.once("error", async (error) => {
  console.error(`Impossible de lancer Electron : ${error.message}`);
  await close(1);
});
child.once("exit", async (code, signal) => {
  await close(code ?? (signal ? 1 : 0));
});
process.once("SIGINT", () => void close(130));
process.once("SIGTERM", () => void close(143));
