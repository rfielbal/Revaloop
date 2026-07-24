"use client";

import Link from "next/link";
import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Brand } from "../../components/brand";
import {
  statusLabels,
  type FeedbackItem,
  type FeedbackPriority,
  type FeedbackType,
  type ReviewDecision,
  type ReviewPayload,
  typeLabels,
} from "../../../lib/revaloop";

type Viewport = "desktop" | "tablet" | "mobile";
type ReviewMode = "browse" | "comment";

type ComposerPosition = {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
};

const testPoints = [
  {
    title: "Accroche de la page d’accueil",
    text: "Le message et le bouton principal sont-ils immédiatement compréhensibles ?",
  },
  {
    title: "Réservation d’une table",
    text: "Essayez de réserver un dîner fictif pour deux personnes.",
  },
  {
    title: "Lecture sur téléphone",
    text: "Vérifiez la navigation et la lisibilité des informations essentielles.",
  },
];

const viewportLabels: Record<Viewport, string> = {
  desktop: "Desktop · 1440 × 900",
  tablet: "Tablette · 820 × 1180",
  mobile: "Mobile · 390 × 844",
};

export function ReviewClient({
  token,
  initialReview,
}: {
  token: string;
  initialReview: ReviewPayload;
}) {
  const [review, setReview] = useState(initialReview);
  const [mode, setMode] = useState<ReviewMode>("browse");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<"brief" | "feedback">("brief");
  const [completedPoints, setCompletedPoints] = useState<number[]>([0]);
  const [composer, setComposer] = useState<ComposerPosition | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(
    null,
  );
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [showReservation, setShowReservation] = useState(false);
  const [toast, setToast] = useState(
    "Vous testez une démonstration avec des données fictives.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<{
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    body: string;
  }>({
    type: "visual",
    priority: "normal",
    title: "",
    body: "",
  });
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/review/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("review unavailable");
        }
        return (await response.json()) as ReviewPayload;
      })
      .then((payload) => {
        if (!cancelled) {
          setReview(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setToast(
            "Mode démonstration : la version reste testable, mais les nouveaux retours peuvent ne pas être conservés.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const visiblePins = useMemo(
    () =>
      review.feedback.filter(
        (item) =>
          item.positionX !== null &&
          item.positionY !== null &&
          item.status !== "resolved",
      ),
    [review.feedback],
  );

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    if (mode !== "comment" || !previewRef.current) {
      return;
    }

    const target = event.target as HTMLElement;

    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest(".review-pin")
    ) {
      return;
    }

    const bounds = previewRef.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;

    setComposer({
      x: Math.min(96, Math.max(4, x)),
      y: Math.min(96, Math.max(4, y)),
      clientX: event.clientX,
      clientY: event.clientY,
    });
    setSelectedFeedback(null);
  }

  function togglePoint(index: number) {
    setCompletedPoints((current) =>
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index],
    );
  }

  function openGeneralFeedback() {
    setMode("comment");
    setComposer({
      x: 50,
      y: 38,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
    });
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!composer || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "feedback",
          ...form,
          authorName: "Claire Dubois",
          pagePath: "/",
          viewport: viewportLabels[viewport],
          positionX: composer.x,
          positionY: composer.y,
        }),
      });

      if (!response.ok) {
        throw new Error("feedback failed");
      }

      const item = (await response.json()) as FeedbackItem;
      setReview((current) => ({
        ...current,
        release: { ...current.release, status: "changes_requested" },
        feedback: [...current.feedback, item],
      }));
      setComposer(null);
      setForm({
        type: "visual",
        priority: "normal",
        title: "",
        body: "",
      });
      setToast("Votre retour a bien été transmis à Raphaël.");
      setPanelTab("feedback");
      setSidePanelOpen(true);
    } catch {
      setToast(
        "Le retour n’a pas encore pu être envoyé. Votre texte reste dans le formulaire.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitDecision(
    status: ReviewDecision["status"],
    note = "",
  ) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decision",
          status,
          note,
          authorName: "Claire Dubois",
        }),
      });

      if (!response.ok) {
        throw new Error("decision failed");
      }

      const decision = (await response.json()) as ReviewDecision;
      setReview((current) => ({
        ...current,
        release: { ...current.release, status },
        decisions: [decision, ...current.decisions],
      }));
      setShowFinishDialog(false);
      setToast(
        status === "approved"
          ? "La version est validée. Raphaël vient d’être informé."
          : "Votre récapitulatif et vos retours ont été envoyés à Raphaël.",
      );
    } catch {
      setToast("La décision n’a pas pu être enregistrée. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="review-page">
      <header className="review-topbar">
        <div className="review-brand">
          <Link href="/" aria-label="Accueil Revaloop">
            <Brand />
          </Link>
          <span className="topbar-divider" />
          <div>
            <strong>{review.project.name}</strong>
            <span>
              Version {review.release.version} ·{" "}
              <i className="online-dot" /> Disponible
            </span>
          </div>
        </div>

        <div className="review-device-switcher" aria-label="Taille de l’écran">
          <button
            className={viewport === "desktop" ? "active" : ""}
            type="button"
            onClick={() => setViewport("desktop")}
            aria-label="Afficher en mode ordinateur"
          >
            ▰
          </button>
          <button
            className={viewport === "tablet" ? "active" : ""}
            type="button"
            onClick={() => setViewport("tablet")}
            aria-label="Afficher en mode tablette"
          >
            ▯
          </button>
          <button
            className={viewport === "mobile" ? "active" : ""}
            type="button"
            onClick={() => setViewport("mobile")}
            aria-label="Afficher en mode mobile"
          >
            ▯
          </button>
          <span>{viewportLabels[viewport]}</span>
        </div>

        <div className="review-top-actions">
          <span className="reviewer">
            <span className="avatar avatar-coral">CD</span>
            <strong>Claire</strong>
          </span>
          <button
            className="button button-primary button-dashboard"
            type="button"
            onClick={() => setShowFinishDialog(true)}
          >
            Terminer le test
            <span aria-hidden="true">✓</span>
          </button>
        </div>
      </header>

      <div className="review-stage">
        <div className="preview-area">
          <div className={`preview-frame preview-${viewport}`}>
            <div
              className={`client-preview ${mode === "comment" ? "is-commenting" : ""}`}
              ref={previewRef}
              onClick={handlePreviewClick}
            >
              <div className="restaurant-page">
                <header className="restaurant-header">
                  <span className="restaurant-logo">MAISON MATISSE</span>
                  <nav aria-label="Navigation de la démonstration">
                    <button type="button">La maison</button>
                    <button type="button">La carte</button>
                    <button type="button">Journal</button>
                  </nav>
                  <button
                    className="restaurant-book"
                    type="button"
                    onClick={() => {
                      setShowReservation(true);
                      setToast("Le parcours de réservation est ouvert.");
                    }}
                  >
                    Réserver
                  </button>
                </header>

                <section className="restaurant-hero">
                  <div className="restaurant-hero-copy">
                    <span>Paris · Rive gauche</span>
                    <h1>
                      Une cuisine vivante,
                      <em> au rythme des saisons.</em>
                    </h1>
                    <p>
                      Une table libre et lumineuse où les produits français
                      rencontrent les souvenirs de voyage du chef.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowReservation(true)}
                    >
                      Réserver une table
                      <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                  <div className="restaurant-visual" aria-label="Assiette végétale">
                    <div className="plate">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <span>Menu du soir · 68€</span>
                  </div>
                </section>

                <section className="restaurant-story">
                  <span className="story-index">01 — LA MAISON</span>
                  <div>
                    <h2>La simplicité, travaillée avec précision.</h2>
                    <p>
                      Du déjeuner au dîner, notre carte change avec les arrivages
                      et laisse toute la place au goût.
                    </p>
                  </div>
                  <div className="story-card">
                    <span>À découvrir</span>
                    <strong>Le menu du marché</strong>
                    <small>Du mardi au vendredi · midi</small>
                  </div>
                </section>

                {showReservation && (
                  <section className="reservation-sheet" aria-label="Réservation">
                    <button
                      className="reservation-close"
                      type="button"
                      onClick={() => setShowReservation(false)}
                      aria-label="Fermer la réservation"
                    >
                      ×
                    </button>
                    <span className="story-index">RÉSERVATION FICTIVE</span>
                    <h2>Votre table</h2>
                    <div className="reservation-options">
                      <button type="button">2 personnes</button>
                      <button type="button">Vendredi 31 juillet</button>
                      <button type="button">20:00</button>
                    </div>
                    <button
                      className="reservation-submit"
                      type="button"
                      onClick={() => {
                        setShowReservation(false);
                        setToast(
                          "Réservation simulée : aucun e-mail ni paiement réel.",
                        );
                      }}
                    >
                      Continuer
                    </button>
                    <p>Aucune réservation réelle ne sera créée.</p>
                  </section>
                )}
              </div>

              {visiblePins.map((item) => (
                <button
                  className={`review-pin ${
                    selectedFeedback?.id === item.id ? "active" : ""
                  }`}
                  key={item.id}
                  type="button"
                  style={{
                    left: `${item.positionX}%`,
                    top: `${item.positionY}%`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedFeedback(item);
                    setComposer(null);
                    setPanelTab("feedback");
                    setSidePanelOpen(true);
                  }}
                  aria-label={`Voir le retour ${item.sequence} : ${item.title}`}
                >
                  {item.sequence}
                </button>
              ))}

              {composer && (
                <span
                  className="review-pin review-pin-draft"
                  style={{ left: `${composer.x}%`, top: `${composer.y}%` }}
                  aria-hidden="true"
                >
                  +
                </span>
              )}

              {mode === "comment" && !composer && (
                <div className="comment-mode-hint">
                  Cliquez à l’endroit que vous souhaitez commenter
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className={`review-sidepanel ${sidePanelOpen ? "open" : ""}`}>
          <button
            className="sidepanel-toggle"
            type="button"
            onClick={() => setSidePanelOpen((value) => !value)}
            aria-label={sidePanelOpen ? "Fermer le panneau" : "Ouvrir le panneau"}
          >
            {sidePanelOpen ? "→" : "←"}
          </button>
          <div className="review-panel-tabs">
            <button
              className={panelTab === "brief" ? "active" : ""}
              type="button"
              onClick={() => setPanelTab("brief")}
            >
              À vérifier
              <span>
                {completedPoints.length}/{testPoints.length}
              </span>
            </button>
            <button
              className={panelTab === "feedback" ? "active" : ""}
              type="button"
              onClick={() => setPanelTab("feedback")}
            >
              Retours
              <span>{review.feedback.length}</span>
            </button>
          </div>

          {panelTab === "brief" ? (
            <div className="brief-panel">
              <div className="brief-intro">
                <span className="avatar avatar-ink">RM</span>
                <div>
                  <span>Message de Raphaël</span>
                  <p>
                    Bonjour Claire, cette version présente le nouveau parcours
                    de réservation. Merci de vous concentrer sur la clarté des
                    textes et l’utilisation sur téléphone.
                  </p>
                </div>
              </div>

              <div className="demo-warning">
                <span>!</span>
                <p>
                  Environnement de test : utilisez uniquement des informations
                  fictives. Les paiements et e-mails sont simulés.
                </p>
              </div>

              <div className="test-points">
                <div className="test-points-heading">
                  <strong>3 points à vérifier</strong>
                  <span>environ 5 min</span>
                </div>
                {testPoints.map((point, index) => {
                  const completed = completedPoints.includes(index);
                  return (
                    <button
                      className={completed ? "completed" : ""}
                      key={point.title}
                      type="button"
                      onClick={() => togglePoint(index)}
                    >
                      <span className="point-check">
                        {completed ? "✓" : index + 1}
                      </span>
                      <span>
                        <strong>{point.title}</strong>
                        <small>{point.text}</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="known-limits">
                <strong>Limites connues</strong>
                <ul>
                  <li>Aucun e-mail réel ne sera envoyé.</li>
                  <li>Le paiement est entièrement simulé.</li>
                  <li>Certaines photographies sont provisoires.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="review-feedback-panel">
              {selectedFeedback ? (
                <div className="client-feedback-detail">
                  <button
                    type="button"
                    onClick={() => setSelectedFeedback(null)}
                    className="back-to-feedback"
                  >
                    ← Tous les retours
                  </button>
                  <span className={`status-badge status-${selectedFeedback.status}`}>
                    {statusLabels[selectedFeedback.status]}
                  </span>
                  <h2>{selectedFeedback.title}</h2>
                  <p>{selectedFeedback.body}</p>
                  <div className="client-detail-meta">
                    <span>
                      <small>Type</small>
                      <strong>{typeLabels[selectedFeedback.type]}</strong>
                    </span>
                    <span>
                      <small>Écran</small>
                      <strong>{selectedFeedback.viewport}</strong>
                    </span>
                  </div>
                  <div className="client-status-note">
                    <span>◎</span>
                    <p>
                      {selectedFeedback.status === "to_review"
                        ? "Raphaël indique que ce point est corrigé. Vous pouvez le vérifier dans la page."
                        : "Raphaël a reçu ce retour avec le contexte de cette version."}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="feedback-panel-heading">
                    <div>
                      <strong>Vos retours</strong>
                      <span>Liés à la version {review.release.version}</span>
                    </div>
                    <button type="button" onClick={openGeneralFeedback}>
                      ＋
                    </button>
                  </div>
                  <div className="client-feedback-list">
                    {review.feedback.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setSelectedFeedback(item)}
                      >
                        <span className="feedback-number">#{item.sequence}</span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {typeLabels[item.type]} · {statusLabels[item.status]}
                          </small>
                        </span>
                        <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="review-toolbar" aria-label="Outils de recette">
        <button
          className={mode === "browse" ? "active" : ""}
          type="button"
          onClick={() => {
            setMode("browse");
            setComposer(null);
          }}
        >
          <span aria-hidden="true">↖</span>
          Parcourir
        </button>
        <button
          className={mode === "comment" ? "active" : ""}
          type="button"
          onClick={() => setMode("comment")}
        >
          <span aria-hidden="true">＋</span>
          Annoter
        </button>
        <span className="toolbar-divider" />
        <button type="button" onClick={openGeneralFeedback}>
          <span aria-hidden="true">◎</span>
          Retour général
        </button>
      </div>

      {composer && (
        <div className="composer-layer" role="presentation">
          <form
            className="feedback-composer"
            onSubmit={submitFeedback}
            style={{
              left: `${Math.min(window.innerWidth - 390, Math.max(18, composer.clientX + 22))}px`,
              top: `${Math.min(window.innerHeight - 480, Math.max(82, composer.clientY - 40))}px`,
            }}
          >
            <div className="composer-heading">
              <div>
                <span className="composer-pin">
                  {review.feedback.length + 1}
                </span>
                <strong>Nouveau retour</strong>
              </div>
              <button
                type="button"
                onClick={() => setComposer(null)}
                aria-label="Fermer le formulaire"
              >
                ×
              </button>
            </div>

            <div className="feedback-type-grid">
              {(
                [
                  ["visual", "Visuel"],
                  ["functional", "Fonctionnel"],
                  ["copy", "Texte"],
                ] as [FeedbackType, string][]
              ).map(([value, label]) => (
                <button
                  className={form.type === value ? "active" : ""}
                  key={value}
                  type="button"
                  onClick={() =>
                    setForm((current) => ({ ...current, type: value }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <label>
              <span>Que souhaitez-vous changer ?</span>
              <input
                type="text"
                value={form.title}
                maxLength={120}
                minLength={3}
                placeholder="Ex. Le bouton manque de contraste"
                autoFocus
                required
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>Précisez votre attente</span>
              <textarea
                value={form.body}
                maxLength={1200}
                minLength={3}
                placeholder="Décrivez ce que vous voyez et ce que vous attendiez…"
                required
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </label>

            <div className="composer-context">
              <span>⌁ Page d’accueil</span>
              <span>▰ {viewportLabels[viewport]}</span>
              <span>◈ Version {review.release.version}</span>
            </div>
            <p className="composer-privacy">
              Aucun mot de passe, contenu saisi ou cookie n’est enregistré.
            </p>
            <button
              className="button button-primary button-full"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Envoi…" : "Envoyer à Raphaël"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </div>
      )}

      {showFinishDialog && (
        <div className="dialog-backdrop">
          <section
            className="finish-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
          >
            <button
              className="dialog-close"
              type="button"
              onClick={() => setShowFinishDialog(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <span className="finish-check">✓</span>
            <p className="eyebrow">Fin du parcours</p>
            <h2 id="finish-title">Quel est votre ressenti général ?</h2>
            <p>
              Vous avez vérifié {completedPoints.length} point
              {completedPoints.length > 1 ? "s" : ""} sur {testPoints.length} et
              envoyé {review.feedback.length} retours.
            </p>
            <div className="finish-actions">
              <button
                className="finish-choice finish-choice-approve"
                type="button"
                disabled={isSubmitting}
                onClick={() => submitDecision("approved")}
              >
                <span>✓</span>
                <div>
                  <strong>Tout me semble bon</strong>
                  <small>Valider cette version</small>
                </div>
              </button>
              <button
                className="finish-choice"
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  submitDecision(
                    "changes_requested",
                    "J’ai terminé mon parcours et envoyé mes retours.",
                  )
                }
              >
                <span>◎</span>
                <div>
                  <strong>J’ai envoyé des retours</strong>
                  <small>Demander des ajustements</small>
                </div>
              </button>
            </div>
            <p className="finish-legal">
              Ce récapitulatif ne remplace pas la recette contractuelle prévue
              avec Raphaël.
            </p>
          </section>
        </div>
      )}

      <div className="review-toast" role="status">
        <span className="online-dot" />
        {toast}
      </div>
    </div>
  );
}
