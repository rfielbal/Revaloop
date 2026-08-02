import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  extractQuickTunnelUrl,
  isValidQuickTunnelUrl,
  quickTunnelArguments,
  redactTunnelLogLine,
  tunnelEnvironment,
  TunnelManager,
} from "./tunnel.ts";

function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const inspect = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("La condition de test n’a pas été atteinte."));
        return;
      }
      setTimeout(inspect, 10);
    };
    inspect();
  });
}

test("n’accepte qu’un hostname HTTPS trycloudflare strict", () => {
  const expected = "https://calm-demo-tree.trycloudflare.com/";
  assert.equal(
    extractQuickTunnelUrl(
      `INF Votre tunnel est prêt : ${expected} | gardez-le temporaire`,
    ),
    expected,
  );
  assert.equal(isValidQuickTunnelUrl(expected), true);

  for (const value of [
    "http://calm-demo-tree.trycloudflare.com/",
    "https://trycloudflare.com/",
    "https://calm-demo-tree.trycloudflare.com.evil.example/",
    "https://user@calm-demo-tree.trycloudflare.com/",
    "https://calm-demo-tree.trycloudflare.com:444/",
    "https://calm-demo-tree.trycloudflare.com/path",
    "https://calm-demo-tree.trycloudflare.com/?token=secret",
  ]) {
    assert.equal(extractQuickTunnelUrl(value), null);
    assert.equal(isValidQuickTunnelUrl(value), false);
  }
});

test("masque les URL et secrets des journaux cloudflared", () => {
  assert.equal(
    redactTunnelLogLine(
      "INF route=https://calm-demo-tree.trycloudflare.com/?session=abc",
    ),
    "INF route=[adresse masquée]",
  );
  assert.equal(
    redactTunnelLogLine("TUNNEL_TOKEN=secret-value"),
    "[journal cloudflared masqué : donnée potentiellement sensible]",
  );
  assert.equal(redactTunnelLogLine("a".repeat(2_000)).length, 1_000);
});

test("lance un quick tunnel sans config, token ni environnement secret", () => {
  const args = quickTunnelArguments("http://localhost:4173/");
  assert.deepEqual(args.slice(0, 3), [
    "tunnel",
    "--config",
    process.platform === "win32" ? "NUL" : "/dev/null",
  ]);
  assert.equal(args.includes("--no-autoupdate"), true);
  assert.equal(args.at(args.indexOf("--url") + 1), "http://127.0.0.1:4173/");
  assert.equal(
    args.at(args.indexOf("--http-host-header") + 1),
    "127.0.0.1:4173",
  );
  assert.equal(args.some((argument) => /token|credential/i.test(argument)), false);

  const environment = tunnelEnvironment({
    PATH: "/usr/bin",
    HOME: "/tmp/example-home",
    TUNNEL_TOKEN: "secret",
    TUNNEL_TOKEN_FILE: "/tmp/token",
    CLOUDFLARE_API_TOKEN: "secret",
    HTTP_PROXY: "http://user:password@proxy.example",
  });
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.HOME, "/tmp/example-home");
  assert.equal(environment.NO_AUTOUPDATE, "true");
  assert.equal(environment.TUNNEL_TOKEN, undefined);
  assert.equal(environment.TUNNEL_TOKEN_FILE, undefined);
  assert.equal(environment.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(environment.HTTP_PROXY, undefined);
});

test("détecte l’absence de cloudflared sans rien installer", async () => {
  const statuses: string[] = [];
  const manager = new TunnelManager(
    {
      log: () => undefined,
      status: (status) => statuses.push(status.state),
    },
    { findExecutable: async () => null },
  );

  const status = await manager.refreshStatus();
  assert.equal(status.state, "unavailable");
  assert.equal(status.available, false);
  await assert.rejects(
    manager.start("http://127.0.0.1:3000/"),
    /Installez-le manuellement/,
  );
  assert.equal((await manager.stop()).state, "unavailable");
  assert.equal(statuses.includes("unavailable"), true);
});

test("reste en ligne, draine les logs puis révoque le tunnel", async () => {
  const logs: string[] = [];
  const statuses: string[] = [];
  let receivedArguments: readonly string[] = [];
  const manager = new TunnelManager(
    {
      log: (line) => logs.push(line.line),
      status: (status) => statuses.push(status.state),
    },
    {
      findExecutable: async () => process.execPath,
      spawnProcess: (_command, args, options) => {
        receivedArguments = args;
        return spawn(
          process.execPath,
          [
            "-e",
            [
              "console.error('https://calm-demo-tree.trycloudflare.com');",
              "console.error('INF Registered tunnel connection connIndex=0');",
              "setTimeout(() => console.error('late-drained-line'), 25);",
              "setInterval(() => {}, 1000);",
            ].join("\n"),
          ],
          options,
        );
      },
      startTimeoutMs: 2_000,
      stopGraceMs: 100,
      stopKillMs: 100,
    },
  );

  try {
    const online = await manager.start("http://127.0.0.1:3000/");
    assert.equal(online.state, "online");
    assert.equal(
      online.url,
      "https://calm-demo-tree.trycloudflare.com/",
    );
    assert.equal(manager.hasActiveProcess(), true);
    assert.equal(receivedArguments.includes("--token"), false);
    await waitFor(() =>
      logs.some((line) => line.includes("late-drained-line")),
    );
    assert.equal(statuses.includes("starting"), true);
    assert.equal(statuses.includes("online"), true);
  } finally {
    const stopped = await manager.stop();
    assert.equal(stopped.state, "offline");
    assert.equal(stopped.url, null);
    assert.equal(manager.hasActiveProcess(), false);
  }
});

test("borne un démarrage qui ne confirme pas la connexion", async () => {
  const manager = new TunnelManager(
    { log: () => undefined, status: () => undefined },
    {
      findExecutable: async () => process.execPath,
      spawnProcess: (_command, _args, options) =>
        spawn(
          process.execPath,
          [
            "-e",
            "console.error('https://calm-demo-tree.trycloudflare.com'); setInterval(() => {}, 1000);",
          ],
          options,
        ),
      startTimeoutMs: 80,
      stopGraceMs: 50,
      stopKillMs: 50,
    },
  );

  await assert.rejects(
    manager.start("http://127.0.0.1:3000/"),
    /délai prévu/,
  );
  assert.equal(manager.status().state, "error");
  assert.equal(manager.status().url, null);
  await manager.stop();
});

test("borne aussi la recherche de l’exécutable", async () => {
  const manager = new TunnelManager(
    { log: () => undefined, status: () => undefined },
    {
      findExecutable: () => new Promise<string | null>(() => undefined),
      startTimeoutMs: 50,
      stopGraceMs: 50,
      stopKillMs: 50,
    },
  );
  const startedAt = Date.now();
  await assert.rejects(
    manager.start("http://127.0.0.1:3000/"),
    /recherche de cloudflared a dépassé/,
  );
  assert.equal(Date.now() - startedAt < 500, true);
  assert.equal(manager.hasActiveProcess(), false);
});
