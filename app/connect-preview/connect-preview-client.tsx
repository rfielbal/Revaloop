"use client";

import { ArrowRight, Link2, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CONNECTED_PREVIEW_STORAGE_KEY,
  normalizeConnectedPreviewUrl,
} from "../../lib/preview-url";
import { Brand } from "../components/brand";
import styles from "./connect-preview.module.css";

type ConnectionState = "connecting" | "error";

export function ConnectPreviewClient() {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [message, setMessage] = useState(
    "Vérification de l’adresse HTTPS transmise par le compagnon local…",
  );

  useEffect(() => {
    let cancelled = false;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const candidate = fragment.get("url");

    window.history.replaceState(null, "", "/connect-preview");

    try {
      const previewUrl = normalizeConnectedPreviewUrl(candidate);
      window.sessionStorage.setItem(
        CONNECTED_PREVIEW_STORAGE_KEY,
        previewUrl,
      );
      window.location.replace("/dashboard?connect_preview=1");
    } catch (error) {
      window.sessionStorage.removeItem(CONNECTED_PREVIEW_STORAGE_KEY);
      queueMicrotask(() => {
        if (cancelled) return;
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Cette adresse de preview ne peut pas être utilisée.",
        );
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.page}>
      <Link className={styles.brand} href="/" aria-label="Accueil Revaloop">
        <Brand />
      </Link>
      <section className={styles.card} aria-live="polite">
        <span className={styles.icon} aria-hidden="true">
          {state === "connecting" ? <Link2 /> : <TriangleAlert />}
        </span>
        <p className={styles.eyebrow}>Compagnon local</p>
        <h1>
          {state === "connecting"
            ? "Connexion de la preview."
            : "Preview non reliée."}
        </h1>
        <p>{message}</p>
        <div className={styles.safety}>
          <ShieldCheck aria-hidden="true" />
          <span>
            Le fragment de ce lien n’est pas envoyé au serveur. L’adresse reste
            temporairement dans cet onglet, puis elle est supprimée après le
            préremplissage et enregistrée seulement si vous confirmez.
          </span>
        </div>
        {state === "error" ? (
          <div className={styles.actions}>
            <Link href="/dashboard">
              Continuer sans cette adresse
              <ArrowRight aria-hidden="true" />
            </Link>
            <p>
              Relancez le partage depuis le compagnon lorsque le tunnel HTTPS
              est disponible.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
