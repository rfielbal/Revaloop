import test from "node:test";
import assert from "node:assert/strict";
import type { BrowserWindow, MessageBoxOptions } from "electron";
import {
  requestTunnelAuthorization,
  TunnelAuthorizationStore,
} from "./tunnel-authorization.ts";

const PREVIEW_URL = "http://127.0.0.1:3000/";

test("exige la confirmation native et la checklist à chaque tunnel", async () => {
  const captured: MessageBoxOptions[] = [];
  let nonceIndex = 0;
  const store = new TunnelAuthorizationStore({
    nonce: () => `${String(++nonceIndex).padStart(32, "0")}`,
  });
  const window = {} as BrowserWindow;

  await assert.rejects(
    requestTunnelAuthorization({
      window,
      previewUrl: PREVIEW_URL,
      authorizations: store,
      showDialog: async (_window, options) => {
        captured.push(options);
        return { response: 0, checkboxChecked: false };
      },
    }),
    /aucun tunnel n’a été créé/,
  );

  await assert.rejects(
    requestTunnelAuthorization({
      window,
      previewUrl: PREVIEW_URL,
      authorizations: store,
      showDialog: async () => ({ response: 1, checkboxChecked: false }),
    }),
    /Confirmez la checklist/,
  );

  const ticket = await requestTunnelAuthorization({
    window,
    previewUrl: PREVIEW_URL,
    authorizations: store,
    showDialog: async (_window, options) => {
      captured.push(options);
      return { response: 1, checkboxChecked: true };
    },
  });
  assert.match(ticket, /^0{31}1$/);
  const options = captured.at(-1);
  assert.ok(options);
  assert.equal(options.defaultId, 0);
  assert.equal(options.cancelId, 0);
  assert.match(options.detail ?? "", /base de test isolée/);
  assert.match(options.detail ?? "", /public, aléatoire et non durable/);
  assert.match(options.detail ?? "", /ne peut pas inspecter ni isoler/);
  assert.match(options.detail ?? "", /termine la connexion TLS/);
  assert.match(options.detail ?? "", /DPA applicable/);
  store.consume(ticket, PREVIEW_URL);
  assert.throws(() => store.consume(ticket, PREVIEW_URL), /expiré/);
});

test("lie l’autorisation courte à la preview confirmée", () => {
  let now = 1_000;
  let index = 0;
  const store = new TunnelAuthorizationStore({
    now: () => now,
    ttlMs: 100,
    nonce: () => `ticket-${String(++index).padStart(32, "x")}`,
  });

  const wrongTarget = store.issue(PREVIEW_URL);
  assert.throws(
    () => store.consume(wrongTarget, "http://127.0.0.1:4173/"),
    /ne correspond plus/,
  );

  const expired = store.issue(PREVIEW_URL);
  now += 100;
  assert.throws(() => store.consume(expired, PREVIEW_URL), /expiré/);

  const revoked = store.issue(PREVIEW_URL);
  store.revokeAll();
  assert.throws(() => store.consume(revoked, PREVIEW_URL), /expiré/);
});
