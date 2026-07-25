import { build } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildElectronRuntime,
  desktopRoot,
} from "./build-runtime.mjs";

await buildElectronRuntime();
await build({
  root: desktopRoot,
  configFile: resolve(desktopRoot, "vite.config.ts"),
  build: {
    outDir: resolve(desktopRoot, "out/renderer"),
    emptyOutDir: true,
  },
});

const sourcePackage = JSON.parse(
  await readFile(resolve(desktopRoot, "package.json"), "utf8"),
);
const runtimePackage = {
  name: "revaloop-desktop",
  version: sourcePackage.version,
  description: sourcePackage.description,
  author: sourcePackage.author,
  type: "module",
  main: "main/index.js",
};
await writeFile(
  resolve(desktopRoot, "out/package.json"),
  `${JSON.stringify(runtimePackage, null, 2)}\n`,
  { encoding: "utf8", mode: 0o644 },
);
await writeFile(
  resolve(desktopRoot, "out/package-lock.json"),
  `${JSON.stringify(
    {
      name: runtimePackage.name,
      version: runtimePackage.version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: runtimePackage.name,
          version: runtimePackage.version,
        },
      },
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", mode: 0o644 },
);
