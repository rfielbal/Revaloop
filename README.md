# Revaloop

Revaloop transforme une preview de développement en espace de collaboration :
le développeur publie une version, crée un lien client éphémère, reçoit des
retours contextualisés, échange des messages et signale simplement les
correctifs disponibles dans le même espace de revue tant que la session cliente
reste valide.

> [!IMPORTANT]
> **Statut : alpha 0.3 en cours, pour pilote contrôlé.**
> Le review plane est utilisable avec une preview HTTPS et une base de test.
> Le compagnon desktop peut sélectionner, lancer et surveiller un projet local,
> puis créer un Quick Tunnel HTTPS temporaire avec une installation locale de
> `cloudflared`. Ce lien est public, aléatoire, non durable et destiné aux tests,
> pas à la production.
> L’invitation protège l’espace de revue, pas l’URL de staging : celle-ci doit
> disposer de sa propre protection d’accès.
> N’utilisez jamais une base de production, un secret réel ou des données
> sensibles dans la preview.

## Ce qui fonctionne

- compte développeur Revaloop par e-mail et mot de passe ;
- mot de passe dérivé avec PBKDF2-SHA-256 Web Crypto, sel aléatoire et
  100 000 itérations, soit le maximum accepté par le runtime Workers actuel ;
- session développeur opaque, stockée hachée et portée par un cookie
  `HttpOnly`, `Secure` en production, `SameSite=Strict`, valable 30 jours ;
- inscription ouverte uniquement pour initialiser la première identité de
  l’instance, puis fermée, sauf si `REVALOOP_ALLOW_REGISTRATION=true` ;
- confirmation du mot de passe contrôlée dans le formulaire et à nouveau dans
  l’API ;
- espaces, projets et données isolés par organisation ;
- création de projets et de versions de recette ;
- consultation de l’historique des versions, retours, messages et décisions
  depuis le dashboard ;
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

### Compagnon desktop local

- runtime principal Electron avec une interface React/Vite locale ; en build
  empaqueté, les assets sont servis par l’origine dédiée `revaloop://app` ;
- renderer sandboxé avec `contextIsolation: true` et toutes les variantes de
  `nodeIntegration` désactivées ;
- preload réduit à un bridge IPC sémantique ; chaque appel est refusé si le
  sender, la frame principale ou son URL ne correspondent pas exactement à la
  fenêtre locale attendue ;
- navigation, nouvelles fenêtres, WebView, permissions et téléchargements
  refusés dans la fenêtre native ;
- sélection explicite d’un dossier par le dialogue natif ;
- lecture bornée de son seul `package.json` avant toute action ;
- chemin canonique conservé comme autorité par le processus principal ;
  l’interface peut l’afficher mais ne peut pas fournir un autre chemin au
  lancement ;
- présentation du script `dev`, consentement obligatoire et relecture avant
  exécution ;
- exécution fixe de `npm --ignore-scripts run dev`, sans `predev`, `postdev` ni
  commande shell arbitraire venant de l’interface ;
- arrêt limité au processus lancé par Revaloop et à ses descendants ;
- cible de preview limitée à `127.0.0.1`, `localhost` ou `::1` ;
- probe HTTP local court dans Electron (`HEAD`, puis `GET` seulement si le
  serveur refuse `HEAD`) ; le fallback Tauri se limite à vérifier la connexion
  TCP et ne prouve pas qu’une page web valide répond ;
- logs en mémoire et masquage des lignes potentiellement sensibles ;
- détection d’une installation locale de `cloudflared`, sans téléchargement,
  compte Cloudflare, jeton ou configuration persistée par Revaloop ;
- confirmation native et checklist de sécurité obligatoires à chaque création
  d’un Quick Tunnel, puis URL limitée à `https://*.trycloudflare.com` ;
- arrêt du tunnel avec le projet, la fenêtre ou l’application, et révocation
  manuelle disponible à tout moment ;
- transfert de l’URL au dashboard via le fragment de `/connect-preview`, puis
  stockage transitoire dans `sessionStorage` jusqu’au préremplissage ;
- ouverture du dashboard, du login et de la preview dans le navigateur système,
  où restent les cookies web ;
- configuration locale limitée au chemin du projet et à des URL non secrètes ;
- fuses de distribution configurés pour interdire notamment RunAsNode,
  `NODE_OPTIONS`, l’inspection CLI et le chargement hors ASAR.

Cette première alpha reste un compagnon développeur : elle ne stocke aucun
credential Revaloop et n’affiche pas les retours dans sa fenêtre native. Le
tunnel ne donne pas de session API au desktop ; l’URL est remise au dashboard
dans le navigateur, où le développeur la confirme puis crée l’invitation
cliente. Les actions « connexion » et « retours » ouvrent également l’instance
web configurée. Le client continue d’utiliser le site sans rien installer.

