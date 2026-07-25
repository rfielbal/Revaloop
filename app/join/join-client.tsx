"use client";

import Link from "next/link";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand } from "../components/brand";

type JoinState = "ready" | "opening" | "error";

export function JoinClient() {
  const [state, setState] = useState<JoinState>("ready");
  const [message, setMessage] = useState(
    "Prenez connaissance des informations ci-dessous, puis ouvrez votre espace de test.",
  );
  const [canRetry, setCanRetry] = useState(false);
  const secretRef = useRef("");

  useEffect(() => {
    if (!secretRef.current) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      secretRef.current = fragment.get("token") ?? "";
      window.history.replaceState(null, "", "/join");
    }

    if (!secretRef.current) {
      setState("error");
      setMessage(
        "Le secret de cette invitation est absent. Demandez un nouveau lien au développeur.",
      );
    }
  }, []);

  async function openInvitation() {
    const secret = secretRef.current;

    if (!secret || state === "opening") {
      return;
    }

    setState("opening");
    setCanRetry(false);
    setMessage("Votre invitation est en cours de vérification…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    let retryable = false;

    try {
      const response = await fetch("/api/reviewer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        redirectTo?: string;
      } | null;

      if (!response.ok || !payload?.redirectTo) {
        retryable = response.status === 429 || response.status >= 500;
        throw new Error(
          payload?.error ?? "Cette invitation ne peut pas être ouverte.",
        );
      }

      window.location.replace(payload.redirectTo);
    } catch (error) {
      setState("error");
      setCanRetry(
        retryable ||
          error instanceof TypeError ||
          (error instanceof DOMException && error.name === "AbortError"),
      );
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "La vérification prend trop de temps. Réessayez dans quelques instants."
          : error instanceof Error
          ? error.message
          : "Cette invitation ne peut pas être ouverte.",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <main className="join-page">
      <Link href="/" aria-label="Accueil Revaloop">
        <Brand />
      </Link>
      <section className="join-card" aria-live="polite">
        <span className="join-icon">
          {state === "opening" ? (
            <LoaderCircle className="join-spinner" aria-hidden="true" />
          ) : (
            <KeyRound aria-hidden="true" />
          )}
        </span>
        <p className="eyebrow">Invitation client</p>
        <h1>
          {state === "opening"
            ? "Ouverture de votre espace."
            : state === "ready"
              ? "Votre espace de test est prêt."
              : "Invitation indisponible."}
        </h1>
        <p>{message}</p>
        <div className="join-security-note">
          <ShieldCheck aria-hidden="true" />
          <span>
            Le secret est retiré de l’adresse avant l’ouverture du projet.
          </span>
        </div>
        {state === "ready" ? (
          <>
            <p className="join-privacy-note">
              L’ouverture crée une session technique. Vos actions de
              vérification et les commentaires que vous envoyez seront
              conservés dans ce projet et visibles par son équipe. Utilisez
              uniquement des données fictives.{" "}
              <Link href="/privacy">Lire les informations de confidentialité</Link>.
            </p>
            <button
              className="button button-primary"
              type="button"
              onClick={openInvitation}
            >
              Ouvrir mon espace de test
            </button>
          </>
        ) : null}
        {state === "error" ? (
          <div className="join-actions">
            {canRetry ? (
              <button
                className="button button-primary"
                type="button"
                onClick={openInvitation}
              >
                Réessayer
              </button>
            ) : null}
            <Link className="button button-ghost" href="/">
              Retour à Revaloop
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
