# Revaloop

Revaloop transforme une preview de développement en espace de collaboration :
le développeur publie une version, crée un lien client éphémère, reçoit des
retours contextualisés, échange des messages et signale simplement les
correctifs disponibles dans le même espace de revue tant que la session cliente
reste valide.

> [!IMPORTANT]
> **Statut : alpha 0.3 en cours, pour pilote contrôlé.**
> Le review plane est utilisable avec une preview HTTPS et une base de test.
> Revaloop ne partage pas encore un serveur `localhost` et n’est pas un proxy.
> L’invitation protège l’espace de revue, pas l’URL de staging : celle-ci doit
> disposer de sa propre protection d’accès.
> N’utilisez jamais une base de production, un secret réel ou des données
> sensibles dans la preview.

## Ce qui fonctionne

- compte développeur Revaloop par e-mail et mot de passe ;
- mot de passe dérivé avec PBKDF2-SHA-256 Web Crypto, sel aléatoire et
  600 000 itérations ;
- session développeur opaque, stockée hachée et portée par un cookie
  `HttpOnly`, `Secure` en production, `SameSite=Strict`, valable 30 jours ;
- inscription ouverte uniquement pour initialiser la première identité de
  l’instance, puis fermée, sauf si `REVALOOP_ALLOW_REGISTRATION=true` ;
- espaces, projets et données isolés par organisation ;
- création de projets et de versions de recette ;
- preview HTTPS externe affichée dans un viewport desktop, tablette ou mobile ;
- exploration libre comme parcours principal ;
- vérifications suggérées persistées mais entièrement optionnelles ;
- invitation cliente à usage unique, expirante et révocable ;
- secret de 32 octets placé dans le fragment de l’URL et stocké uniquement sous
  forme de SHA-256 ;
- échange atomique de l’invitation contre un cookie `HttpOnly`, `Secure`,
  `SameSite=Strict`, limité à 24 heures ;
- annotations visuelles précisément repérées et retours généraux libres ;
- discussion persistée au niveau de la release entre client et développeur,
  sans imposer la création d’un retour ;
- workflow `signalé → en cours → à revalider → validé` ;
- synchronisation par polling entre les espaces client et développeur ;
- action développeur « signaler les correctifs » qui incrémente
  `preview_revision` et propose au client de recharger la preview dans le même
  espace tant que sa session de 24 heures reste valide ;
- approbation impossible tant qu’un retour reste ouvert ;
- demandes d’ajustements non terminales : la même release reste ouverte pour
  corriger, revalider et transmettre un nouveau bilan ;
- approbation finale et terminale lorsque tous les retours sont résolus ;
- rotation d’accès, révocation immédiate et fermeture de session cliente ;
- publication d’une nouvelle release seulement après approbation ou expiration
  de la release courante ;
- export Markdown de la recette et suppression complète d’un projet ;
- audit minimal sans secret, limites de débit et corps JSON bornés ;
- migrations D1 versionnées, purge des données opérationnelles expirées ;
- démo publique entièrement fictive sur `/demo`.

## Parcours pilote

```text
Développeur                           Cliente

se connecte à /dashboard
crée un projet + une release
indique une preview HTTPS
crée une invitation ────────────────> ouvre /join#token=…
                                      le secret disparaît de l’URL
                                      teste la preview
voit les retours <─────────────────── ajoute des remarques
passe un point « à revalider » ─────> confirme ou rouvre le point
                                      demande des ajustements
corrige sur la même release ─────────> revalide puis transmet un nouveau bilan
signale les correctifs ──────────────> recharge pendant sa session valide
                                      approuve lorsque tout est résolu
exporte la recette
```

### Routes

| Route | Accès | Rôle |
|---|---|---|
| `/` | public | présentation |
| `/demo` | public, données fictives | démonstration cliente |
| `/login` | public | connexion au compte développeur Revaloop |
| `/register` | public tant que le bootstrap est ouvert | création du premier compte développeur |
| `/logout` | développeur authentifié | confirmation de déconnexion |
| `/dashboard` | développeur authentifié | projets, releases et retours |
| `/join#token=…` | possession de l’invitation | échange du secret |
| `/review/[releaseId]` | cookie reviewer valide | recette cliente |
| `/privacy` | public | notice générique à adapter par l’exploitant |

### API

