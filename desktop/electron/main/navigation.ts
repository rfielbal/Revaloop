import type {
  DesktopSettings,
  ExternalTarget,
} from "../shared/contract.ts";
import {
  normalizeControlPlaneUrl,
  normalizeLoopbackUrl,
} from "./validation.ts";
import { isValidQuickTunnelUrl } from "./tunnel.ts";

export function externalUrlFor(
  settings: DesktopSettings,
  target: ExternalTarget,
): URL {
  if (target === "preview") {
    return normalizeLoopbackUrl(settings.previewUrl);
  }
  const origin = normalizeControlPlaneUrl(settings.controlPlaneUrl);
  if (target === "dashboard") return new URL("/dashboard", origin);
  if (target === "login") return new URL("/login", origin);
  throw new Error("Cette destination externe n’est pas autorisée.");
}

export function quickTunnelPreviewUrl(raw: unknown): URL {
  if (!isValidQuickTunnelUrl(raw)) {
    throw new Error("Le lien public du tunnel est invalide ou inactif.");
  }
  return new URL(raw);
}

export function connectPreviewUrlFor(
  settings: DesktopSettings,
  rawTunnelUrl: unknown,
): URL {
  const tunnelUrl = quickTunnelPreviewUrl(rawTunnelUrl);
  const origin = normalizeControlPlaneUrl(settings.controlPlaneUrl);
  const destination = new URL("/connect-preview", origin);
  destination.hash = new URLSearchParams({
    url: tunnelUrl.toString(),
  }).toString();
  return destination;
}
