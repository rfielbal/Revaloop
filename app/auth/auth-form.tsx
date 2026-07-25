"use client";

import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Brand } from "../components/brand";
import styles from "./auth.module.css";

type AuthFormProps = {
  mode: "login" | "register";
  returnTo: string;
  registrationOpen?: boolean;
};

type AuthResponse = {
  error?: string;
};

export function AuthForm({
  mode,
  returnTo,
  registrationOpen = true,
}: AuthFormProps) {
  const isRegistration = mode === "register";
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || (isRegistration && !registrationOpen)) {
      return;
    }

    setError("");
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(
        isRegistration ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            displayName: String(form.get("displayName") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as AuthResponse;

      if (!response.ok) {
        setError(
          payload.error ??
            (isRegistration
              ? "Le compte n’a pas pu être créé."
              : "Adresse e-mail ou mot de passe incorrect."),
        );
        return;
      }

      window.location.assign(returnTo);
    } catch {
      setError(
        "Revaloop ne répond pas pour le moment. Vérifiez votre connexion puis réessayez.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true">
        <span />
        <span />
      </div>

      <Link className={styles.brandLink} href="/" aria-label="Accueil Revaloop">
        <Brand />
      </Link>

      <section className={styles.shell} aria-labelledby="auth-title">
        <div className={styles.introduction}>
          <span className={styles.eyebrow}>
            <ShieldCheck aria-hidden="true" />
            Espace développeur protégé
          </span>
          <h1 id="auth-title">
            {isRegistration ? (
              <>
                Créez le premier compte.
                <em> Votre espace reste le vôtre.</em>
              </>
            ) : (
              <>
                Retrouvez vos projets.
                <em> Reprenez la conversation.</em>
              </>
            )}
          </h1>
          <p>
            {isRegistration
              ? "Cette inscription initialise votre instance Revaloop. Les inscriptions suivantes seront fermées automatiquement."
              : "Connectez-vous avec le compte propre à cette instance Revaloop. Aucun compte tiers n’est nécessaire."}
          </p>
          <ul className={styles.assurances}>
            <li>
              <span />
              Mot de passe dérivé et salé avant stockage
            </li>
            <li>
              <span />
              Session privée, révocable et limitée à 30 jours
            </li>
            <li>
              <span />
              Identifiants jamais transmis à la preview cliente
            </li>
          </ul>
        </div>

        <div className={styles.formPanel}>
          <span className={styles.formIcon} aria-hidden="true">
            <KeyRound />
          </span>
          <div className={styles.formHeading}>
            <small>{isRegistration ? "Initialisation" : "Connexion"}</small>
            <h2>
              {isRegistration ? "Votre compte Revaloop" : "Bon retour"}
            </h2>
            <p>
              {isRegistration
                ? "Choisissez des identifiants réservés à cette instance."
                : "Saisissez vos identifiants Revaloop."}
            </p>
          </div>

          {isRegistration && !registrationOpen ? (
            <div className={styles.closed} role="status">
              <strong>Cette instance est déjà initialisée.</strong>
              <p>
                Les nouvelles inscriptions sont fermées. Un propriétaire peut
                les réactiver depuis la configuration du serveur.
              </p>
              <Link href={`/login?return_to=${encodeURIComponent(returnTo)}`}>
                Aller à la connexion
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <form className={styles.form} onSubmit={submit}>
              {isRegistration ? (
                <label>
                  <span>Nom affiché</span>
                  <input
                    name="displayName"
                    type="text"
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    placeholder="Votre nom ou celui du studio"
                    required
                  />
                </label>
              ) : null}

              <label>
                <span>Adresse e-mail</span>
                <input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="vous@studio.fr"
                  required
                />
              </label>

              <label>
                <span>Mot de passe</span>
                <span className={styles.passwordField}>
                  <input
                    name="password"
                    type={passwordVisible ? "text" : "password"}
                    autoComplete={
                      isRegistration ? "new-password" : "current-password"
                    }
                    minLength={isRegistration ? 12 : undefined}
                    maxLength={128}
                    placeholder={
                      isRegistration
                        ? "12 caractères minimum"
                        : "Votre mot de passe"
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    aria-label={
                      passwordVisible
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                  >
                    {passwordVisible ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </button>
                </span>
              </label>

              {isRegistration ? (
                <p className={styles.passwordHint}>
                  Utilisez une phrase de passe longue et unique. Revaloop
                  n’enregistre jamais sa version lisible.
                </p>
              ) : null}

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}

              <button className={styles.submit} disabled={isSubmitting}>
                <span>
                  {isSubmitting
                    ? "Vérification…"
                    : isRegistration
                      ? "Créer mon espace"
                      : "Se connecter"}
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            </form>
          )}

          {(!isRegistration || registrationOpen) && (
            <p className={styles.switchMode}>
              {isRegistration ? (
                <>
                  Vous avez déjà un compte ?{" "}
                  <Link
                    href={`/login?return_to=${encodeURIComponent(returnTo)}`}
                  >
                    Se connecter
                  </Link>
                </>
              ) : (
                <>
                  Première installation ?{" "}
                  <Link
                    href={`/register?return_to=${encodeURIComponent(returnTo)}`}
                  >
                    Initialiser l’instance
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      <p className={styles.footer}>
        Les espaces clients restent accessibles uniquement avec leur invitation
        dédiée.
      </p>
    </main>
  );
}