| Méthode et route | Autorisation | Effet |
|---|---|---|
| `POST /api/auth/register` | bootstrap ou inscription activée | crée un compte et une session développeur |
| `POST /api/auth/login` | public, même origine | ouvre une session développeur |
| `POST /api/auth/logout` | session développeur | révoque la session et efface le cookie |
| `GET /api/workspace` | développeur | charge l’espace et le projet actif |
| `POST /api/projects` | développeur | crée un projet et sa première release |
| `POST /api/projects/[id]/releases` | développeur | publie une release |
| `DELETE /api/projects/[id]` | propriétaire | supprime le projet |
| `POST /api/releases/[id]/invitations` | développeur | crée et retourne le secret une fois |
| `DELETE /api/releases/[id]/access` | développeur | révoque invitations et sessions |
| `POST /api/releases/[id]/messages` | développeur | ajoute un message à la discussion |
| `POST /api/releases/[id]/preview` | développeur | signale une nouvelle révision de la preview |
| `POST /api/reviewer/session` | invitation | crée une session reviewer |
| `DELETE /api/reviewer/session` | reviewer | révoque sa session |
| `GET /api/review/[releaseId]` | reviewer | charge la recette |
| `POST /api/review/[releaseId]` | reviewer | retour, vérification, décision ou message avec `{ "kind": "message", "body": "…" }` |
| `PATCH /api/review/[releaseId]/feedback/[id]` | reviewer | confirme ou rouvre |
| `PATCH /api/feedback/[id]` | développeur | fait avancer un retour |

Toutes les mutations exigent une origine same-origin. L’auteur client vient de
la session serveur, jamais du corps envoyé par le navigateur. Le nom de cette
session est saisi par le développeur lors de l’invitation : il est déclaratif et
ne prouve pas l’identité de la personne qui utilise le lien. L’interface
actuelle ne demande aucune adresse e-mail cliente.

Les routes d’authentification développeur limitent les tentatives par compte et
adresse réseau. Revaloop ne fournit pas encore de vérification d’e-mail, de
réinitialisation de mot de passe ni de second facteur : l’opérateur doit donc
conserver un accès sûr à l’adresse et au mot de passe initialisés.

## Brancher une vraie preview

Revaloop attend une URL HTTPS dédiée, sans identifiant, mot de passe ni query
string. Cette URL reste directement accessible selon les règles de la preview :
Revaloop ne lui ajoute ni authentification, ni confidentialité. La preview doit
utiliser :

- une base de test isolée ;
- des services d’e-mail, paiement et stockage en mode sandbox ;
- des comptes fictifs ;
- une politique CSP autorisant l’affichage depuis l’origine Revaloop si vous
  souhaitez l’intégration en iframe.

Si la cible refuse l’iframe avec `X-Frame-Options` ou `frame-ancestors`, la
cliente peut l’ouvrir dans un nouvel onglet et déposer un retour général.

Avant le pilote, testez aussi l’authentification de la preview, ses cookies
cross-site/SameSite et ses parcours OAuth ou SSO. L’iframe est sandboxée :
formulaires, scripts, modales et popups sont autorisés, mais les redirections de
premier niveau, téléchargements et certaines popups d’authentification peuvent
échouer. La politique Revaloop désactive notamment caméra, microphone,
géolocalisation et paiement dans le contexte embarqué. Pour ces parcours,
utilisez le nouvel onglet et un retour général.

### Bridge de contexte facultatif

Une application monopage peut communiquer son chemin et son titre à Revaloop :

```html
<script
  src="https://VOTRE-INSTANCE/revaloop-bridge.js"
  data-revaloop-origin="https://VOTRE-INSTANCE"
></script>
```

Le bridge ne transmet que `location.pathname` et `document.title`. Il exclut
query string, hash, champs, cookies, contenu de page, position de scroll et
identifiant d’élément. Il améliore le classement par page, mais n’ancre jamais
un marqueur à un élément ni au scroll interne de l’iframe. Avec ou sans bridge,
une annotation externe reste un repère visuel approximatif dans le viewport.
Sans bridge, le chemin reste en plus celui de l’URL initiale.

### Mettre la preview à jour

Après avoir déployé ses correctifs sur la même URL de staging, le développeur
utilise l’action de mise à jour dans Revaloop. Le serveur incrémente
`preview_revision` ; le client voit qu’une nouvelle révision est disponible et
peut recharger l’iframe sans changer d’espace tant que sa session cliente de
24 heures reste valide. Une invitation étant à usage unique, une session
expirée impose de créer et transmettre une nouvelle invitation.

Cette action ne lance aucun build et ne déploie aucun fichier. Elle ne modifie
pas la base de la preview et ne garantit pas que le commit déclaré correspond
au contenu servi. Le déploiement, l’accès, les secrets et les données du
staging restent sous la responsabilité de son exploitant. Le rechargement
remonte la même URL dans l’iframe : Revaloop ne peut pas garantir le
contournement du cache HTTP, d’un CDN ou d’un Service Worker de la preview.

## Ce qui reste à construire

