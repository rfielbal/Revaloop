import { randomBytes } from "node:crypto";
import type {
  BrowserWindow,
  MessageBoxOptions,
  MessageBoxReturnValue,
} from "electron";
import type { ProjectInfo } from "../shared/contract.ts";

const DEFAULT_AUTHORIZATION_TTL_MS = 10_000;
const INVALID_AUTHORIZATION_MESSAGE =
  "L’autorisation de lancement a expiré ou ne correspond plus au projet vérifié.";

type Clock = () => number;
type NonceFactory = () => string;

type LaunchAuthorization = {
  expiresAt: number;
  projectPath: string;
  devScript: string;
};

export type ShowLaunchDialog = (
  window: BrowserWindow,
  options: MessageBoxOptions,
) => Promise<MessageBoxReturnValue>;

export class LaunchAuthorizationStore {
  readonly #authorizations = new Map<string, LaunchAuthorization>();
  readonly #now: Clock;
  readonly #nonce: NonceFactory;
  readonly #ttlMs: number;

  constructor({
    now = Date.now,
    nonce = () => randomBytes(32).toString("base64url"),
    ttlMs = DEFAULT_AUTHORIZATION_TTL_MS,
  }: {
    now?: Clock;
    nonce?: NonceFactory;
    ttlMs?: number;
  } = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 60_000) {
      throw new Error("La durée d’autorisation de lancement est invalide.");
    }
    this.#now = now;
    this.#nonce = nonce;
    this.#ttlMs = ttlMs;
  }

  issue(project: ProjectInfo, expectedScript: string): string {
    this.#purgeExpired();
    const ticket = this.#nonce();
    if (
      typeof ticket !== "string" ||
      ticket.length < 32 ||
      ticket.length > 256 ||
      this.#authorizations.has(ticket)
    ) {
      throw new Error("Impossible de créer une autorisation de lancement.");
    }
    this.#authorizations.set(ticket, {
      expiresAt: this.#now() + this.#ttlMs,
      projectPath: project.path,
      devScript: expectedScript,
    });
    return ticket;
  }

  consume(
    ticket: string,
    project: ProjectInfo,
    expectedScript: string,
  ): void {
    const authorization = this.#authorizations.get(ticket);
    this.#authorizations.delete(ticket);
    if (
      !authorization ||
      authorization.expiresAt <= this.#now() ||
      authorization.projectPath !== project.path ||
      authorization.devScript !== project.devScript ||
      authorization.devScript !== expectedScript
    ) {
      throw new Error(INVALID_AUTHORIZATION_MESSAGE);
    }
  }

  revokeAll(): void {
    this.#authorizations.clear();
  }

  #purgeExpired(): void {
    const now = this.#now();
    for (const [ticket, authorization] of this.#authorizations) {
      if (authorization.expiresAt <= now) {
        this.#authorizations.delete(ticket);
      }
    }
  }
}

export async function requestLaunchAuthorization({
  window,
  project,
  expectedScript,
  authorizations,
  showDialog,
}: {
  window: BrowserWindow;
  project: ProjectInfo;
  expectedScript: string;
  authorizations: LaunchAuthorizationStore;
  showDialog: ShowLaunchDialog;
}): Promise<string> {
  const result = await showDialog(window, {
    type: "warning",
    buttons: ["Annuler", "Lancer le projet"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    normalizeAccessKeys: true,
    title: "Autoriser l’exécution locale",
    message: `Lancer « ${project.name} » ?`,
    detail: [
      `Dossier : ${project.path}`,
      `Commande : ${project.command}`,
      `Script dev : ${expectedScript}`,
      "",
      "Cette confirmation native est nécessaire avant chaque lancement.",
    ].join("\n"),
  });
  if (result.response !== 1) {
    throw new Error("Lancement annulé : aucun code du projet n’a été exécuté.");
  }
  return authorizations.issue(project, expectedScript);
}
