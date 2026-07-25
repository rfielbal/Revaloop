import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  GitFork,
  Link2,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircleMore,
  MonitorSmartphone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { Brand } from "./components/brand";
import { PerspectiveToggle } from "./components/perspective-toggle";

const journey = [
  {
    number: "01",
    title: "Partagez une version",
    text: "Le client reçoit un lien dédié, des consignes claires et un environnement de démonstration.",
    icon: Link2,
  },
  {
    number: "02",
    title: "Laissez-le parcourir",
    text: "Il teste librement sur ordinateur ou téléphone, sans compte et sans vocabulaire technique.",
    icon: UserRound,
  },
  {
    number: "03",
    title: "Gardez le contexte",
    text: "Chaque remarque reste liée à sa page, sa position, son écran et sa version.",
    icon: MapPin,
  },
  {
    number: "04",
    title: "Refermez la boucle",
    text: "La correction revient au client jusqu’à une décision explicite et traçable.",
    icon: Check,
  },
];

const currentCapabilities = [
  "Projets et versions de recette isolés",
  "Invitations éphémères à usage unique",
  "Retours contextualisés, statuts et revalidation",
  "Compagnon desktop pour le projet local",
  "Décision finale, révocation et export",
];

const upcomingCapabilities = [
  "Tunnel privé depuis le compagnon desktop",
  "Captures d’écran jointes aux retours",
  "Notifications et intégrations Git",
  "Déploiement autonome simplifié",
];

