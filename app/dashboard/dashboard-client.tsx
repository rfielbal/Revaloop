"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Brand } from "../components/brand";
import {
  formatRelativeDate,
  statusLabels,
  type FeedbackItem,
  type FeedbackStatus,
  type ReviewPayload,
  typeLabels,
} from "../../lib/revaloop";

const columns: FeedbackStatus[] = [
  "open",
  "in_progress",
  "to_review",
  "resolved",
];

const statusAction: Record<
  FeedbackStatus,
  { label: string; next: FeedbackStatus | null }
> = {
  open: { label: "Prendre en charge", next: "in_progress" },
  in_progress: { label: "Prêt à revalider", next: "to_review" },
  to_review: { label: "Marquer comme validé", next: "resolved" },
  resolved: { label: "Retour validé", next: null },
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DashboardClient({
  initialWorkspace,
}: {
  initialWorkspace: ReviewPayload;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [selectedId, setSelectedId] = useState(initialWorkspace.feedback[0]?.id);
  const [activeStatus, setActiveStatus] = useState<FeedbackStatus | "all">("all");
  const [copied, setCopied] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notice, setNotice] = useState(
    "Données de démonstration chargées localement.",
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("workspace unavailable");
        }
        return (await response.json()) as ReviewPayload;
      })
      .then((payload) => {
        if (!cancelled) {
          setWorkspace(payload);
          setNotice("Synchronisé avec l’espace de recette.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotice("Mode démonstration : les données initiales restent disponibles.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFeedback = useMemo(
    () =>
      activeStatus === "all"
        ? workspace.feedback
        : workspace.feedback.filter((item) => item.status === activeStatus),
    [activeStatus, workspace.feedback],
  );

  const selected =
    workspace.feedback.find((item) => item.id === selectedId) ??
    filteredFeedback[0] ??
    null;

  const counts = useMemo(
    () =>
      columns.reduce<Record<FeedbackStatus, number>>(
        (accumulator, status) => {
          accumulator[status] = workspace.feedback.filter(
            (item) => item.status === status,
          ).length;
          return accumulator;
        },
        { open: 0, in_progress: 0, to_review: 0, resolved: 0 },
      ),
    [workspace.feedback],
  );

  const completion = workspace.feedback.length
    ? Math.round((counts.resolved / workspace.feedback.length) * 100)
    : 0;

  async function copyShareLink() {
    const link = `${window.location.origin}/review/${workspace.release.shareToken}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(`Lien client : ${link}`);
    }
  }

  async function advanceFeedback(item: FeedbackItem) {
    const nextStatus = statusAction[item.status].next;

    if (!nextStatus || isUpdating) {
      return;
    }

    setIsUpdating(true);
    const previous = workspace.feedback;
    setWorkspace((current) => ({
      ...current,
      feedback: current.feedback.map((feedback) =>
        feedback.id === item.id
          ? {
              ...feedback,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : feedback,
      ),
    }));

    try {
      const response = await fetch(`/api/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error("update failed");
      }

      const updated = (await response.json()) as FeedbackItem;
      setWorkspace((current) => ({
        ...current,
        feedback: current.feedback.map((feedback) =>
          feedback.id === updated.id ? updated : feedback,
        ),
      }));
      setNotice(`Le retour #${item.sequence} passe à « ${statusLabels[nextStatus]} ».`);
    } catch {
      setWorkspace((current) => ({ ...current, feedback: previous }));
      setNotice("La mise à jour n’a pas été enregistrée. Réessayez.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="workspace-page">
      <aside className="workspace-sidebar">
        <Link href="/" aria-label="Retour à l’accueil Revaloop">
          <Brand />
        </Link>

        <nav className="workspace-nav" aria-label="Navigation de l’espace">
          <span className="nav-section-label">Espace</span>
          <button className="workspace-nav-item active" type="button">
            <span className="nav-glyph">⌂</span>
            Vue d’ensemble
          </button>
          <button className="workspace-nav-item" type="button">
            <span className="nav-glyph">◎</span>
            Tous les retours
            <span className="nav-count">{counts.open + counts.to_review}</span>
          </button>
          <button className="workspace-nav-item" type="button">
            <span className="nav-glyph">⌁</span>
            Activité
          </button>

          <span className="nav-section-label nav-projects-label">Projets</span>
          <button className="project-nav-item active" type="button">
            <span
              className="project-avatar"
              style={{ background: workspace.project.accent }}
            >
              MM
            </span>
            <span>
              <strong>{workspace.project.name}</strong>
              <small>
                <i className="online-dot" /> En recette
              </small>
            </span>
          </button>
          <button className="add-project-button" type="button">
            <span>＋</span>
            Nouveau projet
          </button>
        </nav>

        <div className="sidebar-profile">
          <span className="avatar avatar-ink">RM</span>
          <span>
            <strong>Raphaël Martin</strong>
            <small>Développeur</small>
          </span>
          <span aria-hidden="true">•••</span>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-title">
            <button
              className="mobile-menu-button"
              type="button"
              aria-label="Ouvrir le menu"
            >
              ☰
            </button>
            <span
              className="project-avatar project-avatar-large"
              style={{ background: workspace.project.accent }}
            >
              MM
            </span>
            <div>
              <h1>{workspace.project.name}</h1>
              <p>{workspace.project.description}</p>
            </div>
          </div>
          <div className="workspace-actions">
            <button
              className="button button-ghost button-dashboard"
              type="button"
              onClick={copyShareLink}
            >
              <span aria-hidden="true">⌁</span>
              {copied ? "Lien copié" : "Copier le lien"}
            </button>
            <button
              className="button button-primary button-dashboard"
              type="button"
              onClick={() => setShowReleaseDialog(true)}
            >
              Nouvelle version
              <span aria-hidden="true">＋</span>
            </button>
          </div>
        </header>

        <div className="release-strip">
          <div className="release-state">
            <span className="pulse-ring">
              <i />
            </span>
            <div>
              <strong>Version {workspace.release.version} en recette</strong>
              <span>
                {workspace.release.title} · publiée le{" "}
                {formatRelativeDate(workspace.release.createdAt)}
              </span>
            </div>
          </div>
          <div className="release-meta">
            <span>
              <small>Commit</small>
              <code>{workspace.release.commitSha}</code>
            </span>
            <span>
              <small>Expiration</small>
              <strong>6 août</strong>
            </span>
            <Link
              className="open-review-link"
              href={`/review/${workspace.release.shareToken}`}
            >
              Ouvrir la recette
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>

        <section className="dashboard-overview">
          <article className="metric-card">
            <span className="metric-label">Retours reçus</span>
            <strong>{workspace.feedback.length}</strong>
            <small>
              <i className="trend-dot trend-coral" />{" "}
              {counts.open + counts.in_progress} à traiter
            </small>
          </article>
          <article className="metric-card">
            <span className="metric-label">À revalider</span>
            <strong>{counts.to_review}</strong>
            <small>
              <i className="trend-dot trend-lime" /> Prêt pour Claire
            </small>
          </article>
          <article className="metric-card metric-card-progress">
            <div>
              <span className="metric-label">Avancement</span>
              <strong>{completion}%</strong>
            </div>
            <div className="radial-progress" style={{ "--progress": completion } as React.CSSProperties}>
              <span>{completion}%</span>
            </div>
          </article>
          <article className="metric-card metric-card-client">
            <span className="avatar avatar-coral">CD</span>
            <div>
              <span className="metric-label">Dernière activité</span>
              <strong>Claire Dubois</strong>
              <small>Retour ajouté hier à 15:28</small>
            </div>
          </article>
        </section>

        <section className="feedback-workspace">
          <div className="feedback-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Boucle de validation</p>
                <h2>Retours de cette version</h2>
              </div>
              <div className="filter-row" aria-label="Filtrer les retours">
                <button
                  className={activeStatus === "all" ? "active" : ""}
                  type="button"
                  onClick={() => setActiveStatus("all")}
                >
                  Tous <span>{workspace.feedback.length}</span>
                </button>
                {columns.map((status) => (
                  <button
                    className={activeStatus === status ? "active" : ""}
                    key={status}
                    type="button"
                    onClick={() => setActiveStatus(status)}
                  >
                    {statusLabels[status]} <span>{counts[status]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="feedback-table" role="list">
              <div className="feedback-table-head" aria-hidden="true">
                <span>Retour</span>
                <span>Type</span>
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
                    onClick={() => setSelectedId(item.id)}
                    role="listitem"
                  >
                    <span className="feedback-main-cell">
                      <i className={`priority-marker priority-${item.priority}`} />
                      <span className="feedback-number">#{item.sequence}</span>
                      <strong>{item.title}</strong>
                    </span>
                    <span className="feedback-type">
                      {typeLabels[item.type]}
                    </span>
                    <span className={`status-badge status-${item.status}`}>
                      {statusLabels[item.status]}
                    </span>
                    <span className="feedback-date">
                      {formatRelativeDate(item.updatedAt)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty-feedback">
                  <span>✓</span>
                  <strong>Aucun retour dans cet état</strong>
                  <p>Choisissez un autre filtre pour poursuivre la recette.</p>
                </div>
              )}
            </div>
          </div>

          <aside className="feedback-detail">
            {selected ? (
              <>
                <div className="detail-heading">
                  <div>
                    <span className="feedback-number">#{selected.sequence}</span>
                    <span className={`status-badge status-${selected.status}`}>
                      {statusLabels[selected.status]}
                    </span>
                  </div>
                  <button type="button" aria-label="Plus d’options">
                    •••
                  </button>
                </div>
                <h2>{selected.title}</h2>
                <div className="detail-author">
                  <span className="avatar avatar-coral">
                    {initials(selected.authorName)}
                  </span>
                  <span>
                    <strong>{selected.authorName}</strong>
                    <small>{formatRelativeDate(selected.createdAt)}</small>
                  </span>
                </div>
                <p className="detail-body">{selected.body}</p>
                <div className="detail-context">
                  <div>
                    <span>Page</span>
                    <code>{selected.pagePath}</code>
                  </div>
                  <div>
                    <span>Écran</span>
                    <strong>{selected.viewport}</strong>
                  </div>
                  <div>
                    <span>Version</span>
                    <strong>{workspace.release.version}</strong>
                  </div>
                  <div>
                    <span>Type</span>
                    <strong>{typeLabels[selected.type]}</strong>
                  </div>
                </div>
                {selected.positionX !== null && (
                  <Link
                    className="context-preview"
                    href={`/review/${workspace.release.shareToken}?focus=${selected.sequence}`}
                  >
                    <div className="context-preview-page">
                      <span
                        className="context-pin"
                        style={{
                          left: `${selected.positionX}%`,
                          top: `${selected.positionY}%`,
                        }}
                      >
                        {selected.sequence}
                      </span>
                    </div>
                    <span>
                      Voir dans la page <i aria-hidden="true">↗</i>
                    </span>
                  </Link>
                )}
                <div className="detail-actions">
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={!statusAction[selected.status].next || isUpdating}
                    onClick={() => advanceFeedback(selected)}
                  >
                    {isUpdating
                      ? "Enregistrement…"
                      : statusAction[selected.status].label}
                  </button>
                  <button className="button button-ghost" type="button">
                    Répondre à Claire
                  </button>
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <span>◎</span>
                <strong>Sélectionnez un retour</strong>
              </div>
            )}
          </aside>
        </section>

        <p className="sync-notice" role="status">
          <span className="online-dot" />
          {notice}
        </p>
      </main>

      {showReleaseDialog && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setShowReleaseDialog(false);
            }
          }}
        >
          <section
            className="release-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-dialog-title"
          >
            <button
              className="dialog-close"
              type="button"
              onClick={() => setShowReleaseDialog(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <span className="dialog-icon">↗</span>
            <p className="eyebrow">Nouvelle version</p>
            <h2 id="release-dialog-title">Publiez depuis votre terminal.</h2>
            <p>
              Le futur agent Revaloop identifiera votre application locale,
              créera une version isolée et conservera le même lien client.
            </p>
            <div className="command-block">
              <span>$</span>
              <code>revaloop share http://localhost:3000</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    .writeText("revaloop share http://localhost:3000")
                    .catch(() => undefined);
                  setNotice("Commande Revaloop copiée.");
                }}
              >
                Copier
              </button>
            </div>
            <div className="dialog-safety">
              <span>!</span>
              <p>
                Utilisez une base de test et des services externes en mode
                sandbox. Une session locale n’est pas un hébergement permanent.
              </p>
            </div>
            <button
              className="button button-ink button-full"
              type="button"
              onClick={() => setShowReleaseDialog(false)}
            >
              J’ai compris
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
