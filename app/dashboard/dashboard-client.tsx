"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CircleCheck,
  ClipboardCheck,
  Copy,
  Ellipsis,
  ExternalLink,
  LayoutDashboard,
  Link2,
  ListChecks,
  Menu,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

type FeedbackFilter = "all" | "todo" | "to_review" | "resolved";

const statusAction: Record<
  FeedbackStatus,
  { label: string; next: FeedbackStatus | null }
> = {
  open: { label: "Prendre en charge", next: "in_progress" },
  in_progress: { label: "Prêt à revalider", next: "to_review" },
  to_review: { label: "En attente de Claire", next: null },
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

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") {
    return;
  }

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
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

export function DashboardClient({
  initialWorkspace,
}: {
  initialWorkspace: ReviewPayload;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [selectedId, setSelectedId] = useState(initialWorkspace.feedback[0]?.id);
  const [activeStatus, setActiveStatus] = useState<FeedbackFilter>("all");
  const [copied, setCopied] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notice, setNotice] = useState("");
  const releaseButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

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

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(""), 4800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!showReleaseDialog) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowReleaseDialog(false);
        window.requestAnimationFrame(() => releaseButtonRef.current?.focus());
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showReleaseDialog]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");

    function syncLayout(event: MediaQueryList | MediaQueryListEvent) {
      setIsMobileLayout(event.matches);
      if (!event.matches) {
        setMobileMenuOpen(false);
      }
    }

    syncLayout(mediaQuery);
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen || !isMobileLayout) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      sidebarRef.current
        ?.querySelector<HTMLElement>(".workspace-nav-item.active")
        ?.focus();
    });

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMobileMenu();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeMobileMenu, isMobileLayout, mobileMenuOpen]);

  function closeReleaseDialog() {
    setShowReleaseDialog(false);
    window.requestAnimationFrame(() => releaseButtonRef.current?.focus());
  }

  const filteredFeedback = useMemo(
    () => {
      if (activeStatus === "all") {
        return workspace.feedback;
      }

      if (activeStatus === "todo") {
        return workspace.feedback.filter(
          (item) => item.status === "open" || item.status === "in_progress",
        );
      }

      return workspace.feedback.filter((item) => item.status === activeStatus);
    },
    [activeStatus, workspace.feedback],
  );

  const selected =
    filteredFeedback.find((item) => item.id === selectedId) ??
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
        body: JSON.stringify({
          status: nextStatus,
          reviewToken: workspace.release.shareToken,
        }),
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
    <div className="workspace-page workspace-flow">
      <aside
        ref={sidebarRef}
        className={`workspace-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}
        inert={isMobileLayout && !mobileMenuOpen ? true : undefined}
        aria-hidden={isMobileLayout && !mobileMenuOpen ? true : undefined}
        role={isMobileLayout ? "dialog" : undefined}
        aria-modal={isMobileLayout && mobileMenuOpen ? true : undefined}
        aria-label={isMobileLayout ? "Navigation de l’espace développeur" : undefined}
        onKeyDown={
          isMobileLayout && mobileMenuOpen ? trapDialogFocus : undefined
        }
      >
        <div className="sidebar-brand-block">
          <Link href="/" aria-label="Retour à l’accueil Revaloop">
            <Brand />
          </Link>
          <span className="sidebar-edition">Espace développeur</span>
        </div>
        <button
          className="mobile-sidebar-close"
          type="button"
          onClick={closeMobileMenu}
          aria-label="Fermer la navigation"
        >
          <X aria-hidden="true" />
        </button>

        <nav className="workspace-nav" aria-label="Navigation de l’espace">
          <span className="nav-section-label">Espace</span>
          <button className="workspace-nav-item active" type="button">
            <LayoutDashboard className="nav-glyph" aria-hidden="true" />
            Vue d’ensemble
          </button>

          <span className="nav-section-label nav-projects-label">Projets</span>
          <button className="project-nav-item active" type="button">
            <span className="project-avatar">MM</span>
            <span>
              <strong>{workspace.project.name}</strong>
              <small>
                Version {workspace.release.version} en recette
              </small>
            </span>
          </button>
        </nav>

        <div className="sidebar-profile">
          <span className="avatar avatar-ink">RM</span>
          <span>
            <strong>Raphaël Martin</strong>
            <small>Développeur</small>
          </span>
          <Ellipsis aria-hidden="true" />
        </div>
      </aside>

      <main
        className="workspace-main"
        inert={isMobileLayout && mobileMenuOpen ? true : undefined}
        aria-hidden={isMobileLayout && mobileMenuOpen ? true : undefined}
      >
        <header className="workspace-header">
          <div className="workspace-title">
            <button
              ref={menuButtonRef}
              className="mobile-menu-button"
              type="button"
              aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => {
                if (mobileMenuOpen) {
                  closeMobileMenu();
                } else {
                  setMobileMenuOpen(true);
                }
              }}
            >
              <Menu aria-hidden="true" />
            </button>
            <span className="project-avatar project-avatar-large">MM</span>
            <div>
              <span className="studio-kicker">Espace de recette</span>
              <h1>{workspace.project.name}</h1>
              <p>{workspace.project.description}</p>
            </div>
          </div>
          <div className="workspace-actions">
            <button
              className="button button-primary button-dashboard"
              type="button"
              onClick={copyShareLink}
            >
              {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
              {copied ? "Lien copié" : "Copier le lien client"}
            </button>
            <button
              ref={releaseButtonRef}
              className="button button-ghost button-dashboard"
              type="button"
              onClick={() => setShowReleaseDialog(true)}
            >
              Comment publier&nbsp;?
              <ArrowUpRight aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="release-strip release-summary">
          <div className="release-state">
            <div>
              <span className="release-label">
                Version {workspace.release.version}
              </span>
              <strong>{workspace.release.title}</strong>
              <span>
                Publiée {formatRelativeDate(workspace.release.createdAt)} · commit{" "}
                <code>{workspace.release.commitSha}</code>
              </span>
            </div>
          </div>
          <div className="release-focus">
            <strong>
              {counts.open + counts.in_progress} retour
              {counts.open + counts.in_progress > 1 ? "s" : ""} à traiter
            </strong>
            <span>
              {counts.to_review
                ? `${counts.to_review} prêt${counts.to_review > 1 ? "s" : ""} à revalider`
                : "Aucune correction en attente de validation"}
            </span>
          </div>
          <Link
            className="open-review-link"
            href={`/review/${workspace.release.shareToken}`}
          >
            Voir l’espace client
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </section>

        <section className="feedback-workspace">
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
                <button
                  className={activeStatus === "all" ? "active" : ""}
                  type="button"
                  aria-pressed={activeStatus === "all"}
                  onClick={() => setActiveStatus("all")}
                >
                  Tous
                </button>
                {[
                  { value: "todo" as const, label: "À traiter" },
                  { value: "to_review" as const, label: "À revalider" },
                  { value: "resolved" as const, label: "Validés" },
                ].map(({ value, label }) => (
                  <button
                    className={activeStatus === value ? "active" : ""}
                    key={value}
                    type="button"
                    aria-pressed={activeStatus === value}
                    onClick={() => setActiveStatus(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="feedback-table">
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
                    aria-pressed={selected?.id === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="feedback-main-cell">
                      <strong>{item.title}</strong>
                    </span>
                    <span className="feedback-type">
                      <small className="feedback-mobile-label">Type</small>
                      {typeLabels[item.type]}
                    </span>
                    <span className={`status-badge status-${item.status}`}>
                      <small className="feedback-mobile-label">État</small>
                      {statusLabels[item.status]}
                    </span>
                    <span className="feedback-date">
                      <small className="feedback-mobile-label">
                        Mise à jour
                      </small>
                      {formatRelativeDate(item.updatedAt)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty-feedback">
                  <Check aria-hidden="true" />
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
                  <span className={`status-badge status-${selected.status}`}>
                    {statusLabels[selected.status]}
                  </span>
                </div>
                <span className="detail-kicker">Retour de Claire</span>
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
                {selected.positionX !== null &&
                  selected.positionY !== null && (
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
                        <span className="sr-only">
                          Emplacement du retour
                        </span>
                      </span>
                    </div>
                    <span>
                      Voir dans la page <ExternalLink aria-hidden="true" />
                    </span>
                  </Link>
                )}
                <div className="detail-actions">
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={!statusAction[selected.status].next || isUpdating}
                    aria-busy={isUpdating}
                    onClick={() => advanceFeedback(selected)}
                  >
                    {isUpdating
                      ? "Enregistrement…"
                      : statusAction[selected.status].label}
                  </button>
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled
                    title="Les fils de discussion arrivent dans un prochain jalon"
                  >
                    Répondre à Claire
                  </button>
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <CircleCheck aria-hidden="true" />
                <strong>Sélectionnez un retour</strong>
              </div>
            )}
          </aside>
        </section>

        {notice ? (
          <p className="sync-notice" role="status">
            {notice}
          </p>
        ) : null}
      </main>

      {showReleaseDialog && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeReleaseDialog();
            }
          }}
        >
          <section
            className="release-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-dialog-title"
            onKeyDown={trapDialogFocus}
          >
            <button
              className="dialog-close"
              type="button"
              autoFocus
              onClick={closeReleaseDialog}
              aria-label="Fermer"
            >
              <X aria-hidden="true" />
            </button>
            <span className="dialog-icon">
              <ClipboardCheck aria-hidden="true" />
            </span>
            <p className="eyebrow">Nouvelle version</p>
            <h2 id="release-dialog-title">Publiez depuis votre terminal.</h2>
            <p>
              Cette commande décrit le parcours cible. L’agent réseau et le
              relais ne sont pas encore livrés dans cette pré-alpha ; le portail
              de revue, lui, est déjà fonctionnel.
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
                <Copy aria-hidden="true" />
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
              onClick={closeReleaseDialog}
            >
              <ListChecks aria-hidden="true" />
              Fermer
            </button>
          </section>
        </div>
      )}
      {mobileMenuOpen && (
        <button
          className="mobile-sidebar-backdrop"
          type="button"
          aria-label="Fermer le menu"
          onClick={closeMobileMenu}
        />
      )}
    </div>
  );
}
