"use client";

import {
  CheckCircle2,
  Code2,
  MapPin,
  MessageCircleMore,
  Monitor,
  UserRound,
} from "lucide-react";
import { useState } from "react";

type Perspective = "client" | "developer";

export function PerspectiveToggle() {
  const [perspective, setPerspective] = useState<Perspective>("client");
  const clientView = perspective === "client";

  return (
    <div className="perspective-demo">
      <div
        className="perspective-switch"
        role="group"
        aria-label="Changer de point de vue"
      >
        <button
          className={clientView ? "active" : ""}
          type="button"
          aria-pressed={clientView}
          onClick={() => setPerspective("client")}
        >
          <UserRound aria-hidden="true" />
          Côté client
        </button>
        <button
          className={!clientView ? "active" : ""}
          type="button"
          aria-pressed={!clientView}
          onClick={() => setPerspective("developer")}
        >
          <Code2 aria-hidden="true" />
          Côté développeur
        </button>
      </div>

      <div
        className={`perspective-stage ${
          clientView ? "is-client" : "is-developer"
        }`}
      >
        <div className="perspective-thread" aria-hidden="true">
          <span />
          <i />
        </div>

        <div className="perspective-context">
          <span className="perspective-label">
            {clientView ? "Page testée" : "Contexte reçu"}
          </span>
          <div className="perspective-preview">
            <div>
              <small>Maison Matisse</small>
              <strong>Réserver une table</strong>
              <span />
            </div>
            <span className="perspective-pin">03</span>
          </div>
        </div>

        <article className="perspective-note" aria-live="polite">
          <span className="note-index">Retour #03</span>
          <h3>
            {clientView
              ? "Je ne sais pas si ma réservation est confirmée."
              : "La confirmation du parcours manque de clarté."}
          </h3>
          <p>
            {clientView
              ? "Claire décrit simplement ce qu’elle vient de vivre, à l’endroit précis où elle hésite."
              : "Raphaël reçoit le retour avec la page, l’écran, la version et la position déjà rattachés."}
          </p>
          <div className="perspective-meta">
            <span>
              <MapPin aria-hidden="true" />
              Accueil
            </span>
            <span>
              <Monitor aria-hidden="true" />
              390 × 844
            </span>
            <span>
              {clientView ? (
                <MessageCircleMore aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              {clientView ? "Prêt à envoyer" : "Contexte complet"}
            </span>
          </div>
        </article>
      </div>
    </div>
  );
}
