import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import type { ProbeResult } from "../shared/contract.ts";
import { normalizeLoopbackUrl } from "./validation.ts";

const PROBE_TIMEOUT_MS = 1_500;
const MAX_RESPONSE_HEADER_BYTES = 16_384;
const HTML_CONTENT_TYPE = /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i;

function hostnameForSocket(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

type PreviewResponse = {
  contentType: string;
  status: number;
};

function requestPreview(
  normalized: URL,
  method: "GET" | "HEAD",
): Promise<PreviewResponse | null> {
  const port = normalized.port
    ? Number.parseInt(normalized.port, 10)
    : normalized.protocol === "https:"
      ? 443
      : 80;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PreviewResponse | null) => {
      if (settled) return;
      settled = true;
      request.destroy();
      resolve(result);
    };
    const send = normalized.protocol === "https:" ? requestHttps : requestHttp;
    const request = send(
      {
        protocol: normalized.protocol,
        hostname: hostnameForSocket(normalized),
        port,
        method,
        path: `${normalized.pathname}${normalized.search}`,
        agent: false,
        maxHeaderSize: MAX_RESPONSE_HEADER_BYTES,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
          "User-Agent": "Revaloop-Desktop-Probe/0.1",
        },
      },
      (response) => {
        const result = {
          contentType: String(response.headers["content-type"] ?? ""),
          status: response.statusCode ?? 0,
        };
        response.destroy();
        finish(result);
      },
    );
    request.setTimeout(PROBE_TIMEOUT_MS, () => finish(null));
    request.once("error", () => finish(null));
    request.once("close", () => finish(null));
    request.end();
  });
}

export async function probePreview(raw: unknown): Promise<ProbeResult> {
  const normalized = normalizeLoopbackUrl(raw);
  const port = normalized.port
    ? Number.parseInt(normalized.port, 10)
    : normalized.protocol === "https:"
      ? 443
      : 80;
  const head = await requestPreview(normalized, "HEAD");
  const response =
    head && [405, 501].includes(head.status)
      ? await requestPreview(normalized, "GET")
      : head;
  const reachable = Boolean(
    response &&
      response.status >= 200 &&
      response.status < 400 &&
      (response.status >= 300 || HTML_CONTENT_TYPE.test(response.contentType)),
  );

  return {
    reachable,
    normalizedUrl: normalized.toString(),
    message: reachable
      ? `La preview HTTP répond sur le port ${port}.`
      : `Aucune réponse HTTP valide sur le port ${port}. Vérifiez l’adresse et le serveur.`,
  };
}
