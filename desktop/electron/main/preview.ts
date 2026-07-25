import { createConnection } from "node:net";
import type { ProbeResult } from "../shared/contract.ts";
import { normalizeLoopbackUrl } from "./validation.ts";

const PROBE_TIMEOUT_MS = 650;

function hostnameForSocket(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

export async function probePreview(raw: unknown): Promise<ProbeResult> {
  const normalized = normalizeLoopbackUrl(raw);
  const port = normalized.port
    ? Number.parseInt(normalized.port, 10)
    : normalized.protocol === "https:"
      ? 443
      : 80;
  const reachable = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const socket = createConnection({
      host: hostnameForSocket(normalized),
      port,
    });
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });

  return {
    reachable,
    normalizedUrl: normalized.toString(),
    message: reachable
      ? `Le port ${port} accepte les connexions locales.`
      : `Aucune réponse sur le port ${port}. Le serveur démarre peut-être encore.`,
  };
}