Le Quick Tunnel n’est pas « privé » : toute personne qui connaît son URL peut
atteindre directement la preview tant qu’il reste actif. Revaloop exige donc une
confirmation explicite, mais ne peut pas détecter ni isoler automatiquement la
base d’un projet arbitraire. Réservez-le à une fixture ou à un environnement de
test sans secret, données réelles ni service de production. Pour une vraie
recette, préférez un staging isolé ou un tunnel nommé protégé par un contrôle
d’accès compatible avec l’iframe.

Le runtime Tauri 2 historique reste maintenu comme fallback de compatibilité
pour la SPA, mais il n’offre pas encore l’autorité du chemin dans le processus
principal, la vérification HTTP de la preview ni la confirmation native à usage
unique d’Electron. Son probe ouvre seulement une connexion TCP loopback et il ne
démarre aucun tunnel. Utilisez `desktop:dev` pour lancer un projet ; ce chemin
Electron accélère aussi la boucle
locale sans installation ni réinstallation d’un binaire. Voir
[ADR-0006](docs/adr/0006-electron-development-runtime.md).

Le compagnon fournit `HOST=127.0.0.1` au processus, mais le script du projet
peut ignorer cette variable et choisir lui-même une autre interface réseau.
Vérifiez le message d’écoute de votre framework avant d’utiliser une application
ou une base sensible. Revaloop retire les options Node/Electron qui pourraient
modifier implicitement l’exécution, mais transmet les autres variables ambiantes
utiles au projet : lancez-le depuis un terminal qui ne contient aucun secret
inutile.

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
| `GET /api/workspace?project=…&release=…` | développeur | charge un projet et une version autorisés, avec leur historique |
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
ne prouve pas l’identité de la personne qui utilise le lien. Un e-mail de suivi
peut être renseigné, mais Revaloop ne le vérifie pas et n’envoie aucun message.

Les routes d’authentification développeur limitent les tentatives par compte et
adresse réseau. Revaloop ne fournit pas encore de vérification d’e-mail, de
réinitialisation de mot de passe ni de second facteur : l’opérateur doit donc
conserver un accès sûr à l’adresse et au mot de passe initialisés.

## Brancher une vraie preview

Revaloop attend une URL HTTPS dédiée, sans identifiant, mot de passe ni query
string. Elle peut provenir d’un staging ou, pour un essai contrôlé, du Quick
Tunnel créé par le compagnon Electron. Cette URL reste directement accessible
selon les règles de la preview : Revaloop ne lui ajoute ni authentification, ni
confidentialité. La preview doit utiliser :

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

Si un Quick Tunnel redémarre, son hostname change. L’action « Remplacer l’URL »
met alors à jour atomiquement l’adresse et `preview_revision` sur la release
active : la session cliente, les messages et les retours restent rattachés au
même espace. Le développeur doit confirmer ce remplacement ; le compagnon ne
modifie jamais la release silencieusement.

## Ce qui reste à construire

| Capacité | Statut |
|---|---|
| Partager `localhost` par Quick Tunnel | alpha Electron implémentée |
| CLI `revaloop share` | non implémentée |
| Compagnon desktop local | alpha implémentée |
| Tunnel nommé protégé et relais maîtrisé | non implémentés |
| Build ou hébergement intégré de previews | non implémenté |
| Captures et pièces jointes | non implémentées |
| Notifications e-mail/Slack/GitHub | non implémentées |
| Discussion générale release client ↔ développeur | implémentée |
| Fils de discussion attachés à chaque retour | non implémentés |
| Historique navigable de toutes les releases | implémenté dans le projet actif |
| Auto-hébergement hors Sites | non qualifié ; à documenter et tester |
| Vérification d’e-mail, reset de mot de passe et MFA | non implémentés |
| OIDC générique, PostgreSQL et S3 | prévus |
| TLS passthrough de bout en bout | recherche |

L’URL de preview reste mutable sur une release active : Revaloop journalise le
fait qu’elle a changé et incrémente sa révision, mais ne prouve ni son contenu ni
le commit réellement servi.
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

Compagnon desktop Electron
├── SPA locale sur revaloop://app en build empaqueté
├── renderer sandboxé + preload/IPC minimal et vérifié
├── dossier choisi, autorité du chemin dans le processus principal
├── lancement explicite du seul script dev
├── logs éphémères et test loopback
├── Quick Tunnel cloudflared optionnel, public et révocable
└── transfert du lien vers le dashboard dans le navigateur système

Fallback Tauri 2
└── même SPA, backend historique sans parité de sécurité avec Electron

