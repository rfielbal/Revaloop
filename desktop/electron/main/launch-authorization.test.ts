import test from "node:test";
import assert from "node:assert/strict";
import type {
  BrowserWindow,
  MessageBoxOptions,
  MessageBoxReturnValue,
} from "electron";
import type { ProjectInfo } from "../shared/contract.ts";
import {
  LaunchAuthorizationStore,
  requestLaunchAuthorization,
} from "./launch-authorization.ts";

const PROJECT: ProjectInfo = {
  path: "/tmp/revaloop-project",
  name: "Projet test",
  version: "1.0.0",
  devScript: "vite --host 127.0.0.1",
  packageManager: "npm@11.6.2",
  command: "npm --ignore-scripts run dev",
};

const WINDOW = {} as BrowserWindow;

function dialogResult(response: number): MessageBoxReturnValue {
  return { response, checkboxChecked: false };
}

test("lie une autorisation native courte au projet et la consomme une seule fois", async () => {
  const now = 1_000;
  const seenOptions: MessageBoxOptions[] = [];
  const authorizations = new LaunchAuthorizationStore({
    now: () => now,
    nonce: () => "a".repeat(43),
    ttlMs: 10_000,
  });

  const ticket = await requestLaunchAuthorization({
    window: WINDOW,
    project: PROJECT,
    expectedScript: PROJECT.devScript,
    authorizations,
    showDialog: async (_window, nextOptions) => {
      seenOptions.push(nextOptions);
      return dialogResult(1);
    },
  });

  const options = seenOptions[0];
  assert.ok(options);
  assert.equal(options.defaultId, 0);
  assert.equal(options.cancelId, 0);
  assert.match(options.detail ?? "", /npm --ignore-scripts run dev/);
  authorizations.consume(ticket, PROJECT, PROJECT.devScript);
  assert.throws(() =>
    authorizations.consume(ticket, PROJECT, PROJECT.devScript),
  );
});

test("refuse le lancement si la confirmation native est annulée", async () => {
  const authorizations = new LaunchAuthorizationStore({
    nonce: () => "b".repeat(43),
  });
  await assert.rejects(
    () =>
      requestLaunchAuthorization({
        window: WINDOW,
        project: PROJECT,
        expectedScript: PROJECT.devScript,
        authorizations,
        showDialog: async () => dialogResult(0),
      }),
    /aucun code du projet n’a été exécuté/,
  );
});

test("invalide le ticket après expiration ou changement de projet", () => {
  let now = 2_000;
  let nonceIndex = 0;
  const authorizations = new LaunchAuthorizationStore({
    now: () => now,
    nonce: () => `${++nonceIndex}`.padEnd(43, "c"),
    ttlMs: 50,
  });
  const changedProject = {
    ...PROJECT,
    path: "/tmp/un-autre-projet",
  };

  const wrongProjectTicket = authorizations.issue(
    PROJECT,
    PROJECT.devScript,
  );
  assert.throws(() =>
    authorizations.consume(
      wrongProjectTicket,
      changedProject,
      PROJECT.devScript,
    ),
  );

  const expiredTicket = authorizations.issue(PROJECT, PROJECT.devScript);
  now += 50;
  assert.throws(() =>
    authorizations.consume(expiredTicket, PROJECT, PROJECT.devScript),
  );
});