export default function Home() {
  return (
    <main className="landing-page revaloop-home">
      <a className="flow-skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="flow-site-header">
        <div className="flow-header-shell">
          <Link href="/" aria-label="Accueil Revaloop">
            <Brand />
          </Link>

          <nav className="flow-site-nav" aria-label="Navigation principale">
            <a href="#produit">Le produit</a>
            <a href="#desktop">Desktop</a>
            <a href="#confiance">Confiance</a>
            <a href="#opensource">Open source</a>
          </nav>

          <Link className="flow-header-cta" href="/dashboard">
            Espace développeur
            <ArrowUpRight aria-hidden="true" />
          </Link>

          <details className="flow-mobile-nav">
            <summary>
              <Menu aria-hidden="true" />
              <span>Menu</span>
            </summary>
            <div>
              <a href="#produit">Le produit</a>
              <a href="#desktop">Desktop</a>
              <a href="#confiance">Confiance</a>
              <a href="#opensource">Open source</a>
              <Link href="/dashboard">Espace développeur</Link>
            </div>
          </details>
        </div>
      </header>

      <section className="flow-hero" id="contenu">
        <div className="flow-hero-copy">
          <p className="flow-kicker">
            <span aria-hidden="true" />
            Alpha open source · pilote fonctionnel
          </p>
          <h1>
            Le lien ouvre le projet.
            <em> Revaloop garde le fil.</em>
          </h1>
          <p className="flow-hero-lead">
            Un espace de revue où votre client sait quoi tester, peut montrer
            exactement ce qui bloque et vous transmettre une décision claire.
          </p>
          <div className="flow-hero-actions">
            <Link className="flow-button flow-button-primary" href="/dashboard">
              Explorer côté développeur
              <span>
                <ArrowRight aria-hidden="true" />
              </span>
            </Link>
            <Link
              className="flow-button flow-button-secondary"
              href="/demo"
            >
              Voir comme le client
              <span>
                <UserRound aria-hidden="true" />
              </span>
            </Link>
          </div>
          <p className="flow-truth-line">
            Aujourd’hui : invitation et retours sécurisés autour d’une preview
            HTTPS protégée séparément, plus un compagnon desktop local.
            <span> Ensuite : tunnel privé vers le client.</span>
          </p>
        </div>

        <div className="flow-hero-scene" aria-label="Un retour relié au projet">
          <span className="scene-orbit scene-orbit-one" aria-hidden="true" />
          <span className="scene-orbit scene-orbit-two" aria-hidden="true" />
          <div className="scene-product">
            <div className="scene-product-heading">
              <span>
                <small>Maison Matisse</small>
                <strong>Version v1.2</strong>
              </span>
              <span className="scene-ready">Prête à tester</span>
            </div>
            <div className="scene-page">
              <div className="scene-page-copy">
                <small>Paris · Rive gauche</small>
                <strong>Une cuisine vivante, au rythme des saisons.</strong>
                <span>Réserver une table</span>
              </div>
              <div className="scene-page-art" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <span className="scene-pin">03</span>
            </div>
          </div>

          <article className="scene-feedback">
            <span>Retour #03 · Client</span>
            <strong>Je ne sais pas si ma réservation est confirmée.</strong>
            <small>Accueil · mobile · version v1.2</small>
          </article>

          <div className="scene-resolution">
            <span>
              <Check aria-hidden="true" />
            </span>
            <div>
              <small>Boucle refermée</small>
              <strong>Correction confirmée</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="flow-opening">
        <p>
          Une remarque n’est utile que si elle arrive
          <em> au bon endroit, sur la bonne version, avec la bonne personne.</em>
        </p>
        <div>
          <span>
            <MessageCircleMore aria-hidden="true" />
            Retour humain
          </span>
          <span>
            <MonitorSmartphone aria-hidden="true" />
            Contexte technique
          </span>
          <span>
            <Check aria-hidden="true" />
            Décision partagée
          </span>
        </div>
      </section>

      <section className="flow-perspective-section" id="produit">
        <div className="flow-section-heading">
          <span>Le même retour, des deux côtés</span>
          <h2>
            Le client explique simplement.
            <em> L’équipe reçoit précisément.</em>
          </h2>
          <p>
            Changez de point de vue : l’identifiant reste le même, seul le
            niveau de contexte s’adapte à la personne qui le consulte.
          </p>
        </div>
        <PerspectiveToggle />
      </section>

      <section className="flow-journey-section">
        <div className="flow-section-heading flow-section-heading-compact">
          <span>Une boucle qui ne perd rien en route</span>
          <h2>Du premier clic à la validation finale.</h2>
        </div>
        <div className="flow-journey">
          <span className="journey-line" aria-hidden="true" />
          {journey.map((step) => {
            const StepIcon = step.icon;
            return (
              <article className="journey-step" key={step.number}>
                <span className="journey-node">
                  <StepIcon aria-hidden="true" />
                </span>
                <small>{step.number}</small>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="flow-context-section">
        <div className="context-scene" aria-label="Retour contextualisé">
          <div className="context-page">
            <span>Maison Matisse</span>
            <h3>Votre table vous attend.</h3>
            <p>Choisissez un créneau pour terminer votre réservation.</p>
            <button type="button" disabled>
              Continuer
            </button>
            <i className="context-marker">01</i>
          </div>
          <article className="context-note">
            <span>Retour visuel · #01</span>
            <strong>Le bouton se confond avec le fond sur téléphone.</strong>
            <div>
              <small>Page</small>
              <b>/reservation</b>
              <small>Écran</small>
              <b>390 × 844</b>
              <small>Version</small>
              <b>v1.2</b>
            </div>
          </article>
        </div>
        <div className="context-copy">
          <span>Un retour qui sait déjà où regarder</span>
          <h2>Le contexte voyage avec la remarque.</h2>
          <p>
            Plus besoin de reconstituer la scène à partir d’une capture perdue
            ou d’un message vague. Revaloop conserve les repères nécessaires
            pour comprendre, corriger puis faire vérifier.
          </p>
          <ul>
            <li>
              <MapPin aria-hidden="true" />
              Page et position dans l’interface
            </li>
            <li>
              <MonitorSmartphone aria-hidden="true" />
              Appareil et dimensions observées
            </li>
            <li>
              <Code2 aria-hidden="true" />
              Version et statut du retour
            </li>
          </ul>
        </div>
      </section>

      <section className="flow-reality-section">
        <div className="flow-section-heading flow-section-heading-compact">
          <span>Une alpha qui dit précisément où elle en est</span>
          <h2>Ce qui fonctionne. Ce qui vient ensuite.</h2>
        </div>
        <div className="reality-columns">
          <article>
            <span className="reality-state">
              <Check aria-hidden="true" />
              Disponible dans le pilote
            </span>
            <ul>
              {currentCapabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </article>
          <article>
            <span className="reality-state reality-state-next">
              <ArrowRight aria-hidden="true" />
              Sur la feuille de route
            </span>
            <ul>
              {upcomingCapabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="flow-desktop-section" id="desktop">
        <div className="desktop-copy">
          <span>Compagnon local · Electron</span>
          <h2>Votre projet local, prêt à être revu.</h2>
          <p>
            L’application Electron peut déjà être lancée depuis le dépôt, sans
            réinstaller une nouvelle version à chaque évolution. Elle vous aide
            à choisir le projet, confirme la commande à exécuter puis ouvre
            Revaloop dans le navigateur.
          </p>
          <div className="desktop-actions">
            <a
              className="flow-button desktop-readme-link"
              href="https://github.com/rfielbal/Revaloop/blob/main/README.md#développement-local--application-desktop"
            >
              <Code2 aria-hidden="true" />
              Lancer depuis le README
              <span>
                <ArrowUpRight aria-hidden="true" />
              </span>
            </a>
            <a
              className="desktop-releases-link"
              href="https://github.com/rfielbal/Revaloop/releases"
            >
              Voir les futures releases
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <p className="desktop-release-note">
            Aucun binaire public pour le moment. La première préversion
            téléchargeable sera publiée sur GitHub Releases après signature des
            binaires et notarisation macOS.
          </p>
        </div>

        <div
          className="desktop-window"
          role="img"
          aria-label="Aperçu du compagnon desktop Revaloop"
        >
          <div className="desktop-window-heading">
            <span>
              <MonitorSmartphone aria-hidden="true" />
            </span>
            <div>
              <small>Compagnon local</small>
              <strong>Revaloop Desktop</strong>
            </div>
            <em>Electron</em>
          </div>
          <div className="desktop-window-content">
            <div className="desktop-project-card">
              <small>Projet sélectionné</small>
              <strong>mon-projet-client</strong>
              <span>/projets/mon-projet-client</span>
            </div>
            <div className="desktop-command-card">
              <small>Commande confirmée avant lancement</small>
              <code>npm --ignore-scripts run dev</code>
            </div>
            <div className="desktop-open-row">
              <span>
                <Check aria-hidden="true" />
              </span>
              <div>
                <small>Ouverture locale</small>
                <strong>http://127.0.0.1:3000</strong>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section className="flow-trust-section" id="confiance">
        <div className="trust-route" aria-hidden="true">
          <span />
          <i />
          <span />
          <i />
          <span />
        </div>
        <div className="trust-copy">
          <span>Confidentialité documentée</span>
          <h2>La confiance se construit aussi dans le parcours de test.</h2>
          <p>
            La démo publique emploie uniquement des données synthétiques. Les
            espaces réels utilisent des invitations à usage unique, des
            sessions révocables, une séparation stricte entre développeur et
            client, et une base de recette dédiée.
          </p>
          <a
            href="https://github.com/rfielbal/Revaloop/blob/main/docs/THREAT_MODEL.md"
          >
            Lire le modèle de sécurité
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <div className="trust-points">
          <article>
            <MonitorSmartphone aria-hidden="true" />
            <strong>Poste du développeur</strong>
            <span>Une base de test, jamais la production.</span>
          </article>
          <article>
            <LockKeyhole aria-hidden="true" />
            <strong>Espace de revue privé</strong>
            <span>
              Secrets hachés et sessions révocables ; la preview conserve sa
              propre protection d’accès.
            </span>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" />
            <strong>Architecture ouverte</strong>
            <span>Un modèle inspectable et documenté.</span>
          </article>
        </div>
      </section>

      <section className="flow-opensource-section" id="opensource">
        <div>
          <span>Open source dès le premier commit</span>
          <h2>Un outil que les développeurs peuvent vraiment inspecter.</h2>
        </div>
        <div>
          <p>
            Le portail de revue, les invitations et la persistance sont
            utilisables en pilote. Le dépôt distingue les fonctions validées de
            celles qui demandent encore du durcissement à grande échelle.
          </p>
          <a
            className="flow-button flow-button-secondary"
            href="https://github.com/rfielbal/Revaloop"
          >
            <GitFork aria-hidden="true" />
            Consulter le dépôt
            <span>
              <ArrowUpRight aria-hidden="true" />
            </span>
          </a>
        </div>
      </section>

      <section className="flow-final-section">
        <div>
          <span>Deux points de vue, une seule boucle</span>
          <h2>Essayez Revaloop comme il doit être vécu.</h2>
        </div>
        <div className="flow-final-actions">
          <Link className="flow-final-link flow-final-link-dev" href="/dashboard">
            <Code2 aria-hidden="true" />
            <span>
              <small>Pour le développeur</small>
              <strong>Ouvrir le tableau de bord</strong>
            </span>
            <ArrowUpRight aria-hidden="true" />
          </Link>
          <Link
            className="flow-final-link flow-final-link-client"
            href="/demo"
          >
            <UserRound aria-hidden="true" />
            <span>
              <small>Pour le client</small>
              <strong>Commencer la revue</strong>
            </span>
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="flow-site-footer">
        <Brand />
        <div>
          <a href="https://github.com/rfielbal/Revaloop">GitHub</a>
          <a href="https://github.com/rfielbal/Revaloop/blob/main/LICENSE">
            Apache-2.0
          </a>
          <a href="https://github.com/rfielbal/Revaloop/blob/main/SECURITY.md">
            Sécurité
          </a>
        </div>
        <p>Alpha · construit en France</p>
      </footer>
    </main>
  );
}
