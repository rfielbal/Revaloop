import { randomBytes } from "node:crypto";
import type {
  BrowserWindow,
  MessageBoxOptions,
  MessageBoxReturnValue,
} from "electron";
import { normalizeLoopbackUrl } from "./validation.ts";

const AUTHORIZATION_TTL_MS = 10_000;
const INVALID_AUTHORIZATION_MESSAGE =
  "L’autorisation du tunnel a expiré ou ne correspond plus à la preview locale.";

type Authorization = {
  expiresAt: number;
  previewUrl: string;
};

export type ShowTunnelDialog = (
  window: BrowserWindow,
  options: MessageBoxOptions,
) => Promise<MessageBoxReturnValue>;

export class TunnelAuthorizationStore {
  readonly #authorizations = new Map<string, Authorization>();
  readonly #now: () => number;
  readonly #nonce: () => string;
  readonly #ttlMs: number;

  constructor({
    now = Date.now,
    nonce = () => randomBytes(32).toString("base64url"),
    ttlMs = AUTHORIZATION_TTL_MS,
  }: {
    now?: () => number;
    nonce?: () => string;
    ttlMs?: number;
  } = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 60_000) {
      throw new Error("La durée d’autorisation du tunnel est invalide.");
    }
    this.#now = now;
    this.#nonce = nonce;
    this.#ttlMs = ttlMs;
  }

  issue(rawPreviewUrl: unknown): string {
    this.#purgeExpired();
    const previewUrl = normalizeLoopbackUrl(rawPreviewUrl).toString();
    const ticket = this.#nonce();
    if (
      typeof ticket !== "string" ||
      ticket.length < 32 ||
      ticket.length > 256 ||
      this.#authorizations.has(ticket)
    ) {
      throw new Error("Impossible de créer l’autorisation du tunnel.");
    }
    this.#authorizations.set(ticket, {
      expiresAt: this.#now() + this.#ttlMs,
      previewUrl,
    });
    return ticket;
  }

  consume(ticket: string, rawPreviewUrl: unknown): void {
    const authorization = this.#authorizations.get(ticket);
    this.#authorizations.delete(ticket);
    const previewUrl = normalizeLoopbackUrl(rawPreviewUrl).toString();
    if (
      !authorization ||
      authorization.expiresAt <= this.#now() ||
      authorization.previewUrl !== previewUrl
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

export async function requestTunnelAuthorization({
  window,
  previewUrl,
  authorizations,
  showDialog,
}: {
  window: BrowserWindow;
  previewUrl: string;
  authorizations: TunnelAuthorizationStore;
  showDialog: ShowTunnelDialog;
}): Promise<string> {
  const normalized = normalizeLoopbackUrl(previewUrl).toString();
  const result = await showDialog(window, {
    type: "warning",
    buttons: ["Annuler", "Créer le lien public"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    normalizeAccessKeys: true,
    title: "Exposer temporairement cette preview",
    message: "Cette adresse rend votre application accessible sur Internet.",
    detail: [
      `Cible locale : ${normalized}`,
      "",
      "Avant de continuer, vérifiez les quatre points suivants :",
      "• comptes et données uniquement fictifs ;",
      "• base de test isolée de la production ;",
      "• paiements et e-mails en mode sandbox ;",
      "• aucun secret ou jeton de production dans la preview.",
      "",
      "Revaloop ne peut pas inspecter ni isoler automatiquement la base d’un projet arbitraire. Le sous-domaine trycloudflare.com sera public, aléatoire et non durable : toute personne possédant le lien pourra y accéder jusqu’à son arrêt.",
      "Cloudflare est un fournisseur tiers : il termine la connexion TLS du tunnel et peut traiter le trafic HTTP ainsi que ses métadonnées. Vérifiez ses conditions, sa région de traitement et le DPA applicable avant un test client réel.",
    ].join("\n"),
    checkboxLabel:
      "Je confirme la checklist et l’usage de Cloudflare comme fournisseur tiers.",
    checkboxChecked: false,
  });
  if (result.response !== 1) {
    throw new Error("Partage annulé : aucun tunnel n’a été créé.");
  }
  if (result.checkboxChecked !== true) {
    throw new Error(
      "Confirmez la checklist de test isolé avant de créer un tunnel.",
    );
  }
  return authorizations.issue(normalized);
}
