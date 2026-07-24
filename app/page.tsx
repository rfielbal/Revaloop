import Link from "next/link";
import { Brand } from "./components/brand";
import { DEMO_TOKEN } from "../lib/revaloop";

const workflow = [
  {
    number: "01",
    title: "Publiez une version",
    text: "Revaloop associe les consignes et les retours à une version précise.",
  },
  {
    number: "02",
    title: "Laissez-le tester",
    text: "Le client parcourt le produit avec ses consignes, sans compte ni jargon.",
  },
  {
    number: "03",
    title: "Recevez du contexte",
    text: "Chaque retour garde sa page, sa version, son écran et sa position.",
  },
  {
    number: "04",
    title: "Faites revalider",
    text: "Une correction revient au client jusqu’à une décision claire et tracée.",
  },
];

const feedbackPreview = [
  {
    id: "#01",
    title: "Le bouton de réservation manque de contraste",
    state: "À revalider",
    tone: "lime",
  },
  {
    id: "#02",
    title: "Remplacer « Notre table »",
    state: "En cours",
    tone: "violet",
  },
  {
    id: "#03",
    title: "Proposer un horaire alternatif",
    state: "Signalé",
    tone: "coral",
  },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="site-header">
        <Link href="/" aria-label="Accueil Revaloop">
          <Brand />
        </Link>
        <nav className="site-nav" aria-label="Navigation principale">
          <a href="#produit">Produit</a>
          <a href="#confiance">Confiance</a>
          <a href="#opensource">Open source</a>
        </nav>
        <Link className="button button-small button-ink" href="/dashboard">
          Ouvrir la démo
          <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" aria-hidden="true" />
            Prototype interactif open source
          </p>
          <h1>
            Votre client ne veut pas
            <span> un tunnel.</span>
          </h1>
          <p className="hero-lead">
            Il veut savoir quoi tester, vous montrer précisément ce qui bloque
            et valider la bonne version. Revaloop rassemble tout cela dans un
            lien de revue dédié.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/dashboard">
              Explorer l’espace développeur
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              className="button button-ghost"
              href={`/review/${DEMO_TOKEN}`}
            >
              Voir comme le client
            </Link>
          </div>
          <div className="hero-proof">
            <span>Portail de revue fonctionnel</span>
            <span>Données synthétiques</span>
            <span>Tunnel sur la feuille de route</span>
          </div>
        </div>

        <div className="hero-product" aria-label="Aperçu de Revaloop">
          <div className="browser-chrome">
            <div className="browser-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="browser-address">
              <span aria-hidden="true">⌁</span>
              review.revaloop.dev/maison-matisse
            </div>
            <span className="browser-secure">Démo</span>
          </div>
          <div className="product-shell">
            <aside className="product-sidebar">
              <Brand compact />
              <div className="mini-nav">
                <span className="active" />
                <span />
                <span />
              </div>
              <span className="mini-avatar">RM</span>
            </aside>
            <div className="product-main">
              <div className="product-topline">
                <div>
                  <span className="overline">Maison Matisse</span>
                  <strong>Retours de la version v1.2</strong>
                </div>
                <span className="version-badge">En recette</span>
              </div>
              <div className="mini-metrics">
                <div>
                  <strong>4</strong>
                  <span>retours</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>à revalider</span>
                </div>
                <div>
                  <strong>75%</strong>
                  <span>parcouru</span>
                </div>
              </div>
              <div className="feedback-preview-list">
                {feedbackPreview.map((item) => (
                  <div className="feedback-preview-card" key={item.id}>
                    <span className={`mini-pin ${item.tone}`}>{item.id}</span>
                    <strong>{item.title}</strong>
                    <span className={`mini-state ${item.tone}`}>
                      {item.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="floating-comment">
            <span className="avatar avatar-coral">CD</span>
            <div>
              <strong>Claire vient d’ajouter un retour</strong>
              <span>Page d’accueil · il y a quelques secondes</span>
            </div>
          </div>
        </div>
      </section>

      <section className="workflow-section" id="produit">
        <div className="section-intro">
          <p className="eyebrow">Une boucle, pas une boîte à commentaires</p>
          <h2>Du lien de test à une validation exploitable.</h2>
        </div>
        <div className="workflow-grid">
          {workflow.map((step) => (
            <article className="workflow-card" key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="feature-section">
        <article className="feature-card feature-card-large">
          <div className="feature-copy">
            <p className="eyebrow">Le contexte suit le retour</p>
            <h2>Plus jamais « ça ne marche pas » sans savoir où regarder.</h2>
            <p>
              Position, page, type d’appareil, version et statut restent
              associés au même retour.
            </p>
          </div>
          <div className="annotation-demo">
            <div className="annotation-page">
              <span className="annotation-kicker">Maison Matisse</span>
              <strong>Une cuisine vivante, au rythme des saisons.</strong>
              <span className="annotation-button">Réserver une table</span>
              <span className="annotation-pin">1</span>
            </div>
            <div className="annotation-note">
              <span>Retour visuel · #01</span>
              <strong>Le bouton manque de contraste sur cette photo.</strong>
              <small>1440 × 900 · Chrome · v1.2</small>
            </div>
          </div>
        </article>

        <article className="feature-card feature-card-status">
          <p className="eyebrow">Un vocabulaire commun</p>
          <h3>Chaque retour avance.</h3>
          <div className="status-flow">
            <span>Signalé</span>
            <i aria-hidden="true">→</i>
            <span>En cours</span>
            <i aria-hidden="true">→</i>
            <span>À revalider</span>
            <i aria-hidden="true">→</i>
            <span className="status-done">Validé</span>
          </div>
        </article>

        <article className="feature-card feature-card-client">
          <div>
            <p className="eyebrow">Pensé pour le client</p>
            <h3>Zéro compte. Zéro jargon.</h3>
          </div>
          <div className="client-card">
            <span className="avatar avatar-lime">CD</span>
            <div>
              <strong>Bonjour Claire</strong>
              <span>3 points à vérifier · environ 5 minutes</span>
            </div>
            <span aria-hidden="true">→</span>
          </div>
        </article>
      </section>

      <section className="trust-section" id="confiance">
        <div className="trust-copy">
          <p className="eyebrow eyebrow-light">Confidentialité documentée</p>
          <h2>Conçu pour rendre le contrôle vérifiable.</h2>
          <p>
            Cette pré-alpha utilise uniquement des données synthétiques. Le
            modèle cible prévoit des liens expirants, des sessions révocables et
            un chemin d’auto-hébergement ; ces garanties restent documentées
            comme futures tant qu’elles ne sont pas testées de bout en bout.
          </p>
          <a
            className="text-link text-link-light"
            href="https://github.com/rfielbal/Revaloop/blob/main/docs/THREAT_MODEL.md"
          >
            Voir le modèle de sécurité
            <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="trust-layers" aria-label="Couches de confiance">
          <div>
            <span>01</span>
            <strong>Données de démonstration</strong>
            <small>Jamais la base de production</small>
          </div>
          <div>
            <span>02</span>
            <strong>Accès privé en conception</strong>
            <small>Sessions, rotation et révocation prévues avant la bêta</small>
          </div>
          <div>
            <span>03</span>
            <strong>Architecture ouverte</strong>
            <small>Portail présent, agent et relais encore à construire</small>
          </div>
        </div>
      </section>

      <section className="opensource-section" id="opensource">
        <div>
          <p className="eyebrow">Open source dès le premier commit</p>
          <h2>Un outil que les développeurs peuvent vraiment inspecter.</h2>
        </div>
        <div className="opensource-copy">
          <p>
            Le portail de revue est déjà inspectable. L’agent local et le relais
            sont spécifiés dans la feuille de route, qui distingue les fonctions
            disponibles de celles qui exigent encore un durcissement.
          </p>
          <Link className="button button-ink" href="/dashboard">
            Découvrir le prototype
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <Brand />
        <p>La recette client, version par version.</p>
        <span>Apache-2.0 · Construit en France</span>
      </footer>
    </main>
  );
}
