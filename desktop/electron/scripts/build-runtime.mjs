import { build } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);

function external(id) {
  return id === "electron" || id.startsWith("node:");
}

export async function buildElectronRuntime({ sourcemap = false } = {}) {
  await build({
    root: desktopRoot,
    configFile: false,
    logLevel: "warn",
    build: {
      target: "node22",
      outDir: resolve(desktopRoot, "out/main"),
      emptyOutDir: true,
      copyPublicDir: false,
      minify: false,
      sourcemap,
      lib: {
        entry: resolve(desktopRoot, "electron/main/index.ts"),
        formats: ["es"],
        fileName: () => "index.js",
      },
      rollupOptions: {
        external,
      },
    },
  });

  await build({
    root: desktopRoot,
    configFile: false,
    logLevel: "warn",
    build: {
      target: "node22",
      outDir: resolve(desktopRoot, "out/preload"),
      emptyOutDir: true,
      copyPublicDir: false,
      minify: false,
      sourcemap,
      lib: {
        entry: resolve(desktopRoot, "electron/preload/index.ts"),
        formats: ["cjs"],
        fileName: () => "index.cjs",
      },
      rollupOptions: {
        external,
      },
    },
  });
}

export { desktopRoot };
