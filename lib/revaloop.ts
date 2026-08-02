export type ReleaseStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "superseded";

export type FeedbackStatus =
  | "open"
  | "in_progress"
  | "to_review"
  | "resolved";

export type FeedbackType = "visual" | "functional" | "copy";
export type FeedbackPriority = "low" | "normal" | "high";

export interface FeedbackItem {
  id: string;
  releaseId: string;
  authorRole: "developer" | "reviewer";
  sequence: number;
  type: FeedbackType;
  title: string;
  body: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  pagePath: string;
  pageTitle?: string;
  viewport: string;
  positionX: number | null;
  positionY: number | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewDecision {
  id: string;
  releaseId: string;
  status: "changes_requested" | "approved";
  authorName: string;
  note: string;
  createdAt: string;
}

export interface ReleaseMessage {
  id: string;
  releaseId: string;
  authorRole: "developer" | "reviewer";
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Release {
  id: string;
  projectId: string;
  version: string;
  title: string;
  commitSha: string;
  status: ReleaseStatus;
  previewKind?: "demo" | "external";
  previewUrl?: string;
  reviewerMessage?: string;
  previewRevision?: number;
  shareToken?: string;
  createdAt: string;
  updatedAt?: string;
  expiresAt: string;
  closedAt?: string | null;
}

export interface Project {
  id: string;
  organizationId?: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  createdAt: string;
}

export interface ReviewPayload {
  project: Project;
  release: Release;
  feedback: FeedbackItem[];
  decisions: ReviewDecision[];
  messages?: ReleaseMessage[];
  testItems?: ReviewTestItem[];
  completedTestItemIds?: string[];
  reviewerName?: string;
}

export interface ReviewTestItem {
  id: string;
  releaseId: string;
  position: number;
  title: string;
  description: string;
}

export interface DeveloperProjectSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  updatedAt: string;
  latestRelease: {
    id: string;
    version: string;
    status: ReleaseStatus;
    updatedAt: string;
  } | null;
}

export interface DeveloperClientAccessSummary {
  status:
    | "none"
    | "invited"
    | "opened"
    | "inactive"
    | "expired"
    | "revoked";
  reviewerName?: string;
  reviewerEmail?: string;
  createdAt?: string;
  expiresAt?: string;
  openedAt?: string;
  lastSeenAt?: string;
}

export interface DeveloperReviewPayload extends ReviewPayload {
  clientAccess: DeveloperClientAccessSummary;
}

export interface DeveloperWorkspace {
  viewer: {
    id: string;
    displayName: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
  };
  projects: DeveloperProjectSummary[];
  activeReview: DeveloperReviewPayload | null;
}

export interface CreatedInvitation {
  invitationId: string;
  releaseId: string;
  secret: string;
  expiresAt: string;
}

export const DEMO_TOKEN = "maison-matisse-v12";

export const demoProject: Project = {
  id: "project_maison_matisse",
  slug: "maison-matisse",
  name: "Maison Matisse",
  description: "Refonte du site de réservation et de la carte du restaurant.",
  accent: "#ddebec",
  createdAt: "2026-07-18T09:30:00.000Z",
};

export const demoRelease: Release = {
  id: "release_maison_matisse_v12",
  projectId: demoProject.id,
  version: "v1.2",
  title: "Parcours de réservation",
  commitSha: "a84d9c1",
  status: "changes_requested",
  previewKind: "demo",
  previewRevision: 1,
  shareToken: DEMO_TOKEN,
  createdAt: "2026-07-23T14:20:00.000Z",
  expiresAt: "2027-08-06T22:00:00.000Z",
};

export const demoTestItems: ReviewTestItem[] = [
  {
    id: "test_demo_home",
    releaseId: demoRelease.id,
    position: 0,
    title: "Accroche de la page d’accueil",
    description:
      "Le message et le bouton principal sont-ils immédiatement compréhensibles ?",
  },
  {
    id: "test_demo_booking",
    releaseId: demoRelease.id,
    position: 1,
    title: "Réservation d’une table",
    description: "Essayez de réserver un dîner fictif pour deux personnes.",
  },
  {
    id: "test_demo_mobile",
    releaseId: demoRelease.id,
    position: 2,
    title: "Lecture sur téléphone",
    description:
      "Vérifiez la navigation et la lisibilité des informations essentielles.",
  },
];

export const demoFeedback: FeedbackItem[] = [
  {
    id: "feedback_001",
    releaseId: demoRelease.id,
    authorRole: "developer",
    sequence: 1,
    type: "visual",
    title: "Le bouton de réservation manque de contraste",
    body: "Sur mon écran, le bouton se confond avec la photo. Peut-on le rendre plus visible ?",
    status: "to_review",
    priority: "high",
    pagePath: "/",
    viewport: "desktop · 1440 × 900",
    positionX: 77,
    positionY: 25,
    authorName: "Équipe projet",
    createdAt: "2026-07-23T15:02:00.000Z",
    updatedAt: "2026-07-24T08:42:00.000Z",
  },
  {
    id: "feedback_002",
    releaseId: demoRelease.id,
    authorRole: "reviewer",
    sequence: 2,
    type: "copy",
    title: "Remplacer « Notre table »",
    body: "Je préfère « Une cuisine de saison » : c’est plus proche de notre positionnement.",
    status: "in_progress",
    priority: "normal",
    pagePath: "/",
    viewport: "mobile · 390 × 844",
    positionX: 31,
    positionY: 56,
    authorName: "Client invité",
    createdAt: "2026-07-23T15:11:00.000Z",
    updatedAt: "2026-07-24T09:10:00.000Z",
  },
  {
    id: "feedback_003",
    releaseId: demoRelease.id,
    authorRole: "reviewer",
    sequence: 3,
    type: "functional",
    title: "Proposer un horaire alternatif",
    body: "Quand un créneau est complet, afficher le prochain horaire disponible au lieu d’un message bloquant.",
    status: "open",
    priority: "high",
    pagePath: "/reservation",
    viewport: "desktop · 1440 × 900",
    positionX: null,
    positionY: null,
    authorName: "Client invité",
    createdAt: "2026-07-23T15:28:00.000Z",
    updatedAt: "2026-07-23T15:28:00.000Z",
  },
  {
    id: "feedback_004",
    releaseId: demoRelease.id,
    authorRole: "reviewer",
    sequence: 4,
    type: "visual",
    title: "Photo du dessert validée",
    body: "La nouvelle photo fonctionne beaucoup mieux, c’est validé pour moi.",
    status: "resolved",
    priority: "low",
    pagePath: "/la-carte",
    viewport: "desktop · 1440 × 900",
    positionX: 64,
    positionY: 71,
    authorName: "Client invité",
    createdAt: "2026-07-22T16:04:00.000Z",
    updatedAt: "2026-07-23T11:32:00.000Z",
  },
];

export const demoMessages: ReleaseMessage[] = [
  {
    id: "message_demo_001",
    releaseId: demoRelease.id,
    authorRole: "developer",
    authorName: "Équipe projet",
    body: "La nouvelle version est en ligne. Vous pouvez explorer librement et nous écrire ici si quelque chose n’est pas clair.",
    createdAt: "2026-07-24T08:35:00.000Z",
  },
  {
    id: "message_demo_002",
    releaseId: demoRelease.id,
    authorRole: "reviewer",
    authorName: "Client invité",
    body: "Le parcours mobile doit-il aussi inclure la réservation complète ?",
    createdAt: "2026-07-24T08:41:00.000Z",
  },
];

export const statusLabels: Record<FeedbackStatus, string> = {
  open: "Signalé",
  in_progress: "En cours",
  to_review: "À revalider",
  resolved: "Validé",
};

export const typeLabels: Record<FeedbackType, string> = {
  visual: "Visuel",
  functional: "Fonctionnel",
  copy: "Texte",
};

const frenchMonths = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function getParisDateParts(value: string) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Paris",
  }).formatToParts(new Date(value));

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function formatRelativeDate(value: string) {
  const parts = getParisDateParts(value);
  const month = frenchMonths[Math.max(0, Number(parts.month) - 1)];
  return `${Number(parts.day)} ${month} · ${parts.hour}:${parts.minute}`;
}

export function formatShortDate(value: string) {
  const parts = getParisDateParts(value);
  const month = frenchMonths[Math.max(0, Number(parts.month) - 1)];
  return `${Number(parts.day)} ${month}`;
}

export function formatCalendarDate(value: string) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.day}/${values.month}/${values.year}`;
}
