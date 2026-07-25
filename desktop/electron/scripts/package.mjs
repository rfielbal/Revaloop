import { spawn } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { desktopRoot } from "./build-runtime.mjs";

const supportedOptions = new Set([
  "--arm64",
  "--dir",
  "--force-code-signing",
  "--linux",
  "--mac",
  "--notarize",
  "--win",
  "--x64",
]);
const requestedOptions = new Set(process.argv.slice(2));
const unknownOptions = [...requestedOptions].filter(
  (option) => !supportedOptions.has(option),
);

if (unknownOptions.length > 0) {
  throw new Error(
    `Options de packaging Electron inconnues : ${unknownOptions.join(", ")}.`,
  );
}

const requestedPlatforms = ["--linux", "--mac", "--win"].filter((option) =>
  requestedOptions.has(option),
);
const requestedArchitectures = ["--arm64", "--x64"].filter((option) =>
  requestedOptions.has(option),
);

if (requestedPlatforms.length > 1) {
  throw new Error("Une seule plateforme Electron peut être ciblée par build.");
}
if (requestedArchitectures.length > 1) {
  throw new Error("Une seule architecture Electron peut être ciblée par build.");
}
if (
  requestedOptions.has("--notarize") &&
  !requestedOptions.has("--mac")
) {
  throw new Error("La notarisation Electron exige explicitement --mac.");
}

const buildDirectoryOnly = requestedOptions.has("--dir");
const stagingRoot = await mkdtemp(join(tmpdir(), "revaloop-electron-"));
const stagingApp = join(stagingRoot, "app");
const stagingConfig = join(stagingRoot, "electron-builder.yml");
const releaseDirectory = resolve(desktopRoot, "release");
const buildResources = resolve(desktopRoot, "src-tauri/icons");

function yamlPath(value) {
  return JSON.stringify(value);
}

async function runBuilder() {
  const sourceConfig = await readFile(
    resolve(desktopRoot, "electron-builder.yml"),
    "utf8",
  );
  const isolatedConfig = sourceConfig
    .replace(
      "output: ../release",
      `output: ${yamlPath(releaseDirectory)}`,
    )
    .replace(
      "buildResources: ../src-tauri/icons",
      `buildResources: ${yamlPath(buildResources)}`,
    );

  if (isolatedConfig === sourceConfig) {
    throw new Error(
      "La configuration Electron ne contient pas les chemins de staging attendus.",
    );
  }

  await cp(resolve(desktopRoot, "out"), stagingApp, { recursive: true });
  await writeFile(stagingConfig, isolatedConfig, {
    encoding: "utf8",
    mode: 0o600,
  });

  const require = createRequire(import.meta.url);
  const builderCli = join(
    dirname(require.resolve("electron-builder/package.json")),
    "cli.js",
  );
  const args = [
    builderCli,
    "--projectDir",
    stagingApp,
    "--config",
    stagingConfig,
    "--publish",
    "never",
  ];
  if (buildDirectoryOnly) args.push("--dir");
  for (const platform of requestedPlatforms) {
    args.push(platform);
  }
  for (const architecture of requestedArchitectures) {
    args.push(architecture);
  }
  if (requestedOptions.has("--force-code-signing")) {
    args.push("--config.forceCodeSigning=true");
  }
  if (requestedOptions.has("--notarize")) {
    args.push("--config.mac.notarize=true");
  }

  const childEnvironment = { ...process.env };
  if (
    buildDirectoryOnly &&
    childEnvironment.CSC_IDENTITY_AUTO_DISCOVERY === undefined
  ) {
    childEnvironment.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  }

  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: stagingRoot,
      env: childEnvironment,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolveExit(code ?? (signal ? 1 : 0));
    });
  });

  if (exitCode !== 0) {
    throw new Error(`electron-builder s’est arrêté avec le code ${exitCode}.`);
  }
}

try {
  await runBuilder();
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
