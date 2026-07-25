import test from "node:test";
import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  inspectProject,
  projectRuntimeEnvironment,
  redactLogLine,
  RuntimeManager,
} from "./project.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("inspecte un package borné sans exécuter ses hooks adjacents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-electron-"));
  try {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "fixture-revaloop",
        version: "1.2.3",
        packageManager: "npm@11.6.2",
        scripts: {
          predev: "node predev.js",
          dev: "vite --host 127.0.0.1",
          postdev: "node postdev.js",
        },
      }),
      "utf8",
    );
    const project = await inspectProject(directory);
    assert.equal(project.name, "fixture-revaloop");
    assert.equal(project.devScript, "vite --host 127.0.0.1");
    assert.equal(project.command, "npm --ignore-scripts run dev");
    assert.equal(project.path, await realpath(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuse un manifeste absent, invalide ou démesuré", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-electron-"));
  try {
    await assert.rejects(() => inspectProject(directory));
    await writeFile(join(directory, "package.json"), "{", "utf8");
    await assert.rejects(() => inspectProject(directory));
    await writeFile(
      join(directory, "package.json"),
      " ".repeat(1_048_577),
      "utf8",
    );
    await assert.rejects(() => inspectProject(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("masque les marqueurs sensibles et borne chaque ligne", () => {
  assert.equal(
    redactLogLine("Authorization: Bearer top-secret"),
    "[ligne masquée : donnée potentiellement sensible]",
  );
  assert.equal(
    redactLogLine("GET /join?token=secret"),
    "[ligne masquée : donnée potentiellement sensible]",
  );
  assert.equal(
    redactLogLine("ready on http://127.0.0.1:3000"),
    "ready on http://127.0.0.1:3000",
  );
  assert.equal(redactLogLine("a".repeat(3_000)).length, 2_000);
});

test("ne transmet pas les options Node et Electron internes au projet", () => {
  const environment = projectRuntimeEnvironment({
    ELECTRON_ENABLE_SECURITY_WARNINGS: "true",
    ELECTRON_RENDERER_URL: "http://127.0.0.1:1420",
    ELECTRON_RUN_AS_NODE: "1",
    NODE_OPTIONS: "--inspect",
    NODE_PATH: "/tmp/modules",
    NPM_CONFIG_NODE_OPTIONS: "--require=/tmp/hook.cjs",
    PATH: "/usr/bin",
    PROJECT_SETTING: "conservé",
  });

  assert.equal(environment.ELECTRON_ENABLE_SECURITY_WARNINGS, undefined);
  assert.equal(environment.ELECTRON_RENDERER_URL, undefined);
  assert.equal(environment.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(environment.NODE_OPTIONS, undefined);
  assert.equal(environment.NODE_PATH, undefined);
  assert.equal(environment.NPM_CONFIG_NODE_OPTIONS, undefined);
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.PROJECT_SETTING, "conservé");
  assert.equal(environment.BROWSER, "none");
  assert.equal(environment.HOST, "127.0.0.1");
  assert.equal(environment.NO_COLOR, "1");
});

test("ne lance qu’un enfant face à deux démarrages concurrents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-concurrent-"));
  const launchMarker = join(directory, "launch-marker");
  let resolveReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Le processus concurrent n’a pas démarré.")),
      5_000,
    );
    resolveReady = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  const runtime = new RuntimeManager({
    log: (line) => {
      if (line.line.includes("concurrent-ready")) resolveReady?.();
    },
    status: () => undefined,
  });

  try {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "fixture-concurrent",
        packageManager: "npm@11.6.2",
        scripts: { dev: "node dev.cjs" },
      }),
      "utf8",
    );
    await writeFile(
      join(directory, "dev.cjs"),
      [
        "require('node:fs').appendFileSync('launch-marker', 'launch\\n');",
        "console.log('concurrent-ready');",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
      "utf8",
    );

    const project = await inspectProject(directory);
    const firstStart = runtime.start(project, project.devScript);
    const secondStart = runtime.start(project, project.devScript);
    assert.deepEqual(runtime.status(), { running: true, pid: null });

    const [firstResult, secondResult] = await Promise.allSettled([
      firstStart,
      secondStart,
    ]);
    assert.equal(firstResult.status, "fulfilled");
    assert.equal(secondResult.status, "rejected");
    if (secondResult.status === "rejected") {
      assert.match(String(secondResult.reason), /déjà en cours/);
    }

    await ready;
    assert.equal(await readFile(launchMarker, "utf8"), "launch\n");
  } finally {
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("annule un démarrage arrêté en vol puis autorise un nouveau lancement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-cancel-start-"));
  const launchMarker = join(directory, "launch-marker");
  let resolveReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Le processus relancé n’a pas démarré.")),
      5_000,
    );
    resolveReady = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  const runtime = new RuntimeManager({
    log: (line) => {
      if (line.line.includes("restart-ready")) resolveReady?.();
    },
    status: () => undefined,
  });

  try {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "fixture-cancel-start",
        packageManager: "npm@11.6.2",
        scripts: { dev: "node dev.cjs" },
      }),
      "utf8",
    );
    await writeFile(
      join(directory, "dev.cjs"),
      [
        "require('node:fs').appendFileSync('launch-marker', 'launch\\n');",
        "console.log('restart-ready');",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
      "utf8",
    );

    const project = await inspectProject(directory);
    const interruptedStart = runtime.start(project, project.devScript);
    const stop = runtime.stop();

    await assert.rejects(interruptedStart, /démarrage du projet a été annulé/);
    assert.deepEqual(await stop, { running: false, pid: null });
    assert.equal(await exists(launchMarker), false);
    assert.deepEqual(runtime.status(), { running: false, pid: null });

    const restarted = await runtime.start(project, project.devScript);
    assert.equal(restarted.running, true);
    await ready;
    assert.equal(await readFile(launchMarker, "utf8"), "launch\n");
  } finally {
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("lance uniquement dev, remonte ses logs puis arrête son groupe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-runtime-"));
  const predevMarker = join(directory, "predev-marker");
  const devMarker = join(directory, "dev-marker");
  const postdevMarker = join(directory, "postdev-marker");
  let resolveReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Le script dev n’a pas signalé son démarrage.")),
      5_000,
    );
    resolveReady = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  const logs: string[] = [];
  const runtime = new RuntimeManager({
    log: (line) => {
      logs.push(line.line);
      if (line.line.includes("fixture-ready")) resolveReady?.();
    },
    status: () => undefined,
  });

  try {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "fixture-runtime",
        packageManager: "npm@11.6.2",
        scripts: {
          predev: "node -e \"require('node:fs').writeFileSync('predev-marker','1')\"",
          dev: "node dev.cjs",
          postdev:
            "node -e \"require('node:fs').writeFileSync('postdev-marker','1')\"",
        },
      }),
      "utf8",
    );
    await writeFile(
      join(directory, "dev.cjs"),
      [
        "require('node:fs').writeFileSync('dev-marker', '1');",
        "console.log('fixture-ready');",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
      "utf8",
    );

    const project = await inspectProject(directory);
    const started = await runtime.start(project, project.devScript);
    assert.equal(started.running, true);
    await ready;
    assert.equal(await exists(devMarker), true);
    assert.equal(await exists(predevMarker), false);
    assert.equal(await exists(postdevMarker), false);
    assert.equal(logs.some((line) => line.includes("fixture-ready")), true);

    const stopped = await runtime.stop();
    assert.deepEqual(stopped, { running: false, pid: null });
    assert.equal(runtime.status().running, false);
    assert.equal(await exists(postdevMarker), false);
  } finally {
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
