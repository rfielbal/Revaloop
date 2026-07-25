"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcwKey,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatCalendarDate,
  formatRelativeDate,
  statusLabels,
  type DeveloperWorkspace,
  type FeedbackItem,
  type FeedbackStatus,
  type ReleaseMessage,
  type ReviewPayload,
} from "../../lib/revaloop";
import { Brand } from "../components/brand";

type FeedbackFilter = "all" | "todo" | "to_review" | "resolved";
type DialogName = "project" | "release" | "invitation" | null;
type WorkspaceTab = "feedback" | "discussion";

const statusAction: Record<
  FeedbackStatus,
  { label: string; next: FeedbackStatus | null }
> = {
  open: { label: "Prendre en charge", next: "in_progress" },
  in_progress: { label: "Prêt à revalider", next: "to_review" },
  to_review: { label: "En attente du client", next: null },
  resolved: { label: "Retour validé", next: null },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") {
    return;
  }

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ),
  );
  const first = focusable[0];
  const last = focusable.at(-1);

  if (!first || !last) {
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function responseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? fallback;
}

function releaseStatusLabel(status: ReviewPayload["release"]["status"]) {
  if (status === "approved") return "Approuvée";
  if (status === "changes_requested") return "Ajustements demandés";
  if (status === "superseded") return "Remplacée";
  if (status === "draft") return "Brouillon";
  return "En recette";
}

