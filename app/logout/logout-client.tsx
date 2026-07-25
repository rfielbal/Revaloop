"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "../components/brand";
import styles from "../auth/auth.module.css";

export function LogoutClient({ returnTo }: { returnTo: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function closeSession() {
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        });

        if (!response.ok) {
          throw new Error("logout_failed");
        }

        window.location.replace(returnTo);
      } catch {
        if (active) {
          setFailed(true);
        }
      }
    }

    void closeSession();

    return () => {
      active = false;
    };
  }, [returnTo]);

  return (
    <main className={styles.page}>
      <Link className={styles.brandLink} href="/" aria-label="Accueil Revaloop">
        <Brand />
      </Link>
      <section
        className={`${styles.shell} ${styles.logoutShell}`}
        aria-labelledby="logout-title"
      >
        <div className={styles.introduction}>
          <span className={styles.eyebrow}>
            <LogOut aria-hidden="true" />
            Fin de session
          </span>
          <h1 id="logout-title">
            {failed ? "La session est encore ouverte." : "À bientôt."}
            <em>
              {failed
                ? " Réessayez en toute sécurité."
                : " Nous fermons votre espace."}
            </em>
          </h1>
          <p>
            {failed
              ? "Revaloop n’a pas pu révoquer cette session. Aucun changement n’a été appliqué."
              : "Le jeton présent sur cet appareil est en cours de révocation."}
          </p>
          {failed ? (
            <p>
              <Link
                href={`/logout?return_to=${encodeURIComponent(returnTo)}`}
              >
                Réessayer
              </Link>
            </p>
          ) : (
            <LoaderCircle aria-label="Déconnexion en cours" />
          )}
        </div>
      </section>
    </main>
  );
}
