import { IntegrationError } from "./integration-contract";
export type WorkflowRelease = {
  version: string;
  title: string;
  commitSha: string;
  previewUrl: string;
  reviewerMessage: string;
  expiresInDays: number;
  testItems: Array<{ title: string; description: string }>;
};
export type ProjectCreation = {
  type: "project.create";
  name: string;
  description: string;
  release: WorkflowRelease;
};
export type WorkflowCommand =
  | { type: "release.create"; release: WorkflowRelease }
  | {
      type: "invitation.create";
      releaseId: string;
      reviewerName: string;
      reviewerEmail: string | null;
      expiresInDays: number;
      replaceExisting: boolean;
    }
  | { type: "invitation.revoke"; releaseId: string }
  | { type: "preview.update"; releaseId: string; previewUrl?: string };
const bad = () =>
  new IntegrationError(
    400,
    "invalid_command",
    "Les paramètres de cette commande sont invalides.",
  );
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw bad();
  return v as Record<string, unknown>;
};
const keys = (v: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw bad();
};
const text = (v: unknown, min: number, max: number) => {
  if (
    typeof v !== "string" ||
    v.trim().length < min ||
    v.length > max ||
    v.includes("\0")
  )
    throw bad();
  return v.trim();
};
const id = (v: unknown) => {
  const s = text(v, 1, 120);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw bad();
  return s;
};
const days = (v: unknown) => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 30)
    throw bad();
  return v;
};
export function integrationPreviewUrl(v: unknown) {
  const value = text(v, 1, 2048);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw bad();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw bad();
  return url.href;
}
export function parseWorkflowRelease(v: unknown): WorkflowRelease {
  const r = record(v);
  keys(r, [
    "version",
    "title",
    "commitSha",
    "previewUrl",
    "reviewerMessage",
    "expiresInDays",
    "testItems",
  ]);
  if (!Array.isArray(r.testItems) || r.testItems.length > 12) throw bad();
  return {
    version: text(r.version, 1, 40),
    title: text(r.title, 3, 140),
    commitSha: text(r.commitSha, 0, 80),
    previewUrl: integrationPreviewUrl(r.previewUrl),
    reviewerMessage: text(r.reviewerMessage, 0, 1200),
    expiresInDays: days(r.expiresInDays),
    testItems: r.testItems.map((v) => {
      const i = record(v);
      keys(i, ["title", "description"]);
      return {
        title: text(i.title, 3, 120),
        description: text(i.description, 0, 400),
      };
    }),
  };
}
export function parseWorkflowCommand(v: unknown): WorkflowCommand {
  const c = record(v);
  switch (c.type) {
    case "release.create":
      keys(c, ["type", "release"]);
      return { type: c.type, release: parseWorkflowRelease(c.release) };
    case "invitation.create": {
      keys(c, [
        "type",
        "releaseId",
        "reviewerName",
        "reviewerEmail",
        "expiresInDays",
        "replaceExisting",
      ]);
      const email =
        c.reviewerEmail === null
          ? null
          : text(c.reviewerEmail, 1, 254).toLowerCase();
      if (
        (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
        typeof c.replaceExisting !== "boolean"
      )
        throw bad();
      return {
        type: c.type,
        releaseId: id(c.releaseId),
        reviewerName: text(c.reviewerName, 2, 100),
        reviewerEmail: email,
        expiresInDays: days(c.expiresInDays),
        replaceExisting: c.replaceExisting,
      };
    }
    case "invitation.revoke":
      keys(c, ["type", "releaseId"]);
      return { type: c.type, releaseId: id(c.releaseId) };
    case "preview.update":
      keys(c, ["type", "releaseId", "previewUrl"]);
      return {
        type: c.type,
        releaseId: id(c.releaseId),
        ...(c.previewUrl === undefined
          ? {}
          : { previewUrl: integrationPreviewUrl(c.previewUrl) }),
      };
    default:
      throw bad();
  }
}
export function parseProjectCreation(v: unknown): ProjectCreation {
  const c = record(v);
  keys(c, ["type", "name", "description", "release"]);
  if (c.type !== "project.create") throw bad();
  return {
    type: c.type,
    name: text(c.name, 2, 100),
    description: text(c.description, 0, 500),
    release: parseWorkflowRelease(c.release),
  };
}