Preview HTTPS tierce ou Quick Tunnel
└── chargée directement par le navigateur, jamais proxifiée par le site Revaloop
```

Le processus `cloudflared` constitue un data plane local séparé du site. Voir
[Architecture](docs/ARCHITECTURE.md) et le
[guide du premier pilote](docs/FIRST_CLIENT_PILOT.md).

## Développement local — site

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

Sur Sites, l’identité transmise par l’ingress n’est acceptée pour reprendre un
espace historique que si le hostname de la requête correspond exactement à
`REVALOOP_TRUSTED_SITES_HOSTNAME`. Sans variable, le dépôt utilise l’origine
Sites officielle de cette instance comme valeur par défaut.

Lors de la migration d’une instance 0.2 contenant déjà un espace, initialisez
le credential avec l’adresse e-mail exacte du compte développeur historique.
Si l’ancien compte porte un placeholder `@revaloop.local`, le déploiement Sites
privé peut le reprendre avec l’adresse authentifiée de son propriétaire.
Revaloop refuse les autres identités au lieu de créer silencieusement un second
tenant vide. Gardez l’instance en accès propriétaire pendant cette reprise.

Le binding D1 local se nomme `DB`. Le repository crée les tables manquantes
pour le développement et les mêmes évolutions sont versionnées dans
`drizzle/`.

Pour un test d’intégration sans toucher à la base locale habituelle, choisissez
un répertoire d’état jetable :

```bash
REVALOOP_LOCAL_STATE_PATH=.wrangler/test-state npm run dev
```

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
mutations, la validation JSON et le serveur de fixture du pilote.

## Développement local — application desktop

Le runtime principal de développement est Electron. Node.js et npm suffisent
après l’installation des dépendances du dépôt :

```bash
npm ci
npm run desktop:dev
```

Cette commande compile le processus principal et le preload, démarre le renderer
Vite sur l’origine fixe `http://127.0.0.1:1420/`, puis ouvre Electron. Relancez
la commande après une modification du processus principal ou du preload ; les
changements du renderer suivent la boucle Vite sans installation d’application.

Dans la fenêtre Revaloop :

1. choisissez un dossier dont le `package.json` racine déclare un script
   `dev` — il s’agit d’une sélection locale, pas d’un téléversement ;
2. vérifiez le script affiché ;
3. confirmez explicitement son exécution ;
4. lancez le projet ;
5. conservez `http://127.0.0.1:3000` ou indiquez son vrai port ;
6. installez vous-même `cloudflared` si le diagnostic le demande ;
7. créez le lien temporaire après avoir confirmé la checklist native ;
8. vérifiez la preview puis utilisez « Continuer dans Revaloop » pour préremplir
   le projet ou remplacer l’URL de la release active ;
9. créez enfin une invitation Revaloop : c’est ce lien d’invitation, et non
   l’URL brute du tunnel, que vous transmettez normalement à la cliente.

Sur macOS, l’installation manuelle la plus simple est
`brew install cloudflared`. Sur Windows, utilisez
`winget install Cloudflare.cloudflared`.
Revaloop n’installe rien silencieusement et n’enregistre aucun jeton Cloudflare.

Validation et build local :

```bash
npm run desktop:check
npm run desktop:build
npm run desktop:pack
npm run desktop:dist
```

`desktop:build` compile les assets ; `desktop:pack` crée une application
décompressée pour la QA locale ; `desktop:dist` produit les installateurs de la
plateforme courante. Ceux de cette alpha ne sont ni signés ni notariés : ils
conviennent à une vérification locale, pas à une distribution publique. La
première préversion téléchargeable exige des pipelines de signature par OS et
une notarisation macOS.

Le runtime Tauri 2 reste disponible pour la compatibilité et la comparaison de
runtimes. Il exige Rust stable, Cargo et les outils natifs de la plateforme :

```bash
npm run desktop:tauri:dev
npm run desktop:tauri:check
npm run desktop:tauri:build
```

Ce backend historique relit bien `package.json` et borne la cible locale, mais
le renderer lui transmet encore le chemin au lancement et aucune confirmation
native indépendante n’est demandée. Ne l’utilisez pas pour exécuter un dépôt
non fiable ; le chemin recommandé reste `npm run desktop:dev`.

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

- [Premier pilote réel sur fixture isolée](docs/FIRST_CLIENT_PILOT.md)
- [Guide du pilote](docs/PILOT_GUIDE.md)
- [Politique de sécurité](SECURITY.md)
- [Modèle de menace](docs/THREAT_MODEL.md)
- [Cycle de vie des données](docs/DATA_LIFECYCLE.md)
- [Modèle conceptuel des données](docs/DATABASE_MCD.md)
- [Première distribution desktop](docs/DESKTOP_RELEASE.md)
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