export function DashboardClient({
  initialWorkspace,
  renderedAt,
  signOutPath,
}: {
  initialWorkspace: DeveloperWorkspace;
  renderedAt: string;
  signOutPath: string;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [now, setNow] = useState(() => Date.parse(renderedAt));
  const [selectedId, setSelectedId] = useState(
    initialWorkspace.activeReview?.feedback[0]?.id,
  );
  const [filter, setFilter] = useState<FeedbackFilter>("all");
  const [workspaceTab, setWorkspaceTab] =
    useState<WorkspaceTab>("feedback");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");
  const dialogTriggerRef = useRef<HTMLButtonElement>(null);
  const messageThreadRef = useRef<HTMLOListElement>(null);

  const review = workspace.activeReview;
  const activeProjectId = review?.project.id ?? workspace.projects[0]?.id;
  const isReleaseExpired = review
    ? Date.parse(review.release.expiresAt) <= now
    : false;
  const isActiveRelease = review
    ? !isReleaseExpired &&
      ["in_review", "changes_requested"].includes(review.release.status)
    : false;
  const canInvite = Boolean(review && isActiveRelease);
  const canPublishRelease = Boolean(review && !isActiveRelease);

  const refreshWorkspace = useCallback(async () => {
    const query = activeProjectId
      ? `?project=${encodeURIComponent(activeProjectId)}`
      : "";
    const response = await fetch(`/api/workspace${query}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("workspace unavailable");
    }

    const payload = (await response.json()) as DeveloperWorkspace;
    setWorkspace(payload);
  }, [activeProjectId]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshWorkspace().catch(() => undefined);
    }, 5_000);

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshWorkspace().catch(() => undefined);
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (workspaceTab !== "discussion") return;
    const thread = messageThreadRef.current;

    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [review?.messages?.length, workspaceTab]);

  useEffect(() => {
    if (!dialog) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [dialog]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  function openDialog(name: Exclude<DialogName, null>) {
    setFormError("");
    setInviteUrl("");
    setInviteExpiresAt("");
    setDialog(name);
  }

  function closeDialog() {
    setDialog(null);
    setFormError("");
    window.requestAnimationFrame(() => dialogTriggerRef.current?.focus());
  }

  const filteredFeedback = useMemo(() => {
    const feedback = review?.feedback ?? [];

    if (filter === "all") return feedback;
    if (filter === "todo") {
      return feedback.filter(
        (item) => item.status === "open" || item.status === "in_progress",
      );
    }
    return feedback.filter((item) => item.status === filter);
  }, [filter, review?.feedback]);

  const selected =
    filteredFeedback.find((item) => item.id === selectedId) ??
    filteredFeedback[0] ??
    null;

  const counts = useMemo(() => {
    const result: Record<FeedbackStatus, number> = {
      open: 0,
      in_progress: 0,
      to_review: 0,
      resolved: 0,
    };

    for (const item of review?.feedback ?? []) {
      result[item.status] += 1;
    }

    return result;
  }, [review?.feedback]);

  async function advanceFeedback(item: FeedbackItem) {
    const nextStatus = statusAction[item.status].next;

    if (!nextStatus || isUpdating || !review || !isActiveRelease) return;

    setIsUpdating(true);

    try {
      const response = await fetch(`/api/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "La mise à jour n’a pas été enregistrée.",
          ),
        );
      }

      const updated = (await response.json()) as FeedbackItem;
      setWorkspace((current) => ({
        ...current,
        activeReview: current.activeReview
          ? {
              ...current.activeReview,
              feedback: current.activeReview.feedback.map((feedback) =>
                feedback.id === updated.id ? updated : feedback,
              ),
            }
          : null,
      }));
      setNotice(
        `Le retour #${item.sequence} passe à « ${statusLabels[nextStatus]} ».`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "La mise à jour n’a pas été enregistrée.",
      );
      refreshWorkspace().catch(() => undefined);
    } finally {
      setIsUpdating(false);
    }
  }

  function releasePayload(form: HTMLFormElement) {
    const data = new FormData(form);
    const testItems = [1, 2, 3]
      .map((index) => ({
        title: String(data.get(`testTitle${index}`) ?? "").trim(),
        description: String(
          data.get(`testDescription${index}`) ?? "",
        ).trim(),
      }))
      .filter((item) => item.title);

    return {
      version: String(data.get("version") ?? "").trim(),
      title: String(data.get("title") ?? "").trim(),
      commitSha: String(data.get("commitSha") ?? "").trim(),
      previewUrl: String(data.get("previewUrl") ?? "").trim(),
      reviewerMessage: String(
        data.get("reviewerMessage") ?? "",
      ).trim(),
      expiresInDays: Number(data.get("expiresInDays") ?? 14),
      testItems,
    };
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUpdating(true);
    setFormError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      ...releasePayload(form),
    };

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Le projet n’a pas pu être créé."),
        );
      }

      const result = (await response.json()) as { projectId: string };
      window.location.assign(
        `/dashboard?project=${encodeURIComponent(result.projectId)}`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Le projet n’a pas pu être créé.",
      );
      setIsUpdating(false);
    }
  }

  async function submitRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!review) return;

    setIsUpdating(true);
    setFormError("");

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(review.project.id)}/releases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(releasePayload(event.currentTarget)),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "La nouvelle version n’a pas pu être publiée.",
          ),
        );
      }

      closeDialog();
      setNotice("La nouvelle version est prête à recevoir une invitation.");
      try {
        await refreshWorkspace();
      } catch {
        window.location.assign(
          `/dashboard?project=${encodeURIComponent(review.project.id)}`,
        );
      }
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "La nouvelle version n’a pas pu être publiée.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!review) return;

    setIsUpdating(true);
    setFormError("");
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch(
        `/api/releases/${encodeURIComponent(review.release.id)}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewerName: String(data.get("reviewerName") ?? "").trim(),
            reviewerEmail: "",
            expiresInDays: Number(data.get("expiresInDays") ?? 7),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "L’invitation n’a pas pu être créée.",
          ),
        );
      }

      const payload = (await response.json()) as {
        inviteUrl: string;
        expiresAt: string;
      };
      setInviteUrl(payload.inviteUrl);
      setInviteExpiresAt(payload.expiresAt);
      const copied = await navigator.clipboard
        .writeText(payload.inviteUrl)
        .then(() => true)
        .catch(() => false);
      setNotice(
        copied
          ? "Invitation créée et copiée. L’ancien accès a été révoqué."
          : "Invitation créée. Copiez le lien affiché avant de fermer.",
      );
      await refreshWorkspace();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "L’invitation n’a pas pu être créée.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function revokeAccess() {
    if (!review || isUpdating) return;

    setIsUpdating(true);

    try {
      const response = await fetch(
        `/api/releases/${encodeURIComponent(review.release.id)}/access`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "La révocation a échoué."),
        );
      }

      setNotice("Toutes les invitations et sessions de cette version sont révoquées.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "La révocation a échoué.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function signalPreviewUpdate() {
    if (!review || isUpdating || !isActiveRelease) return;

    setIsUpdating(true);

    try {
      const response = await fetch(
        `/api/releases/${encodeURIComponent(review.release.id)}/preview`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "La mise à jour n’a pas pu être signalée au client.",
          ),
        );
      }

      const updated = (await response.json()) as {
        previewRevision: number;
        updatedAt: string;
      };
      setWorkspace((current) => ({
        ...current,
        activeReview: current.activeReview
          ? {
              ...current.activeReview,
              release: {
                ...current.activeReview.release,
                previewRevision: updated.previewRevision,
                updatedAt: updated.updatedAt,
              },
            }
          : null,
      }));
      setNotice(
        "Mise à jour signalée. Le client pourra demander le rechargement de la preview dans son espace.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "La mise à jour n’a pas pu être signalée au client.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function sendDeveloperMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!review || isSendingMessage || !isActiveRelease) return;

    const body = messageBody.trim();

    if (!body) return;

    setIsSendingMessage(true);

    try {
      const response = await fetch(
        `/api/releases/${encodeURIComponent(review.release.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Le message n’a pas pu être envoyé."),
        );
      }

      const message = (await response.json()) as ReleaseMessage;
      setWorkspace((current) => ({
        ...current,
        activeReview: current.activeReview
          ? {
              ...current.activeReview,
              messages: [
                ...(current.activeReview.messages ?? []),
                message,
              ],
            }
          : null,
      }));
      setMessageBody("");
      setNotice("Message envoyé au client.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Le message n’a pas pu être envoyé.",
      );
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function removeCurrentProject() {
    if (!review || isUpdating) return;

    const confirmation = window.prompt(
      `Suppression irréversible : exportez d’abord la recette si nécessaire. Tapez exactement « ${review.project.name} » pour supprimer le projet, ses versions, ses retours et tous les accès.`,
    );

    if (confirmation !== review.project.name) {
      if (confirmation !== null) {
        setNotice("Suppression annulée : le nom saisi ne correspond pas.");
      }
      return;
    }

    setIsUpdating(true);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(review.project.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Le projet n’a pas pu être supprimé."),
        );
      }

      window.location.assign("/dashboard");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Le projet n’a pas pu être supprimé.",
      );
      setIsUpdating(false);
    }
  }

  function exportReview() {
    if (!review) return;

    const lines = [
      `# ${review.project.name} — ${review.release.version}`,
      "",
      `- Version : ${review.release.title}`,
      `- Preview : ${review.release.previewUrl ?? "non renseignée"}`,
      `- Statut : ${releaseStatusLabel(review.release.status)}`,
      `- Exporté le : ${new Date().toISOString()}`,
      "",
      "## Retours",
      "",
      ...(review.feedback.length
        ? review.feedback.flatMap((item) => [
            `### #${item.sequence} — ${item.title}`,
            "",
            `- État : ${statusLabels[item.status]}`,
            `- Page : ${item.pagePath}`,
            `- Écran : ${item.viewport}`,
            "",
            item.body,
            "",
          ])
        : ["Aucun retour.", ""]),
      "## Décision",
      "",
      review.decisions[0]
        ? `Session invitée au nom de ${review.decisions[0].authorName} (identité non vérifiée) — ${releaseStatusLabel(
            review.decisions[0].status,
          )}\n\n${review.decisions[0].note}`
        : "Aucune décision transmise.",
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${review.project.slug}-${review.release.version}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="workspace-page workspace-flow">
      {mobileMenuOpen ? (
        <button
          className="mobile-sidebar-backdrop"
          type="button"
          aria-label="Fermer la navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <aside
        id="workspace-navigation"
        className={`workspace-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}
        aria-label="Navigation de l’espace développeur"
      >
        <div className="sidebar-brand-block">
          <Link href="/" aria-label="Retour à l’accueil Revaloop">
            <Brand />
          </Link>
          <span className="sidebar-edition">Espace sécurisé</span>
        </div>
        <button
          className="mobile-sidebar-close"
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Fermer la navigation"
        >
          <X aria-hidden="true" />
        </button>

        <nav className="workspace-nav" aria-label="Navigation de l’espace">
          <span className="nav-section-label">Espace</span>
          <Link className="workspace-nav-item active" href="/dashboard">
            <LayoutDashboard className="nav-glyph" aria-hidden="true" />
            Vue d’ensemble
          </Link>

          <span className="nav-section-label nav-projects-label">Projets</span>
          {workspace.projects.map((project) => (
            <Link
              className={`project-nav-item ${
                project.id === activeProjectId ? "active" : ""
              }`}
              href={`/dashboard?project=${encodeURIComponent(project.id)}`}
              key={project.id}
            >
              <span className="project-avatar">{initials(project.name)}</span>
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.latestRelease
                    ? `${project.latestRelease.version} · ${releaseStatusLabel(
                        project.latestRelease.status,
                      )}`
                    : "Aucune version"}
                </small>
              </span>
            </Link>
          ))}
          <button
            className="add-project-button"
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              openDialog("project");
            }}
          >
            <Plus aria-hidden="true" />
            Nouveau projet
          </button>
          {review ? (
            <button
              className="add-project-button"
              type="button"
              disabled={!canPublishRelease}
              onClick={() => {
                setMobileMenuOpen(false);
                openDialog("release");
              }}
            >
              <FilePlus2 aria-hidden="true" />
              Publier une version
            </button>
          ) : null}
        </nav>

        <div className="sidebar-profile">
          <span className="avatar avatar-ink">
            {initials(workspace.viewer.displayName)}
          </span>
          <span>
            <strong>{workspace.viewer.displayName}</strong>
            <small>{workspace.viewer.email}</small>
          </span>
          <Link href={signOutPath} aria-label="Se déconnecter">
            <LogOut aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-title">
            <button
              className="mobile-menu-button"
              type="button"
              aria-label="Ouvrir le menu"
              aria-controls="workspace-navigation"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu aria-hidden="true" />
            </button>
            <span className="project-avatar project-avatar-large">
              {review ? initials(review.project.name) : "+"}
            </span>
            <div>
              <span className="studio-kicker">
                {workspace.organization.name}
              </span>
              <h1>{review?.project.name ?? "Votre premier projet"}</h1>
              <p>
                {review?.project.description ??
                  "Publiez une preview de test avant d’inviter votre client."}
              </p>
            </div>
          </div>
          <div className="workspace-actions">
            {review ? (
              <>
                <button
                  ref={dialogTriggerRef}
                  className="button button-primary button-dashboard"
                  type="button"
                  disabled={!canInvite}
                  onClick={() => openDialog("invitation")}
                >
                  <KeyRound aria-hidden="true" />
                  Créer un lien client
                </button>
                <button
                  className="button button-ghost button-dashboard"
                  type="button"
                  disabled={!canPublishRelease}
                  title={
                    canPublishRelease
                      ? "Publier une nouvelle version"
                      : "Terminez la boucle de validation de la version actuelle avant d’en publier une autre."
                  }
                  onClick={() => openDialog("release")}
                >
                  Publier une version
                  <FilePlus2 aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                ref={dialogTriggerRef}
                className="button button-primary button-dashboard"
                type="button"
                onClick={() => openDialog("project")}
              >
                <Plus aria-hidden="true" />
                Créer mon projet
              </button>
            )}
          </div>
        </header>

        {review ? (
          <>
            <section className="release-strip release-summary">
              <div className="release-state">
                <div>
                  <span className="release-label">
                    Version {review.release.version} ·{" "}
                    {isReleaseExpired
                      ? "Expirée"
                      : releaseStatusLabel(review.release.status)}
                  </span>
                  <strong>{review.release.title}</strong>
                  <span>
                    Publiée {formatRelativeDate(review.release.createdAt)}
                    {review.release.commitSha ? (
                      <>
                        {" "}
                        · commit <code>{review.release.commitSha}</code>
                      </>
                    ) : null}
                    {" · expire le "}
                    {formatCalendarDate(review.release.expiresAt)}
                  </span>
                </div>
              </div>
              <div className="release-focus">
                {review.decisions[0] ? (
                  <>
                    <strong>
                      Décision :{" "}
                      {releaseStatusLabel(review.decisions[0].status)}
                    </strong>
                    <span>
                      Session invitée au nom de{" "}
                      {review.decisions[0].authorName} · identité non vérifiée ·{" "}
                      {formatRelativeDate(review.decisions[0].createdAt)}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>
                      {counts.open + counts.in_progress} retour
                      {counts.open + counts.in_progress > 1 ? "s" : ""} à
                      traiter
                    </strong>
                    <span>
                      {counts.to_review
                        ? `${counts.to_review} prêt${
                            counts.to_review > 1 ? "s" : ""
                          } à revalider`
                        : "Aucune correction en attente de validation"}
                    </span>
                  </>
                )}
              </div>
              <a
                className="open-review-link"
                href={review.release.previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir la preview
                <ExternalLink aria-hidden="true" />
              </a>
            </section>

            <div className="workspace-utility-bar">
              <button
                type="button"
                disabled={isUpdating || !isActiveRelease}
                onClick={signalPreviewUpdate}
                title="Déployez d’abord vos correctifs sur la même URL de staging, puis prévenez le client ici."
              >
                <RefreshCw aria-hidden="true" />
                Signaler les correctifs
              </button>
              <button type="button" onClick={exportReview}>
                <Download aria-hidden="true" />
                Exporter la recette
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={revokeAccess}
              >
                <RotateCcwKey aria-hidden="true" />
                Révoquer l’accès client
              </button>
              <button
                className="utility-danger"
                type="button"
                disabled={isUpdating}
                onClick={removeCurrentProject}
              >
                <Trash2 aria-hidden="true" />
                Supprimer le projet
              </button>
              <span>
                <ShieldCheck aria-hidden="true" />
                Preview externe · utilisez une DB de test
              </span>
            </div>

            <div
              className="workspace-content-tabs"
              role="tablist"
              aria-label="Contenu de la recette"
            >
              <button
                id="workspace-tab-feedback"
                className={workspaceTab === "feedback" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={workspaceTab === "feedback"}
                aria-controls="workspace-panel-feedback"
                onClick={() => setWorkspaceTab("feedback")}
              >
                Retours
              </button>
              <button
                id="workspace-tab-discussion"
                className={workspaceTab === "discussion" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={workspaceTab === "discussion"}
                aria-controls="workspace-panel-discussion"
                onClick={() => setWorkspaceTab("discussion")}
              >
                Discussion
              </button>
            </div>

            {workspaceTab === "feedback" ? (
            <section
              id="workspace-panel-feedback"
              className="feedback-workspace"
              role="tabpanel"
              aria-labelledby="workspace-tab-feedback"
            >
              <div className="feedback-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">File de travail</p>
                    <h2>Retours de cette version</h2>
                  </div>
                  <div
                    className="filter-row"
                    role="group"
                    aria-label="Filtrer les retours"
                  >
                    {[
                      ["all", "Tous"],
                      ["todo", "À traiter"],
                      ["to_review", "À revalider"],
                      ["resolved", "Validés"],
                    ].map(([value, label]) => (
                      <button
                        className={filter === value ? "active" : ""}
                        key={value}
                        type="button"
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value as FeedbackFilter)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="feedback-table">
                  <div className="feedback-table-head" aria-hidden="true">
                    <span>Retour</span>
                    <span>État</span>
                    <span>Mis à jour</span>
                  </div>
                  {filteredFeedback.length ? (
                    filteredFeedback.map((item) => (
                      <button
                        className={`feedback-row ${
                          selected?.id === item.id ? "selected" : ""
                        }`}
                        key={item.id}
                        type="button"
                        aria-pressed={selected?.id === item.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="feedback-main-cell">
                          <span className="feedback-mobile-label">Retour</span>
                          <strong>
                            #{item.sequence} · {item.title}
                          </strong>
                        </span>
                        <span className={`status-badge status-${item.status}`}>
                          <span className="feedback-mobile-label">État</span>
                          {statusLabels[item.status]}
                        </span>
                        <span className="feedback-date">
                          <span className="feedback-mobile-label">
                            Mise à jour
                          </span>
                          {formatRelativeDate(item.updatedAt)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="empty-feedback">
                      <CircleCheck aria-hidden="true" />
                      <strong>Aucun retour dans cet état</strong>
                      <p>
                        Le client explore librement la preview et pourra
                        déposer ses remarques depuis son invitation.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <aside className="feedback-detail">
                {selected ? (
                  <>
                    <span className={`status-badge status-${selected.status}`}>
                      {statusLabels[selected.status]}
                    </span>
                    <p className="eyebrow">
                      Retour de {selected.authorName}
                    </p>
                    <h2>{selected.title}</h2>
                    <p>{selected.body}</p>
                    <dl className="secure-feedback-meta">
                      <div>
                        <dt>Page</dt>
                        <dd>{selected.pagePath}</dd>
                      </div>
                      <div>
                        <dt>Écran</dt>
                        <dd>{selected.viewport}</dd>
                      </div>
                    </dl>
                    {statusAction[selected.status].next ? (
                      <button
                        className="button button-primary button-full"
                        type="button"
                        disabled={isUpdating || !isActiveRelease}
                        aria-busy={isUpdating}
                        onClick={() => advanceFeedback(selected)}
                      >
                        {statusAction[selected.status].label}
                        <Check aria-hidden="true" />
                      </button>
                    ) : (
                      <p className="detail-waiting">
                        {selected.status === "to_review"
                          ? "Le client doit maintenant confirmer ou rouvrir ce retour."
                          : "Ce retour a été validé par le client."}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="empty-feedback">
                    <Link2 aria-hidden="true" />
                    <strong>La boucle est prête</strong>
                    <p>Les nouveaux retours apparaîtront ici automatiquement.</p>
                  </div>
                )}
              </aside>
            </section>
            ) : (
              <section
                id="workspace-panel-discussion"
                className="developer-discussion"
                role="tabpanel"
                aria-labelledby="workspace-tab-discussion"
              >
                <header>
                  <div>
                    <p className="eyebrow">Conversation du projet</p>
                    <h2>Échangez sans créer de retour.</h2>
                  </div>
                  <MessageCircle aria-hidden="true" />
                </header>
                <ol
                  ref={messageThreadRef}
                  className="developer-message-thread"
                  aria-live="polite"
                >
                  {(review.messages ?? []).length ? (
                    (review.messages ?? []).map((message) => (
                      <li
                        className={`developer-message is-${message.authorRole}`}
                        key={message.id}
                      >
                        <div>
                          <strong>{message.authorName}</strong>
                          <time dateTime={message.createdAt}>
                            {formatRelativeDate(message.createdAt)}
                          </time>
                        </div>
                        <p>{message.body}</p>
                      </li>
                    ))
                  ) : (
                    <li className="developer-discussion-empty">
                      <MessageCircle aria-hidden="true" />
                      <strong>La conversation est prête.</strong>
                      <p>
                        Posez une question ou donnez du contexte, sans demander
                        au client de placer une annotation.
                      </p>
                    </li>
                  )}
                </ol>
                <form
                  className="developer-message-composer"
                  onSubmit={sendDeveloperMessage}
                >
                  <label htmlFor="developer-message">
                    Message au client
                  </label>
                  <div>
                    <textarea
                      id="developer-message"
                      value={messageBody}
                      maxLength={2_000}
                      rows={3}
                      placeholder={
                        isActiveRelease
                          ? "Écrivez votre message…"
                          : "Cette version est clôturée."
                      }
                      disabled={!isActiveRelease}
                      onChange={(event) => setMessageBody(event.target.value)}
                    />
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={
                        isSendingMessage ||
                        !isActiveRelease ||
                        !messageBody.trim()
                      }
                      aria-busy={isSendingMessage}
                    >
                      {isSendingMessage ? "Envoi…" : "Envoyer"}
                      <Send aria-hidden="true" />
                    </button>
                  </div>
                </form>
              </section>
            )}
          </>
        ) : (
          <section className="workspace-onboarding">
            <div>
              <span className="onboarding-icon">
                <Link2 aria-hidden="true" />
              </span>
              <p className="eyebrow">Première recette</p>
              <h2>Reliez une vraie preview à Revaloop.</h2>
              <p>
                Utilisez une URL HTTPS de staging, une base de test et des
                services externes en mode sandbox. Le site de production ne
                doit pas être utilisé pour ce pilote.
              </p>
              <button
                className="button button-primary"
                type="button"
                onClick={() => openDialog("project")}
              >
                Créer le projet et sa première version
                <ArrowUpRight aria-hidden="true" />
              </button>
            </div>
            <ol>
              <li>
                <span>01</span>
                <strong>Indiquez votre preview HTTPS</strong>
                <p>Revaloop ne copie ni votre code ni votre base.</p>
              </li>
              <li>
                <span>02</span>
                <strong>Créez une invitation éphémère</strong>
                <p>Le secret disparaît de l’adresse après ouverture.</p>
              </li>
              <li>
                <span>03</span>
                <strong>Recevez les retours contextualisés</strong>
                <p>Le client n’accède jamais à votre dashboard.</p>
              </li>
            </ol>
          </section>
        )}

        {notice ? (
          <p className="sync-notice" role="status">
            {notice}
          </p>
        ) : null}
      </main>

      {dialog ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDialog();
          }}
        >
          <section
            className="release-dialog secure-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="secure-dialog-title"
            onKeyDown={trapDialogFocus}
          >
            <button
              className="dialog-close"
              type="button"
              autoFocus
              onClick={closeDialog}
              aria-label="Fermer"
            >
              <X aria-hidden="true" />
            </button>

            {dialog === "invitation" ? (
              <InvitationDialog
                error={formError}
                expiresAt={inviteExpiresAt}
                inviteUrl={inviteUrl}
                isUpdating={isUpdating}
                reviewerName={review?.reviewerName}
                onSubmit={submitInvitation}
                onCopy={() => {
                  navigator.clipboard
                    .writeText(inviteUrl)
                    .then(() => setNotice("Lien client copié."))
                    .catch(() =>
                      setNotice(
                        "Copie automatique refusée. Sélectionnez le lien manuellement.",
                      ),
                    );
                }}
              />
            ) : (
              <ReleaseForm
                error={formError}
                includeProject={dialog === "project"}
                isUpdating={isUpdating}
                onSubmit={
                  dialog === "project" ? submitProject : submitRelease
                }
              />
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ReleaseForm({
  includeProject,
  isUpdating,
  error,
  onSubmit,
}: {
  includeProject: boolean;
  isUpdating: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="secure-form" onSubmit={onSubmit}>
      <span className="dialog-icon">
        <FilePlus2 aria-hidden="true" />
      </span>
      <p className="eyebrow">
        {includeProject ? "Nouveau projet" : "Nouvelle version"}
      </p>
      <h2 id="secure-dialog-title">
        {includeProject
          ? "Préparez un espace de recette isolé."
          : "Publiez une nouvelle release."}
      </h2>
      <p className="secure-dialog-lead">
        La cible est une preview externe mutable. Utilisez exclusivement une
        base de test et des services sandbox.
      </p>
      <div className="dialog-safety">
        <ShieldCheck aria-hidden="true" />
        <p>
          Revaloop sécurise l’invitation et les retours, pas l’URL de staging.
          Protégez cette preview séparément et retirez toute donnée sensible.
        </p>
      </div>

      {includeProject ? (
        <div className="secure-form-grid">
          <label>
            <span>Nom du projet</span>
            <input name="name" required minLength={2} maxLength={100} />
          </label>
          <label>
            <span>Description</span>
            <input name="description" maxLength={500} />
          </label>
        </div>
      ) : null}

      <label>
        <span>URL HTTPS de la preview</span>
        <input
          name="previewUrl"
          type="url"
          placeholder="https://staging.exemple.fr"
          required
        />
      </label>

      <div className="secure-form-grid secure-form-grid-three">
        <label>
          <span>Version</span>
          <input name="version" defaultValue="v0.1" required maxLength={40} />
        </label>
        <label>
          <span>Titre</span>
          <input
            name="title"
            placeholder="Parcours principal"
            required
            minLength={3}
            maxLength={140}
          />
        </label>
        <label>
          <span>Commit facultatif</span>
          <input name="commitSha" maxLength={80} />
        </label>
      </div>

      <label>
        <span>Message d’accueil au client</span>
        <textarea
          name="reviewerMessage"
          maxLength={1_200}
          placeholder="Ajoutez ici un contexte utile pour cette version."
        />
      </label>

      <fieldset className="test-item-fields">
        <legend>Vérifications suggérées · optionnel</legend>
        <p>
          Le client pourra toujours explorer librement la preview et ajouter
          ses propres retours. Renseignez seulement les points qui nécessitent
          une vérification précise.
        </p>
        {[1, 2, 3].map((index) => (
          <div className="secure-form-grid" key={index}>
            <label>
              <span>Point {index}</span>
              <input
                name={`testTitle${index}`}
                maxLength={120}
              />
            </label>
            <label>
              <span>Précision</span>
              <input
                name={`testDescription${index}`}
                maxLength={400}
              />
            </label>
          </div>
        ))}
      </fieldset>

      <label className="secure-form-compact">
        <span>Expiration de la release</span>
        <select name="expiresInDays" defaultValue="14">
          <option value="7">7 jours</option>
          <option value="14">14 jours</option>
          <option value="30">30 jours</option>
        </select>
      </label>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button
        className="button button-primary button-full"
        type="submit"
        disabled={isUpdating}
        aria-busy={isUpdating}
      >
        {isUpdating ? "Publication…" : "Publier cette version"}
        <ArrowUpRight aria-hidden="true" />
      </button>
    </form>
  );
}

function InvitationDialog({
  isUpdating,
  reviewerName,
  inviteUrl,
  expiresAt,
  error,
  onSubmit,
  onCopy,
}: {
  isUpdating: boolean;
  reviewerName?: string;
  inviteUrl: string;
  expiresAt: string;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCopy: () => void;
}) {
  if (inviteUrl) {
    return (
      <div className="secure-form">
        <span className="dialog-icon">
          <Check aria-hidden="true" />
        </span>
        <p className="eyebrow">Invitation prête</p>
        <h2 id="secure-dialog-title">Copiez ce lien maintenant.</h2>
        <p className="secure-dialog-lead">
          Le secret n’est affiché qu’une fois. Créer une nouvelle invitation
          révoquera celle-ci ainsi que sa session.
        </p>
        <div className="invite-result">
          <code>{inviteUrl}</code>
          <button type="button" onClick={onCopy}>
            <Copy aria-hidden="true" />
            Copier
          </button>
        </div>
        <p className="invitation-expiry">
          Expire le {formatCalendarDate(expiresAt)}.
        </p>
      </div>
    );
  }

  return (
    <form className="secure-form" onSubmit={onSubmit}>
      <span className="dialog-icon">
        <KeyRound aria-hidden="true" />
      </span>
      <p className="eyebrow">Accès client</p>
      <h2 id="secure-dialog-title">Créez une invitation à usage unique.</h2>
      <p className="secure-dialog-lead">
        Le lien est échangé contre une session privée. Son secret n’est jamais
        conservé en clair par Revaloop.
      </p>
      <label>
        <span>Nom affiché pour la session invitée</span>
        <input
          name="reviewerName"
          defaultValue={reviewerName ?? ""}
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <label className="secure-form-compact">
        <span>Expiration de l’invitation</span>
        <select name="expiresInDays" defaultValue="7">
          <option value="1">24 heures</option>
          <option value="3">3 jours</option>
          <option value="7">7 jours</option>
          <option value="14">14 jours</option>
        </select>
      </label>
      <div className="dialog-safety">
        <ShieldCheck aria-hidden="true" />
        <p>
          La création de ce lien révoque automatiquement les anciens accès de
          cette version. La nouvelle personne invitée verra l’historique des
          retours déjà présents ; créez un autre projet si le destinataire
          change.
        </p>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button
        className="button button-primary button-full"
        type="submit"
        disabled={isUpdating}
        aria-busy={isUpdating}
      >
        {isUpdating ? "Création…" : "Créer et copier le lien"}
        <Link2 aria-hidden="true" />
      </button>
    </form>
  );
}