| Capacité | Statut |
|---|---|
| Partager directement `localhost` | non implémenté |
| CLI `revaloop share` | non implémentée |
| Agent local et relais HTTP/WebSocket | non implémentés |
| Build ou hébergement intégré de previews | non implémenté |
| Captures et pièces jointes | non implémentées |
| Notifications e-mail/Slack/GitHub | non implémentées |
| Discussion générale release client ↔ développeur | implémentée |
| Fils de discussion attachés à chaque retour | non implémentés |
| Historique navigable de toutes les releases | limité à la plus récente |
| Auto-hébergement hors Sites | à documenter et tester |
| Vérification d’e-mail, reset de mot de passe et MFA | non implémentés |
| OIDC générique, PostgreSQL et S3 | prévus |
| TLS passthrough de bout en bout | recherche |

L’URL de preview reste mutable : Revaloop prouve quelle URL et quelle référence
Git ont été déclarées, pas que le contenu externe n’a jamais changé.
La possession d’une invitation Revaloop n’accorde aucune protection
supplémentaire à cette URL.

## Architecture

```text
OpenAI Sites / Cloudflare Worker
├── landing et démo
├── login/register/logout ── compte Revaloop
├── dashboard ── session développeur opaque
├── join/review ── invitation puis session opaque
├── API métier
│   ├── autorisation organisation/projet
│   ├── transitions atomiques
│   ├── discussion et révision de preview
│   ├── rate limits
│   └── audit sans secret
└── Cloudflare D1
    ├── utilisateurs, credentials et sessions hachées
    ├── organisations et membres
    ├── projets, releases, consignes
    ├── invitations et sessions hachées
    └── messages, retours, décisions et audits

Preview HTTPS tierce
└── chargée directement par le navigateur, jamais proxifiée par Revaloop
```

Le futur agent/tunnel constitue un data plane séparé. Voir
[Architecture](docs/ARCHITECTURE.md).

## Développement local

Prérequis : Node.js `>= 22.13.0` et npm.

```bash
npm ci
npm run dev
```

Au premier démarrage d’une base vide, ouvrez `/register` pour créer le compte
propriétaire. Dès qu’un credential développeur existe, l’inscription est
fermée. Pour une instance réellement multi-utilisateur, activez explicitement
`REVALOOP_ALLOW_REGISTRATION=true` en connaissance du fait que toute personne
qui atteint `/register` pourra alors créer son propre espace.

Lors de la migration d’une instance 0.2 contenant déjà un espace, initialisez
le credential avec l’adresse e-mail exacte du compte développeur historique.
Revaloop refuse une autre adresse au lieu de créer silencieusement un second
tenant vide. Gardez l’instance en accès propriétaire pendant cette reprise.

Le binding D1 local se nomme `DB`. Le repository crée les tables manquantes
pour le développement et les mêmes évolutions sont versionnées dans
`drizzle/`.

Commandes de validation :

```bash
npm run typecheck
npm run lint
npm test
npm run db:generate
```

`npm test` construit le Worker puis vérifie les routes publiques, la protection
du dashboard, les en-têtes, les migrations, les primitives d’authentification,
la génération des secrets, les cookies, les URLs de preview, l’origine des
mutations et la validation JSON.

## Sécurité et données

Pour un pilote :

1. utilisez une preview non sensible et une DB jetable ;
2. protégez séparément l’accès au staging et testez sa compatibilité iframe ;
3. partagez le lien d’invitation par un canal approprié ;
4. créez une nouvelle invitation si le lien a été transféré ou perdu ;
5. révoquez l’accès dès la fin du test ;
6. exportez la recette puis supprimez le projet si sa conservation n’est plus
   nécessaire.

Le déploiement Sites globalement privé protège toute l’instance mais bloque
aussi `/join` : aucune cliente externe ne peut alors utiliser son invitation.
Un déploiement accessible publiquement doit donc conserver
l’authentification native du dashboard, l’inscription fermée et les sessions
applicatives reviewer. Ne changez jamais ce mode d’accès sans valider ces trois
frontières.

Documents de référence :

- [Guide du pilote](docs/PILOT_GUIDE.md)
- [Politique de sécurité](SECURITY.md)
- [Modèle de menace](docs/THREAT_MODEL.md)
- [Cycle de vie des données](docs/DATA_LIFECYCLE.md)
- [Feuille de route](docs/ROADMAP.md)
- [Système de design](docs/DESIGN_SYSTEM.md)
- [ADRs](docs/adr/)

## Contribuer

Lisez [CONTRIBUTING.md](CONTRIBUTING.md) et
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Toute modification d’une frontière
d’identité, d’autorisation, de stockage ou de transport doit inclure un test et
mettre à jour le modèle de menace ou un ADR.

## Licence

Revaloop est distribué sous [Apache License 2.0](LICENSE).

Copyright 2026 Revaloop contributors.
