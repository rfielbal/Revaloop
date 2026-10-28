/** Public, additive integration contract. No browser sessions or reviewer authority. */
export const integrationApiVersion = "1" as const;
export const integrationReadCapabilities = [
  "projects:read",
  "reviews:read",
] as const;
export const integrationWriteCapabilities = [
  "feedback:write",
  "messages:write",
] as const;
export type IntegrationCapability =
  | (typeof integrationReadCapabilities)[number]
  | (typeof integrationWriteCapabilities)[number];
export type IntegrationCommand =
  | {
      type: "feedback.transition";
      feedbackId: string;
      status: "in_progress" | "to_review";
    }
  | { type: "message.create"; releaseId: string; body: string };
export class IntegrationError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function parseIntegrationCommand(input: Record<string, unknown>) {
  if (
    Object.keys(input).some(
      (key) => !["requestId", "expectedVersion", "command"].includes(key),
    ) ||
    typeof input.requestId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      input.requestId,
    ) ||
    typeof input.expectedVersion !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.expectedVersion)
  ) {
    throw new IntegrationError(
      400,
      "invalid_command",
      "La commande ou sa version est invalide.",
    );
  }
  const command = input.command as Record<string, unknown> | null;
  if (!command || typeof command !== "object" || Array.isArray(command))
    throw new IntegrationError(400, "invalid_command", "Commande attendue.");
  const id = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value);
  let parsed: IntegrationCommand;
  if (
    command.type === "feedback.transition" &&
    id(command.feedbackId) &&
    ["in_progress", "to_review"].includes(String(command.status)) &&
    Object.keys(command).every((key) =>
      ["type", "feedbackId", "status"].includes(key),
    )
  ) {
    parsed = {
      type: "feedback.transition",
      feedbackId: command.feedbackId,
      status: command.status as "in_progress" | "to_review",
    };
  } else if (
    command.type === "message.create" &&
    id(command.releaseId) &&
    typeof command.body === "string" &&
    command.body.trim().length > 0 &&
    command.body.length <= 2000 &&
    !command.body.includes("\0") &&
    Object.keys(command).every((key) =>
      ["type", "releaseId", "body"].includes(key),
    )
  ) {
    parsed = {
      type: "message.create",
      releaseId: command.releaseId,
      body: command.body.trim(),
    };
  } else
    throw new IntegrationError(
      400,
      "invalid_command",
      "Cette commande développeur n’est pas prise en charge.",
    );
  return {
    requestId: input.requestId,
    expectedVersion: input.expectedVersion,
    command: parsed,
  };
}
export async function integrationDigest(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
