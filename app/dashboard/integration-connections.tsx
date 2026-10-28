"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, Link2 } from "lucide-react";
type Token = {
  id: string;
  label: string;
  capabilities: string[];
  expiresAt: string;
  revokedAt: string | null;
};
export function IntegrationConnections({ projectId }: { projectId: string }) {
  const [tokens, setTokens] = useState<Token[]>([]),
    [label, setLabel] = useState("VisionBuild"),
    [write, setWrite] = useState(false),
    [days, setDays] = useState(30);
  const [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(
        `/api/integrations/tokens?project=${encodeURIComponent(projectId)}`,
        { cache: "no-store", signal },
      );
      const body = (await response.json()) as {
        error?: string;
        tokens: Token[];
      };
      if (!response.ok)
        throw new Error(body.error || "Impossible de lire les connexions.");
      return body.tokens;
    },
    [projectId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal)
      .then((tokens) => {
        if (!controller.signal.aborted) setTokens(tokens);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Connexion indisponible.",
          );
      });
    return () => controller.abort();
  }, [refresh]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSecret("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, label, write, expiresInDays: days }),
      });
      const result = (await response.json()) as {
        error?: string;
        token: string;
      };
      if (!response.ok)
        throw new Error(result.error || "La connexion n’a pas été créée.");
      setSecret(result.token);
      setTokens(await refresh());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "La connexion n’a pas été créée. Vérifiez la liste avant de réessayer.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, tokenId: id }),
      });
      const result = (await response.json()) as {
        error?: string;
        token: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Révocation impossible.");
      setSecret("");
      setTokens(await refresh());
      setNotice("Connexion révoquée.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Révocation impossible.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="secure-form integration-connections">
      <span className="dialog-icon">
        <Link2 aria-hidden="true" />
      </span>
      <h2 id="secure-dialog-title">Connecter votre espace de travail</h2>
      <p className="secure-dialog-lead">
        Une connexion dédiée à ce projet. Les comptes et invitations clients
        restent séparés.
      </p>
      {error ? (
        <p className="integration-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {secret ? (
        <div className="integration-secret">
          <label htmlFor="integration-secret">
            Copiez ce jeton dans votre espace de travail
          </label>
          <textarea
            id="integration-secret"
            readOnly
            value={secret}
            spellCheck={false}
            autoComplete="off"
            rows={3}
          />
          <p>
            Il ne sera plus affiché après la fermeture. Le serveur conserve
            seulement son empreinte.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={() =>
              void navigator.clipboard
                .writeText(secret)
                .then(() => setNotice("Jeton copié."))
                .catch(() => setError("Copiez le jeton manuellement."))
            }
          >
            <Copy size={16} />
            Copier le jeton
          </button>
        </div>
      ) : (
        <form onSubmit={create} className="integration-token-form">
          <label>
            Nom de la connexion
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label>
            Expire après
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
              <option value={90}>90 jours</option>
            </select>
          </label>
          <label className="integration-write-option">
            <input
              type="checkbox"
              checked={write}
              onChange={(e) => setWrite(e.target.checked)}
            />
            Autoriser les messages et la prise en charge des retours
          </label>
          <p>
            Lecture seule par défaut. La validation des corrections reste
            réservée au client.
          </p>
          <button
            className="button button-primary"
            disabled={busy || !label.trim()}
          >
            {busy ? "Création…" : "Créer la connexion"}
          </button>
        </form>
      )}
      <div className="integration-token-list">
        <h3>Connexions du projet</h3>
        {tokens.filter((t) => !t.revokedAt).length ? (
          tokens
            .filter((t) => !t.revokedAt)
            .map((token) => (
              <div key={token.id} className="integration-token-row">
                <div>
                  <strong>{token.label}</strong>
                  <p>
                    {token.capabilities.includes("messages:write")
                      ? "Lecture et actions développeur"
                      : "Lecture seule"}{" "}
                    · expire le{" "}
                    {new Date(token.expiresAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-ghost"
                  disabled={busy}
                  onClick={() => void revoke(token.id)}
                >
                  Révoquer
                </button>
              </div>
            ))
        ) : (
          <p>Aucune connexion active.</p>
        )}
      </div>
    </div>
  );
}
