import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "../components/brand";

export const metadata: Metadata = {
  title: "Confidentialité",
  description:
    "Informations de confidentialité applicables à une instance Revaloop.",
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header>
        <Link href="/" aria-label="Accueil Revaloop">
          <Brand />
        </Link>
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Retour
        </Link>
      </header>

      <article>
        <span className="privacy-icon">
          <ShieldCheck aria-hidden="true" />
        </span>
        <p className="eyebrow">Confidentialité · instance open source</p>
        <h1>Ce que Revaloop conserve pendant un test.</h1>
        <p className="privacy-lead">
          Le code de Revaloop est open source, mais l’auto-hébergement hors
          environnement Sites n’est pas encore qualifié par le projet. Le
          responsable des données est la personne ou l’organisation qui
          exploite cette instance et vous a transmis le lien, pas
          automatiquement l’auteur du logiciel. Cette page générique ne remplace
          pas sa notice adaptée au pilote.
        </p>

        <section>
          <h2>Données traitées</h2>
          <p>
            Le nom affiché de la session, l’éventuel e-mail de suivi renseigné
            par le développeur, les cases de vérification, les retours envoyés,
            leur page sans paramètres d’URL, le format d’écran, les décisions,
            les dates techniques et un journal d’audit minimal. L’e-mail reste
            visible uniquement par l’équipe autorisée du projet : il n’est ni
            transmis à la session invitée, ni vérifié, ni utilisé pour envoyer
            un message. Revaloop ne lit pas les champs, cookies ni identifiants
            de l’application testée.
          </p>
        </section>

        <section>
          <h2>Finalités et accès</h2>
          <p>
            Les informations de revue servent uniquement à organiser le test,
            corriger les remarques et conserver un historique de validation.
            Les retours, messages et décisions sont visibles par l’équipe du
            projet et, si une nouvelle invitation est créée pour la même
            version, par la nouvelle session invitée. L’e-mail de suivi reste
            réservé à l’équipe.
          </p>
        </section>

        <section>
          <h2>Durée et suppression</h2>
          <p>
            Les retours restent attachés au projet jusqu’à sa suppression par
            l’exploitant. Les accès expirés sont nettoyés progressivement et le
            journal technique est limité dans le temps. L’exploitant doit fixer
            et communiquer une durée adaptée à son contrat.
          </p>
        </section>

        <section>
          <h2>Hébergement et droits</h2>
          <p>
            Avant le pilote, l’expéditeur du lien doit vous communiquer
            l’identité et le contact du responsable, la durée de conservation,
            l’hébergeur et sa région, ainsi que les sous-traitants et les
            informations relatives à leur accord de traitement des données.
            Adressez-lui directement toute demande d’accès, rectification ou
            suppression. Si ces informations ne vous ont pas été fournies,
            n’envoyez aucune donnée confidentielle.
          </p>
        </section>

        <aside>
          La preview est un service séparé : son accès, ses cookies, sa base de
          données et sa propre notice doivent être sécurisés par l’équipe qui
          l’exploite. Avec un Quick Tunnel, Cloudflare termine la connexion TLS
          du navigateur et peut techniquement voir le trafic HTTP en transit ;
          n’y saisissez aucune donnée réelle ou confidentielle.
        </aside>
      </article>
    </main>
  );
}
