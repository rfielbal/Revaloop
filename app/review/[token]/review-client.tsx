"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDotDashed,
  ClipboardCheck,
  Link2,
  LogOut,
  Maximize2,
  MessageCirclePlus,
  Minimize2,
  Monitor,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  ScanLine,
  Send,
  ShieldCheck,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Brand } from "../../components/brand";
import {
  formatRelativeDate,
  type FeedbackItem,
  type ReleaseMessage,
  type ReviewDecision,
  type ReviewPayload,
} from "../../../lib/revaloop";
import { ReviewUnavailable } from "./review-unavailable";

type Viewport = "desktop" | "tablet" | "mobile";
type ReviewMode = "browse" | "comment";
type ReviewExperienceMode = "demo" | "live";
type ReviewPanelTab = "brief" | "feedback" | "discussion";

type ComposerPosition = {
  x: number | null;
  y: number | null;
  clientX: number;
  clientY: number;
  general: boolean;
};

const viewportLabels: Record<Viewport, string> = {
  desktop: "Desktop",
  tablet: "Tablette",
  mobile: "Mobile",
};

const viewportDisplayLabels: Record<Viewport, string> = {
  desktop: "Ordinateur",
  tablet: "Tablette",
  mobile: "Téléphone",
};

const reviewPanelTabs = ["brief", "feedback", "discussion"] as const;

const clientStatusLabels: Record<FeedbackItem["status"], string> = {
  open: "Envoyé",
  in_progress: "En cours de correction",
  to_review: "Correction à vérifier",
  resolved: "Correction confirmée",
};

const clientStatusMessages: Record<FeedbackItem["status"], string> = {
  open: "Votre retour a bien été transmis à l’équipe avec le contexte de cette version.",
  in_progress: "L’équipe travaille actuellement sur ce point.",
  to_review: "L’équipe indique que ce point est corrigé. Vérifiez-le dans la page, puis confirmez le résultat.",
  resolved: "Vous avez confirmé que cette correction répond à votre retour.",
};

function normalizePreviewPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value.split(/[?#]/, 1)[0]?.slice(0, 180) || "/";
}

function feedbackMatchesViewport(value: string, viewport: Viewport) {
  const normalized = value.trim().toLocaleLowerCase("fr");

  if (viewport === "desktop") {
    return (
      normalized.startsWith("desktop") ||
      normalized.startsWith("ordinateur")
    );
  }

  if (viewport === "tablet") {
    return (
      normalized.startsWith("tablet") ||
      normalized.startsWith("tablette")
    );
  }

  return (
    normalized.startsWith("mobile") ||
    normalized.startsWith("téléphone") ||
    normalized.startsWith("telephone")
  );
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

export function ReviewClient({
  token,
  initialReview,
  mode: experienceMode = "live",
}: {
  token: string;
  initialReview: ReviewPayload;
  mode?: ReviewExperienceMode;
}) {
  const [review, setReview] = useState(initialReview);
  const [mode, setMode] = useState<ReviewMode>("browse");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<ReviewPanelTab>("brief");
  const [completedPoints, setCompletedPoints] = useState<string[]>(
    initialReview.completedTestItemIds ?? [],
  );
  const [sessionFeedbackCount, setSessionFeedbackCount] = useState(0);
  const [composer, setComposer] = useState<ComposerPosition | null>(null);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(
    null,
  );
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [showReservation, setShowReservation] = useState(false);
  const [previewHelpVisible, setPreviewHelpVisible] = useState(false);
  const [previewUpdateAvailable, setPreviewUpdateAvailable] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [accessError, setAccessError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [form, setForm] = useState({
    title: "",
    body: "",
  });
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const nativeFullscreenActiveRef = useRef(false);
  const finishButtonRef = useRef<HTMLButtonElement>(null);
  const composerTriggerRef = useRef<HTMLElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const loadedPreviewRevisionRef = useRef(
    initialReview.release.previewRevision ?? 0,
  );
  const reviewMutationVersionRef = useRef(0);
  const activeReviewMutationsRef = useRef(0);
  const testPoints = review.testItems ?? [];
  const messages = review.messages ?? [];
  const selectedFeedback =
    review.feedback.find((item) => item.id === selectedFeedbackId) ?? null;
  const currentDecision = review.decisions[0] ?? null;
  const isReviewApproved =
    currentDecision?.status === "approved" ||
    review.release.status === "approved";
  const isReviewClosed =
    isReviewApproved || review.release.status === "superseded";
  const latestExternalPreviewUrl =
    review.release.previewKind === "external"
      ? review.release.previewUrl
      : undefined;
  const [loadedExternalPreviewUrl, setLoadedExternalPreviewUrl] = useState(
    () =>
      initialReview.release.previewKind === "external"
        ? initialReview.release.previewUrl
        : undefined,
  );
  const [previewContext, setPreviewContext] = useState(() => {
    if (!loadedExternalPreviewUrl) {
      return { path: "/", title: "Page d’accueil" };
    }

    const url = new URL(loadedExternalPreviewUrl);
    return {
      path: url.pathname,
      title: url.hostname,
    };
  });

  function beginReviewMutation() {
    let finished = false;
    activeReviewMutationsRef.current += 1;
    reviewMutationVersionRef.current += 1;

    return () => {
      if (finished) return;
      finished = true;
      activeReviewMutationsRef.current = Math.max(
        0,
        activeReviewMutationsRef.current - 1,
      );
      reviewMutationVersionRef.current += 1;
    };
  }

  useEffect(() => {
    if (experienceMode === "demo") {
      return;
    }

    let cancelled = false;

    const refresh = () => {
      const mutationVersion = reviewMutationVersionRef.current;

      return fetch(`/api/review/${encodeURIComponent(token)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            const error = new Error(
              payload?.error ?? "Cet espace de test est indisponible.",
            );
            if (response.status === 410) {
              error.name = "ExpiredReview";
            } else if ([401, 403, 404].includes(response.status)) {
              error.name = "MissingReview";
            } else {
              error.name = "TemporaryReview";
            }
            throw error;
          }
          return (await response.json()) as ReviewPayload;
        })
        .then((payload) => {
          if (
            !cancelled &&
            mutationVersion === reviewMutationVersionRef.current &&
            activeReviewMutationsRef.current === 0
          ) {
            if (
              (payload.release.previewRevision ?? 0) >
              loadedPreviewRevisionRef.current
            ) {
              setPreviewUpdateAvailable(true);
            }
            setReview(payload);
            setAccessError(null);
          }
        })
        .catch((error: Error) => {
          if (
            !cancelled &&
            mutationVersion === reviewMutationVersionRef.current &&
            activeReviewMutationsRef.current === 0
          ) {
            if (error.name === "TemporaryReview") {
              setToast(
                "Connexion momentanément interrompue. Votre espace reste ouvert et une nouvelle tentative est en cours.",
              );
              return;
            }

            setAccessError({
              title:
                error.name === "ExpiredReview"
                  ? "Ce lien a expiré"
                  : "Cette version n’est pas disponible",
              message: error.message,
            });
          }
        });
    };

    refresh();
    const interval = window.setInterval(refresh, 5_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [experienceMode, token]);

  function reloadUpdatedPreview() {
    setLoadedExternalPreviewUrl(latestExternalPreviewUrl);
    if (latestExternalPreviewUrl) {
      const nextPreview = new URL(latestExternalPreviewUrl);
      setPreviewContext({
        path: nextPreview.pathname,
        title: nextPreview.hostname,
      });
    }
    loadedPreviewRevisionRef.current = review.release.previewRevision ?? 0;
    setPreviewReloadKey((key) => key + 1);
    setPreviewUpdateAvailable(false);
    setPreviewHelpVisible(false);
    setToast(
      "Le rechargement de la preview a été demandé. Son cache reste géré par le site de test.",
    );
  }

  useEffect(() => {
    if (!loadedExternalPreviewUrl) {
      return;
    }

    const previewUrl = new URL(loadedExternalPreviewUrl);
    const previewOrigin = previewUrl.origin;
    const previewHostname = previewUrl.hostname;

    function receivePreviewContext(event: MessageEvent) {
      if (
        event.origin !== previewOrigin ||
        event.source !== iframeRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object" ||
        event.data.type !== "revaloop:context"
      ) {
        return;
      }

      const path =
        typeof event.data.path === "string"
          ? normalizePreviewPath(event.data.path)
          : "/";
      const title =
        typeof event.data.title === "string"
          ? event.data.title.slice(0, 160)
          : previewHostname;

      if (!path.startsWith("/") || path.startsWith("//")) {
        return;
      }

      setPreviewContext({ path, title });
      setPreviewHelpVisible(false);
    }

    window.addEventListener("message", receivePreviewContext);
    return () => window.removeEventListener("message", receivePreviewContext);
  }, [loadedExternalPreviewUrl]);

  useEffect(() => {
    if (!loadedExternalPreviewUrl) {
      return;
    }

    const timeout = window.setTimeout(() => setPreviewHelpVisible(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [loadedExternalPreviewUrl]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 720px)").matches) {
        setSidePanelOpen(false);
        setViewport("mobile");
      } else if (window.matchMedia("(max-width: 1020px)").matches) {
        setViewport("tablet");
      }

      const focus = new URLSearchParams(window.location.search).get("focus");
      if (!focus) {
        return;
      }

      const focusedFeedback = review.feedback.find(
        (item) => String(item.sequence) === focus,
      );
      if (focusedFeedback) {
        setSelectedFeedbackId(focusedFeedback.id);
        setPanelTab("feedback");
        setSidePanelOpen(true);
        setViewport(
          focusedFeedback.viewport.toLowerCase().startsWith("mobile")
            ? "mobile"
            : focusedFeedback.viewport.toLowerCase().startsWith("tablette")
              ? "tablet"
              : "desktop",
        );
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [review.feedback]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function handleFullscreenChange() {
      const active = document.fullscreenElement === pageRef.current;

      if (active) {
        nativeFullscreenActiveRef.current = true;
        setIsPreviewExpanded(true);
        return;
      }

      if (nativeFullscreenActiveRef.current) {
        nativeFullscreenActiveRef.current = false;
        setIsPreviewExpanded(false);
        window.requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (showFinishDialog) {
        setShowFinishDialog(false);
        finishButtonRef.current?.focus();
      } else if (composer) {
        setComposer(null);
        window.requestAnimationFrame(() => composerTriggerRef.current?.focus());
      } else if (showReservation) {
        setShowReservation(false);
      } else if (isPreviewExpanded) {
        if (document.fullscreenElement === pageRef.current) {
          void document.exitFullscreen();
        } else {
          setIsPreviewExpanded(false);
          window.requestAnimationFrame(() =>
            fullscreenButtonRef.current?.focus(),
          );
        }
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [composer, isPreviewExpanded, showFinishDialog, showReservation]);

  const visiblePins = useMemo(
    () =>
      review.feedback.filter(
        (item) =>
          item.positionX !== null &&
          item.positionY !== null &&
          item.status !== "resolved" &&
          normalizePreviewPath(item.pagePath) ===
            normalizePreviewPath(previewContext.path) &&
          feedbackMatchesViewport(item.viewport, viewport),
      ),
    [previewContext.path, review.feedback, viewport],
  );

  const unresolvedFeedback = useMemo(
    () => review.feedback.filter((item) => item.status !== "resolved"),
    [review.feedback],
  );

  function handlePreviewClick(event: MouseEvent<HTMLElement>) {
    if (mode !== "comment" || !previewRef.current) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest(".review-pin")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const bounds = previewRef.current.getBoundingClientRect();
    const x =
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
    const y =
      ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;

    composerTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setComposer({
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
      clientX: event.clientX,
      clientY: event.clientY,
      general: false,
    });
    setSelectedFeedbackId(null);
  }

  function openCenteredAnnotation() {
    composerTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setComposer({
      x: 50,
      y: 50,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      general: false,
    });
    setSelectedFeedbackId(null);
  }

  async function togglePoint(testItemId: string) {
    const completed = !completedPoints.includes(testItemId);
    setCompletedPoints((current) =>
      completed
        ? [...current, testItemId]
        : current.filter((value) => value !== testItemId),
    );

    if (experienceMode === "demo") {
      return;
    }

    const finishReviewMutation = beginReviewMutation();

    try {
      const response = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_item",
          testItemId,
          completed,
        }),
      });

      if (!response.ok) {
        throw new Error("completion failed");
      }
    } catch {
      setCompletedPoints((current) =>
        completed
          ? current.filter((value) => value !== testItemId)
          : [...current, testItemId],
      );
      setToast("Ce point n’a pas pu être enregistré. Réessayez.");
    } finally {
      finishReviewMutation();
    }
  }

  function openReservation() {
    setComposer(null);
    setMode("browse");
    setShowFinishDialog(false);
    setShowReservation(true);
    setToast("Le parcours de réservation est ouvert.");
  }

  function openGeneralFeedback() {
    composerTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setShowReservation(false);
    setShowFinishDialog(false);
    setMode("browse");
    setComposer({
      x: null,
      y: null,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      general: true,
    });
  }

  async function togglePreviewExpansion() {
    setComposer(null);
    setShowReservation(false);

    if (isPreviewExpanded) {
      setIsPreviewExpanded(false);
      if (document.fullscreenElement === pageRef.current) {
        await document.exitFullscreen().catch(() => undefined);
      }
      window.requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
      return;
    }

    setIsPreviewExpanded(true);
    setSidePanelOpen(false);

    if (!pageRef.current?.requestFullscreen) {
      setToast(
        "L’aperçu est agrandi dans la fenêtre. Le plein écran natif n’est pas disponible dans ce navigateur.",
      );
      return;
    }

    try {
      await pageRef.current.requestFullscreen();
    } catch {
      setToast(
        "L’aperçu est agrandi dans la fenêtre. Le navigateur a refusé le plein écran natif.",
      );
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!composer || isSubmitting) {
      return;
    }

    const finishReviewMutation =
      experienceMode === "live" ? beginReviewMutation() : () => undefined;
    setIsSubmitting(true);

    try {
      const frameBounds =
        iframeRef.current?.getBoundingClientRect() ??
        previewRef.current?.getBoundingClientRect();
      const frameContext = frameBounds
        ? `cadre ${Math.round(frameBounds.width)} × ${Math.round(frameBounds.height)}`
        : "cadre adaptatif";
      const pagePath = normalizePreviewPath(previewContext.path);

      if (experienceMode === "demo") {
        const now = new Date().toISOString();
        const item: FeedbackItem = {
          id: `demo_${crypto.randomUUID()}`,
          releaseId: review.release.id,
          authorRole: "reviewer",
          sequence:
            Math.max(0, ...review.feedback.map((feedback) => feedback.sequence)) +
            1,
          type: "visual",
          title: form.title.trim(),
          body: form.body.trim(),
          status: "open",
          priority: "normal",
          pagePath,
          pageTitle: previewContext.title,
          viewport: `${viewportDisplayLabels[viewport]} · ${frameContext}`,
          positionX: composer.x,
          positionY: composer.y,
          authorName: review.reviewerName ?? "Client",
          createdAt: now,
          updatedAt: now,
        };
        setReview((current) => ({
          ...current,
          feedback: [...current.feedback, item],
        }));
        completeFeedbackSubmission(item.id);
        return;
      }

      const response = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "feedback",
          title: form.title,
          body: form.body,
          pagePath,
          pageTitle: previewContext.title,
          viewport: `${viewportLabels[viewport]} · ${frameContext} · fenêtre ${window.innerWidth} × ${window.innerHeight}`,
          positionX: composer.x,
          positionY: composer.y,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? "Le retour n’a pas pu être enregistré.",
        );
      }

      const item = (await response.json()) as FeedbackItem;
      setReview((current) => ({
        ...current,
        feedback: [...current.feedback, item],
      }));
      completeFeedbackSubmission(item.id);
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Le retour n’a pas encore pu être envoyé. Votre texte reste dans le formulaire.",
      );
    } finally {
      finishReviewMutation();
      setIsSubmitting(false);
    }
  }

  function completeFeedbackSubmission(feedbackId: string) {
    setComposer(null);
    window.requestAnimationFrame(() => composerTriggerRef.current?.focus());
    setSessionFeedbackCount((count) => count + 1);
    setForm({
      title: "",
      body: "",
    });
    setSelectedFeedbackId(feedbackId);
    setToast(
      experienceMode === "demo"
        ? "Retour ajouté à la démonstration. Il disparaîtra au rechargement."
        : "Votre retour est enregistré dans cet espace de test.",
    );
    setPanelTab("feedback");
    setSidePanelOpen(true);
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = messageBody.trim();
    if (!body || isSubmitting || isReviewClosed) {
      return;
    }

    const finishReviewMutation =
      experienceMode === "live" ? beginReviewMutation() : () => undefined;
    setIsSubmitting(true);
    try {
      if (experienceMode === "demo") {
        const message: ReleaseMessage = {
          id: `demo_message_${crypto.randomUUID()}`,
          releaseId: review.release.id,
          authorRole: "reviewer",
          authorName: review.reviewerName ?? "Client",
          body,
          createdAt: new Date().toISOString(),
        };
        setReview((current) => ({
          ...current,
          messages: [...(current.messages ?? []), message],
        }));
      } else {
        const response = await fetch(
          `/api/review/${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "message", body }),
          },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            payload?.error ?? "Le message n’a pas pu être envoyé.",
          );
        }

        const message = (await response.json()) as ReleaseMessage;
        setReview((current) => ({
          ...current,
          messages: [...(current.messages ?? []), message],
        }));
      }

      setMessageBody("");
      setToast(
        experienceMode === "demo"
          ? "Message ajouté à la démonstration."
          : "Message envoyé à l’équipe.",
      );
      window.requestAnimationFrame(() => messageInputRef.current?.focus());
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Le message n’a pas pu être envoyé. Votre texte est conservé.",
      );
    } finally {
      finishReviewMutation();
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

    const finishReviewMutation =
      experienceMode === "live" ? beginReviewMutation() : () => undefined;
    setIsSubmitting(true);
    try {
      if (experienceMode === "demo") {
        const decision: ReviewDecision = {
          id: `demo_decision_${crypto.randomUUID()}`,
          releaseId: review.release.id,
          status,
          authorName: review.reviewerName ?? "Client",
          note,
          createdAt: new Date().toISOString(),
        };
        setReview((current) => ({
          ...current,
          release: { ...current.release, status },
          decisions: [decision],
        }));
        setShowFinishDialog(false);
        setToast("Décision simulée dans cette démonstration.");
        return;
      }

      const response = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decision",
          status,
          note,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "La décision n’a pas été enregistrée.");
      }

      const decision = (await response.json()) as ReviewDecision;
      setReview((current) => ({
        ...current,
        release: { ...current.release, status },
        decisions: [decision],
      }));
      setShowFinishDialog(false);
      window.requestAnimationFrame(() => finishButtonRef.current?.focus());
      setToast(
        `Bilan transmis · Version ${review.release.version} · le développeur a reçu votre décision.`,
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "La décision n’a pas pu être enregistrée. Réessayez.",
      );
    } finally {
      finishReviewMutation();
      setIsSubmitting(false);
    }
  }

  async function updateClientFeedbackStatus(
    item: FeedbackItem,
    status: "resolved" | "open",
  ) {
    if (isSubmitting) {
      return;
    }

    const finishReviewMutation =
      experienceMode === "live" ? beginReviewMutation() : () => undefined;
    setIsSubmitting(true);
    try {
      if (experienceMode === "demo") {
        const updated = {
          ...item,
          status,
          updatedAt: new Date().toISOString(),
        };
        setReview((current) => ({
          ...current,
          feedback: current.feedback.map((feedback) =>
            feedback.id === updated.id ? updated : feedback,
          ),
        }));
        setToast(
          status === "resolved"
            ? "Vous avez confirmé que ce point est corrigé."
            : "Le point est rouvert dans cette démonstration.",
        );
        return;
      }

      const response = await fetch(
        `/api/review/${encodeURIComponent(token)}/feedback/${encodeURIComponent(item.id)}`,
        {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      if (!response.ok) {
        throw new Error("Le statut n’a pas pu être enregistré.");
      }

      const updated = (await response.json()) as FeedbackItem;
      setReview((current) => ({
        ...current,
        feedback: current.feedback.map((feedback) =>
          feedback.id === updated.id ? updated : feedback,
        ),
      }));
      setToast(
        status === "resolved"
          ? "Vous avez confirmé que ce point est corrigé."
          : "Le point est rouvert pour le développeur.",
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "La mise à jour a échoué. Réessayez.",
      );
    } finally {
      finishReviewMutation();
      setIsSubmitting(false);
    }
  }

  async function closeReviewerSession() {
    if (experienceMode !== "live" || isSubmitting) {
      return;
    }

    if (!window.confirm("Fermer cet espace de test sur cet appareil ?")) {
      return;
    }

    const finishReviewMutation = beginReviewMutation();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/reviewer/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: token }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ??
            "La session n’a pas pu être fermée. Réessayez avant de quitter.",
        );
      }

      finishReviewMutation();
      window.location.replace("/");
    } catch (error) {
      finishReviewMutation();
      setToast(
        error instanceof Error
          ? error.message
          : "La session n’a pas pu être fermée.",
      );
      setIsSubmitting(false);
    }
  }

  const composerStyle = composer
    ? (() => {
        const margin = window.innerWidth <= 760 ? 10 : 18;
        const targetHeight = Math.min(650, window.innerHeight - margin * 2);
        const top = Math.max(
          margin,
          Math.min(
            window.innerHeight - targetHeight - margin,
            Math.max(82, composer.clientY - 40),
          ),
        );

        return {
          left: Math.max(
            margin,
            Math.min(
              window.innerWidth - 420 - margin,
              composer.clientX + 22,
            ),
          ),
          top,
          maxHeight: window.innerHeight - top - margin,
        };
      })()
    : undefined;

  if (accessError) {
    return (
      <ReviewUnavailable
        title={accessError.title}
        message={accessError.message}
      />
    );
  }

  return (
    <main
      ref={pageRef}
      className={`review-page review-flow ${
        isPreviewExpanded ? "is-preview-expanded" : ""
      }`}
    >
      <header
        className="review-topbar"
        inert={composer || showFinishDialog ? true : undefined}
        aria-hidden={composer || showFinishDialog ? true : undefined}
      >
        <div className="review-brand">
          <Link href="/" aria-label="Accueil Revaloop">
            <Brand />
          </Link>
          <span className="topbar-divider" />
          <div>
            <strong>{review.project.name}</strong>
            <span>Version {review.release.version}</span>
          </div>
        </div>

        <div className="review-measure">
          <span className="review-measure-label">
            <ScanLine aria-hidden="true" />
            Format de l’aperçu
          </span>
          <div
            className="review-device-switcher"
            role="group"
            aria-label="Taille de l’écran"
          >
            <button
              className={viewport === "desktop" ? "active" : ""}
              type="button"
              aria-pressed={viewport === "desktop"}
              onClick={() => setViewport("desktop")}
              aria-label="Afficher en mode ordinateur"
            >
              <Monitor aria-hidden="true" />
            </button>
            <button
              className={viewport === "tablet" ? "active" : ""}
              type="button"
              aria-pressed={viewport === "tablet"}
              onClick={() => setViewport("tablet")}
              aria-label="Afficher en mode tablette"
            >
              <Tablet aria-hidden="true" />
            </button>
            <button
              className={viewport === "mobile" ? "active" : ""}
              type="button"
              aria-pressed={viewport === "mobile"}
              onClick={() => setViewport("mobile")}
              aria-label="Afficher en mode mobile"
            >
              <Smartphone aria-hidden="true" />
            </button>
            <span>{viewportDisplayLabels[viewport]}</span>
          </div>
        </div>

        <div className="review-top-actions">
          <button
            ref={finishButtonRef}
            className="button button-primary button-dashboard"
            type="button"
            disabled={isReviewClosed}
            onClick={() => {
              setComposer(null);
              setShowReservation(false);
              setShowFinishDialog(true);
            }}
          >
            <span className="review-finish-label">Envoyer mon bilan</span>
            <Check aria-hidden="true" />
          </button>
          {experienceMode === "live" ? (
            <button
              className="review-session-close"
              type="button"
              disabled={isSubmitting}
              onClick={closeReviewerSession}
              aria-label="Fermer cet espace de test"
              title="Fermer la session sur cet appareil"
            >
              <LogOut aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      {currentDecision ? (
        <section className="review-closed-banner" role="status">
          <span>
            {isReviewApproved ? (
              <Check aria-hidden="true" />
            ) : (
              <MessageCirclePlus aria-hidden="true" />
            )}
          </span>
          <div>
            <strong>
              {isReviewApproved
                ? "Version approuvée"
                : "Ajustements transmis · test toujours ouvert"}
            </strong>
            <small>
              Session invitée au nom de {currentDecision.authorName} · identité
              non vérifiée · {formatRelativeDate(currentDecision.createdAt)}
            </small>
          </div>
        </section>
      ) : null}

      {previewUpdateAvailable ? (
        <section className="preview-update-banner" role="status">
          <span>
            <RefreshCw aria-hidden="true" />
          </span>
          <div>
            <strong>Des correctifs sont disponibles.</strong>
            <small>
              Demandez son rechargement sans perdre vos retours. Le site testé
              reste responsable de son propre cache.
            </small>
          </div>
          <button type="button" onClick={reloadUpdatedPreview}>
            Voir la mise à jour
            <RefreshCw aria-hidden="true" />
          </button>
        </section>
      ) : null}

      <div
        className="review-stage"
        inert={composer || showFinishDialog ? true : undefined}
        aria-hidden={composer || showFinishDialog ? true : undefined}
      >
        <div className="preview-area">
          {loadedExternalPreviewUrl ? (
            <div className="external-preview-bar">
              <span>
                <ShieldCheck aria-hidden="true" />
                Site de test externe · cette page peut évoluer
              </span>
              <a
                href={loadedExternalPreviewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir dans un nouvel onglet
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          ) : null}
          <div
            className={`preview-frame preview-${viewport} ${
              mode === "comment" ? "is-commenting" : ""
            }`}
          >
            <div
              className={`client-preview ${mode === "comment" ? "is-commenting" : ""}`}
              ref={previewRef}
              onClickCapture={handlePreviewClick}
            >
              {loadedExternalPreviewUrl ? (
                <>
                  <iframe
                    key={previewReloadKey}
                    ref={iframeRef}
                    className="external-preview-frame"
                    src={loadedExternalPreviewUrl}
                    title={`Preview ${review.project.name}`}
                    sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                    referrerPolicy="no-referrer"
                  />
                  {previewHelpVisible ? (
                    <aside className="external-preview-help" role="status">
                      <button
                        type="button"
                        aria-label="Masquer cette aide"
                        onClick={() => setPreviewHelpVisible(false)}
                      >
                        <X aria-hidden="true" />
                      </button>
                      <strong>La page n’est pas confirmée.</strong>
                      <span>
                        Si le cadre reste vide ou si une connexion est requise,
                        poursuivez dans un nouvel onglet puis utilisez « Retour
                        général ».
                      </span>
                      <a
                        href={loadedExternalPreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ouvrir le site de test
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                    </aside>
                  ) : null}
                  {mode === "comment" ? (
                    <button
                      className="external-annotation-capture"
                      type="button"
                      onClick={(event) => {
                        if (event.detail === 0) {
                          openCenteredAnnotation();
                        } else {
                          handlePreviewClick(event);
                        }
                      }}
                      aria-label="Placer une annotation sur le site de test. Au clavier, le repère est placé au centre."
                    />
                  ) : null}
                </>
              ) : (
                <div className="restaurant-page">
                <header className="restaurant-header">
                  <span className="restaurant-logo">MAISON MATISSE</span>
                  <nav aria-label="Navigation de la démonstration">
                    <button
                      type="button"
                      disabled
                      title="Une seule page est simulée dans la démonstration intégrée"
                    >
                      La maison
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Une seule page est simulée dans la démonstration intégrée"
                    >
                      La carte
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Une seule page est simulée dans la démonstration intégrée"
                    >
                      Journal
                    </button>
                  </nav>
                  <button
                    className="restaurant-book"
                    type="button"
                    onClick={openReservation}
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
                      onClick={openReservation}
                    >
                      Réserver une table
                      <ArrowUpRight aria-hidden="true" />
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
                  <section
                    className="reservation-sheet"
                    role="region"
                    aria-labelledby="reservation-title"
                  >
                    <button
                      className="reservation-close"
                      type="button"
                      onClick={() => setShowReservation(false)}
                      aria-label="Fermer la réservation"
                    >
                      <X aria-hidden="true" />
                    </button>
                    <span className="story-index">RÉSERVATION FICTIVE</span>
                    <h2 id="reservation-title">Votre table</h2>
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
              )}

              {visiblePins.map((item) => (
                <button
                  className={`review-pin review-pin-${item.authorRole} ${
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
                    setSelectedFeedbackId(item.id);
                    setComposer(null);
                    setPanelTab("feedback");
                    setSidePanelOpen(true);
                  }}
                  aria-label={`Voir le retour ${item.sequence} ${
                    item.authorRole === "developer"
                      ? "du développeur"
                      : "de votre part"
                  } : ${item.title}`}
                >
                  <span aria-hidden="true">{item.sequence}</span>
                </button>
              ))}

              {composer && composer.x !== null && composer.y !== null && (
                <span
                  className="review-pin review-pin-draft"
                  style={{ left: `${composer.x}%`, top: `${composer.y}%` }}
                  aria-hidden="true"
              >
                  <Plus aria-hidden="true" />
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
          <div className="review-notebook-header">
            <span>Espace de revue</span>
            <strong>Votre espace de test</strong>
            <small>Explorez librement, puis partagez ce qui compte.</small>
          </div>
          <button
            className="sidepanel-toggle"
            type="button"
            onClick={() => setSidePanelOpen((value) => !value)}
            aria-label={sidePanelOpen ? "Fermer le panneau" : "Ouvrir le panneau"}
            aria-expanded={sidePanelOpen}
          >
            {sidePanelOpen ? (
              <PanelRightClose aria-hidden="true" />
            ) : (
              <PanelRightOpen aria-hidden="true" />
            )}
            <span className="sidepanel-toggle-label">
              {sidePanelOpen ? "Masquer le guide" : "Ouvrir le guide"}
            </span>
          </button>
          <div
            className="review-panel-tabs"
            role="tablist"
            aria-label="Contenu de la revue"
            inert={!sidePanelOpen ? true : undefined}
            aria-hidden={!sidePanelOpen ? true : undefined}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowLeft" &&
                event.key !== "ArrowRight" &&
                event.key !== "Home" &&
                event.key !== "End"
              ) {
                return;
              }

              event.preventDefault();
              const currentIndex = reviewPanelTabs.indexOf(panelTab);
              const nextTab: ReviewPanelTab =
                event.key === "Home"
                  ? "brief"
                  : event.key === "End"
                    ? "discussion"
                    : (reviewPanelTabs[
                        (currentIndex +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            reviewPanelTabs.length) %
                          reviewPanelTabs.length
                      ] ?? "brief");
              setPanelTab(nextTab);
              window.requestAnimationFrame(() =>
                document.getElementById(`review-tab-${nextTab}`)?.focus(),
              );
            }}
          >
            <button
              id="review-tab-brief"
              className={panelTab === "brief" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={panelTab === "brief"}
              aria-controls="review-panel-brief"
              tabIndex={panelTab === "brief" ? 0 : -1}
              onClick={() => setPanelTab("brief")}
            >
              Explorer
            </button>
            <button
              id="review-tab-feedback"
              className={panelTab === "feedback" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={panelTab === "feedback"}
              aria-controls="review-panel-feedback"
              tabIndex={panelTab === "feedback" ? 0 : -1}
              onClick={() => setPanelTab("feedback")}
            >
              Retours
            </button>
            <button
              id="review-tab-discussion"
              className={panelTab === "discussion" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={panelTab === "discussion"}
              aria-controls="review-panel-discussion"
              tabIndex={panelTab === "discussion" ? 0 : -1}
              onClick={() => setPanelTab("discussion")}
            >
              Discussion
            </button>
          </div>

          {panelTab === "brief" ? (
            <div
              id="review-panel-brief"
              className="brief-panel"
              role="tabpanel"
              aria-labelledby="review-tab-brief"
              inert={!sidePanelOpen ? true : undefined}
              aria-hidden={!sidePanelOpen ? true : undefined}
            >
              <div className="brief-intro">
                <span className="avatar avatar-ink" aria-hidden="true">
                  <MessageCirclePlus />
                </span>
                <div>
                  <span>Message du développeur</span>
                  <p>
                    {review.release.reviewerMessage ||
                      "Explorez cette version librement, puis indiquez directement ce qui mérite un ajustement."}
                  </p>
                </div>
              </div>

              <div className="free-explore">
                <MousePointer2 aria-hidden="true" />
                <div>
                  <strong>Commencez par utiliser le site naturellement.</strong>
                  <p>
                    Cliquez, naviguez et essayez vos scénarios habituels.
                    Ajoutez un retour dès qu’un détail vous gêne ou vous
                    surprend.
                  </p>
                </div>
              </div>

              <div className="demo-warning">
                <span>!</span>
                <p>
                  Environnement de test : utilisez uniquement des informations
                  fictives. Ne saisissez aucun mot de passe ou moyen de
                  paiement réel.
                </p>
              </div>

              {testPoints.length > 0 ? (
                <details className="test-points">
                  <summary className="test-points-heading">
                    <strong>Repères facultatifs</strong>
                    <span>Une aide, jamais une obligation</span>
                  </summary>
                  {testPoints.map((point) => {
                    const completed = completedPoints.includes(point.id);
                    return (
                      <button
                        className={completed ? "completed" : ""}
                        key={point.id}
                        type="button"
                        disabled={isReviewClosed || isSubmitting}
                        aria-pressed={completed}
                        onClick={() => togglePoint(point.id)}
                      >
                        <span className="point-check">
                          {completed ? <Check aria-hidden="true" /> : null}
                        </span>
                        <span>
                          <strong>{point.title}</strong>
                          <small>{point.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </details>
              ) : null}

              <div className="known-limits">
                <strong>Limites connues</strong>
                <ul>
                  {loadedExternalPreviewUrl ? (
                    <>
                      <li>Le site externe peut évoluer pendant le test.</li>
                      <li>
                        Certains sites refusent l’affichage dans une iframe.
                      </li>
                      <li>
                        Ouvrez le site dans un nouvel onglet si nécessaire.
                      </li>
                      <li>
                        Revaloop ne protège pas l’URL de staging elle-même :
                        sécurisez-la séparément et n’y placez aucune donnée
                        sensible.
                      </li>
                      <li>
                        Connexion, téléchargement, paiement, caméra ou OAuth
                        peuvent exiger le nouvel onglet.
                      </li>
                    </>
                  ) : (
                    <>
                      <li>Aucun e-mail réel ne sera envoyé.</li>
                      <li>Le paiement est entièrement simulé.</li>
                      <li>Certaines photographies sont provisoires.</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          ) : null}

          {panelTab === "feedback" ? (
            <div
              id="review-panel-feedback"
              className="review-feedback-panel"
              role="tabpanel"
              aria-labelledby="review-tab-feedback"
              inert={!sidePanelOpen ? true : undefined}
              aria-hidden={!sidePanelOpen ? true : undefined}
            >
              {selectedFeedback ? (
                <div className="client-feedback-detail">
                  <button
                    type="button"
                    onClick={() => setSelectedFeedbackId(null)}
                    className="back-to-feedback"
                  >
                    <ArrowLeft aria-hidden="true" />
                    Tous les retours
                  </button>
                  <span className={`status-badge status-${selectedFeedback.status}`}>
                    {clientStatusLabels[selectedFeedback.status]}
                  </span>
                  <h2>{selectedFeedback.title}</h2>
                  <p>{selectedFeedback.body}</p>
                  <div className="client-detail-meta">
                    <span>
                      <small>Écran</small>
                      <strong>{selectedFeedback.viewport}</strong>
                    </span>
                  </div>
                  <div className="client-status-note">
                    <CircleDotDashed aria-hidden="true" />
                    <p>{clientStatusMessages[selectedFeedback.status]}</p>
                  </div>
                  {selectedFeedback.status === "to_review" && (
                    <div className="client-review-actions">
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                        onClick={() =>
                          updateClientFeedbackStatus(
                            selectedFeedback,
                            "resolved",
                          )
                        }
                      >
                        Oui, c’est corrigé
                      </button>
                      <button
                        className="button button-ghost"
                        type="button"
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                        onClick={() =>
                          updateClientFeedbackStatus(selectedFeedback, "open")
                        }
                      >
                        Le problème persiste
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="feedback-panel-heading">
                    <div>
                      <strong>Retours du test</strong>
                      <span>Historique partagé avec l’équipe</span>
                    </div>
                    <button
                      type="button"
                      disabled={isReviewClosed}
                      onClick={openGeneralFeedback}
                      aria-label="Ajouter un retour général"
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </div>
                  <div className="client-feedback-list">
                    {review.feedback.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setSelectedFeedbackId(item.id)}
                      >
                        <span>
                          <strong>{item.title}</strong>
                          <small>{clientStatusLabels[item.status]}</small>
                        </span>
                        <ArrowRight aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {panelTab === "discussion" ? (
            <div
              id="review-panel-discussion"
              className="review-discussion-panel"
              role="tabpanel"
              aria-labelledby="review-tab-discussion"
              inert={!sidePanelOpen ? true : undefined}
              aria-hidden={!sidePanelOpen ? true : undefined}
            >
              <div className="discussion-heading">
                <strong>Discussion</strong>
                <p>
                  Un fil simple pour préciser un retour sans créer une nouvelle
                  annotation.
                </p>
              </div>

              <ol className="discussion-thread" aria-live="polite">
                {messages.length > 0 ? (
                  messages.map((message) => (
                    <li
                      className={`discussion-message is-${message.authorRole}`}
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
                  <li className="discussion-empty">
                    <MessageCirclePlus aria-hidden="true" />
                    <strong>La discussion est prête.</strong>
                    <p>
                      Posez une question ou précisez une attente ; l’équipe
                      répondra ici.
                    </p>
                  </li>
                )}
              </ol>

              {isReviewClosed ? (
                <p className="discussion-closed">
                  Cette version est clôturée : la discussion reste consultable.
                </p>
              ) : (
                <form
                  className="discussion-composer"
                  onSubmit={submitMessage}
                >
                  <label htmlFor="review-message">Votre message</label>
                  <div>
                    <textarea
                      id="review-message"
                      ref={messageInputRef}
                      value={messageBody}
                      maxLength={2_000}
                      placeholder="Écrire à l’équipe…"
                      required
                      onChange={(event) => setMessageBody(event.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !messageBody.trim()}
                      aria-busy={isSubmitting}
                      aria-label="Envoyer le message"
                    >
                      <Send aria-hidden="true" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </aside>
      </div>

      <div
        className="review-toolbar"
        role="toolbar"
        aria-label="Outils de test"
        inert={composer || showFinishDialog ? true : undefined}
        aria-hidden={composer || showFinishDialog ? true : undefined}
      >
        <button
          className={mode === "comment" ? "active" : ""}
          type="button"
          disabled={isReviewClosed}
          aria-pressed={mode === "comment"}
          onClick={() => {
            setComposer(null);
            setShowReservation(false);
            setMode((current) =>
              current === "comment" ? "browse" : "comment",
            );
          }}
        >
          {mode === "comment" ? (
            <MousePointer2 aria-hidden="true" />
          ) : (
            <MessageCirclePlus aria-hidden="true" />
          )}
          {mode === "comment" ? "Quitter l’annotation" : "Ajouter un retour"}
        </button>
        <button
          type="button"
          disabled={isReviewClosed}
          onClick={openGeneralFeedback}
        >
          <CircleDotDashed aria-hidden="true" />
          Retour général
        </button>
        <button
          ref={fullscreenButtonRef}
          className="review-fullscreen-toggle"
          type="button"
          aria-pressed={isPreviewExpanded}
          onClick={togglePreviewExpansion}
        >
          {isPreviewExpanded ? (
            <Minimize2 aria-hidden="true" />
          ) : (
            <Maximize2 aria-hidden="true" />
          )}
          <span className="review-fullscreen-label">
            {isPreviewExpanded ? "Réduire" : "Plein écran"}
          </span>
        </button>
      </div>

      {composer && (
        <div
          className="composer-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setComposer(null);
              window.requestAnimationFrame(() =>
                composerTriggerRef.current?.focus(),
              );
            }
          }}
        >
          <form
            className="feedback-composer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-title"
            aria-describedby="composer-description"
            onKeyDown={trapDialogFocus}
            onSubmit={submitFeedback}
            style={composerStyle}
          >
            <div className="composer-heading">
              <div>
                <span className={`composer-pin ${composer.general ? "general" : ""}`}>
                  {composer.general ? (
                    <CircleDotDashed aria-hidden="true" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}
                </span>
                <span>
                  <small className="composer-kicker">
                    {composer.general ? "Retour général" : "Repère sur la page"}
                  </small>
                  <strong id="composer-title">Décrivez votre retour</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setComposer(null);
                  window.requestAnimationFrame(() =>
                    composerTriggerRef.current?.focus(),
                  );
                }}
                aria-label="Fermer le formulaire"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <p className="composer-intro" id="composer-description">
              {composer.general
                ? "Partagez une impression globale sur la page actuelle."
                : "Le repère vert conservera précisément cet emplacement."}
            </p>

            <label>
              <span>Titre</span>
              <input
                type="text"
                value={form.title}
                maxLength={120}
                minLength={3}
                placeholder="Ex. Le bouton est difficile à repérer"
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
              <span>Détail</span>
              <textarea
                value={form.body}
                maxLength={1200}
                minLength={3}
                placeholder="Expliquez simplement ce qui vous gêne et ce que vous attendiez…"
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
              <span>
                <Link2 aria-hidden="true" /> {previewContext.path}
              </span>
              <span>
                <Monitor aria-hidden="true" /> {viewportDisplayLabels[viewport]}
              </span>
              <span>
                <ScanLine aria-hidden="true" /> Version {review.release.version}
              </span>
            </div>
            <p className="composer-privacy">
              Revaloop n’ajoute ni le contenu des champs du site testé ni ses
              cookies à ce retour. Le commentaire ci-dessus est enregistré et
              partagé avec l’équipe.{" "}
              <Link href="/privacy">Confidentialité</Link>
            </p>
            <button
              className="button button-primary button-full"
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Envoi…" : "Envoyer au développeur"}
              <Send aria-hidden="true" />
            </button>
          </form>
        </div>
      )}

      {showFinishDialog && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setShowFinishDialog(false);
              finishButtonRef.current?.focus();
            }
          }}
        >
          <section
            className="finish-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
            onKeyDown={trapDialogFocus}
          >
            <button
              className="dialog-close"
              type="button"
              autoFocus
              onClick={() => {
                setShowFinishDialog(false);
                finishButtonRef.current?.focus();
              }}
              aria-label="Fermer"
            >
              <X aria-hidden="true" />
            </button>
            <span className="finish-check">
              <ClipboardCheck aria-hidden="true" />
            </span>
            <p className="eyebrow">Fin du parcours</p>
            <h2 id="finish-title">
              Quelle décision souhaitez-vous transmettre pour la version{" "}
              {review.release.version} ?
            </h2>
            <p>
              {testPoints.length > 0
                ? `Vous avez vérifié ${completedPoints.length} point${
                    completedPoints.length > 1 ? "s" : ""
                  } sur ${testPoints.length} et envoyé ${sessionFeedbackCount} retour${
                    sessionFeedbackCount > 1 ? "s" : ""
                  } pendant cette visite.`
                : `Vous avez envoyé ${sessionFeedbackCount} retour${
                    sessionFeedbackCount > 1 ? "s" : ""
                  } pendant cette visite.`}
            </p>
            {unresolvedFeedback.length > 0 && (
              <p className="finish-blocker">
                {unresolvedFeedback.length} retour
                {unresolvedFeedback.length > 1 ? "s restent" : " reste"} à
                traiter ou à revalider avant l’approbation finale.
              </p>
            )}
            <div className="finish-actions">
              <button
                className="finish-choice finish-choice-approve"
                type="button"
                disabled={isSubmitting || unresolvedFeedback.length > 0}
                aria-busy={isSubmitting}
                onClick={() => submitDecision("approved")}
              >
                <span>
                  <Check aria-hidden="true" />
                </span>
                <div>
                  <strong>J’approuve cette version</strong>
                  <small>Transmettre mon accord au développeur</small>
                </div>
              </button>
              <button
                className="finish-choice"
                type="button"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                onClick={() =>
                  submitDecision(
                    "changes_requested",
                    "J’ai terminé mon parcours et envoyé mes retours.",
                  )
                }
              >
                <span>
                  <MessageCirclePlus aria-hidden="true" />
                </span>
                <div>
                  <strong>Je demande des ajustements</strong>
                  <small>Transmettre mes remarques à l’équipe</small>
                </div>
              </button>
            </div>
            <p className="finish-legal">
              Ce récapitulatif ne remplace pas une validation contractuelle si
              votre projet en prévoit une.
            </p>
          </section>
        </div>
      )}

      {toast ? (
        <div className="review-toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
