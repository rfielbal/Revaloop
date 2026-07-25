import type {
  DesktopSettings,
  ExternalTarget,
} from "../shared/contract.ts";
import {
  normalizeControlPlaneUrl,
  normalizeLoopbackUrl,
} from "./validation.ts";

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
