# Politique de sécurité

## Statut

| Version | Support |
|---|---|
| `main` / `0.3.x` | alpha en cours, pilote contrôlé, corrections au mieux |
| version stable | aucune publiée |

L’alpha sécurise le review plane, mais elle n’est pas qualifiée pour des
données sensibles, réglementées ou une production critique. Utilisez une
preview et une base de test. Revaloop protège l’invitation et les retours ; il
ne rend pas privée l’URL de staging, qui doit avoir son propre contrôle d’accès.

## Signaler une vulnérabilité

Ne publiez jamais de secret, donnée personnelle, preuve de concept exploitable
ou vulnérabilité non corrigée dans une issue publique.

Utilisez **GitHub Private Vulnerability Reporting** dans l’onglet Security du
dépôt. Si ce bouton n’est pas disponible, ouvrez uniquement une issue sans
détail technique pour demander un canal confidentiel.

Indiquez :

- le commit ou la version ;
- la route et le scénario ;
- l’impact et les préconditions ;
- des étapes de reproduction minimales avec des données synthétiques ;
- toute mesure temporaire connue ;
- un moyen de contact.

Objectifs de réponse, sans engagement de niveau de service :

- accusé de réception sous 3 jours ouvrés ;
- première qualification sous 7 jours ouvrés ;
- point d’avancement au moins tous les 14 jours.

## Garanties implémentées

### Développeur

- authentification first-party Revaloop par e-mail et mot de passe ;
- PBKDF2-SHA-256 via Web Crypto, sel aléatoire de 16 octets et 600 000
  itérations pour les nouveaux mots de passe ;
- mot de passe limité à 12–128 caractères ;
- token de session opaque aléatoire, uniquement son SHA-256 en D1 ;
- cookie `__Host-revaloop_developer` en production, `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Path=/`, sans `Domain`, valable 30 jours ;
- révocation serveur lors de la déconnexion ;
- erreurs de connexion génériques et dérivation factice lorsqu’un compte
  n’existe pas ;
- limites de débit par adresse réseau et par compte ;
- inscription bootstrap ouverte uniquement tant qu’aucun credential
  développeur n’existe ;
- réouverture volontaire possible avec
  `REVALOOP_ALLOW_REGISTRATION=true` ;
- création d’un espace isolé par identité ;
- autorisation par organisation, projet, release et retour ;
- aucune route développeur accessible sans session Revaloop valide ;
- création, révocation, export et suppression contrôlés côté serveur.

Le mot de passe brut et le token de session brut ne sont jamais stockés en D1.
La session n’est pas glissante : elle expire au plus tard 30 jours après sa
création.

### Reviewer

- invitation aléatoire de 32 octets ;
- secret placé dans le fragment de `/join`, absent de la requête initiale ;
- uniquement le SHA-256 du secret en D1 ;
- consommation one-shot et création de session dans un même batch D1 ;
- cookie opaque `HttpOnly`, `Secure`, `SameSite=Strict`, sans `Domain` ;
- durée de session maximale de 24 heures ;
- expiration et révocation vérifiées à chaque lecture et dans la mutation
  finale ;
- auteur dérivé de la session, jamais fourni par le corps de la requête ;
- fermeture explicite qui révoque aussi la session serveur.

Le nom de session est saisi par le développeur lors de l’invitation puis recopié
côté serveur comme auteur. Il reste déclaratif : Revaloop ne vérifie pas
l’identité de la personne qui possède le lien. L’interface fournie ne collecte
plus d’adresse e-mail cliente. Le schéma et l’API conservent toutefois un champ
e-mail nullable pour compatibilité avec d’éventuels clients API personnalisés ;
ce champ n’est ni un facteur d’authentification ni un canal d’envoi.

### Mutations et données

- `Origin` exact obligatoire ;
- JSON uniquement, corps bornés, textes limités et listes fermées ;
- requêtes préparées ;
- limites de débit persistées dans D1 ;
- transition développeur et transition reviewer séparées ;
- séquence + insertion d’un retour atomiques ;
- une seule ligne de décision courante par release ;
- messages de release autorisés côté serveur selon la session développeur ou
  reviewer et leur release ;
- incrément de `preview_revision` réservé au développeur autorisé ;
- une demande d’ajustements peut être remplacée par un bilan ultérieur et ne
  clôt pas la release ;
- seule l’approbation est terminale ;
- approbation et absence de retour ouvert vérifiées dans la même transaction ;
- audits conditionnés à l’existence de la mutation ;
- aucune URL de preview avec credentials ou query string ;
- aucun cookie, champ ou contenu de page collecté par le bridge.

### Navigateur

- CSP avec `frame-ancestors 'none'`, `base-uri 'self'` et `form-action 'self'` ;
- `X-Frame-Options: DENY` ;
- `X-Content-Type-Options: nosniff` ;
- `Referrer-Policy: no-referrer` ;
- `Permissions-Policy` restrictive ;
- `Cache-Control: private, no-store` sur dashboard, join, review et API ;
- `noindex`, `nofollow`, `noarchive`, `nosnippet` sur les espaces privés.

### Compagnon desktop

- Electron est le runtime principal de développement ; Tauri 2 reste un
  fallback explicite, décrit dans
  [l’ADR-0005 historique](docs/adr/0005-desktop-companion.md) et
  [l’ADR-0006](docs/adr/0006-electron-development-runtime.md) ;
- assets React/Vite locaux ; un build empaqueté les sert en lecture seule par le
  scheme privilégié `revaloop://app`, avec contrôle du host, protection contre
  la traversée de chemin, CSP et en-têtes défensifs ;
- serveur Vite de développement accepté uniquement à l’origine exacte
  `http://127.0.0.1:1420/` ;
- sandbox Electron activée globalement et sur la fenêtre,
  `contextIsolation: true`, `nodeIntegration: false`,
  `nodeIntegrationInWorker: false`, `nodeIntegrationInSubFrames: false`,
  `webSecurity: true`, WebView désactivée et contenu mixte refusé ;
- preload réduit à un objet gelé de commandes sémantiques, sans exposition de
  `ipcRenderer`, Node, shell ou filesystem générique ;
- chaque invocation IPC vérifie l’identité exacte de la `webContents`, la
  `mainFrame` et son URL locale avant d’atteindre le handler ;
- nouvelles fenêtres, navigation hors origine, attachement de WebView,
  permissions et téléchargements refusés ;
- `package.json` borné à 1 Mio, script `dev` relu avant exécution ;
- le processus principal conserve le projet sélectionné comme autorité ; le
  renderer ne peut pas fournir un chemin au handler de lancement ;
- consentement explicite dans une boîte de dialogue native du processus
  principal avant chaque lancement, suivi d’une autorisation de dix secondes,
  à usage unique et liée au chemin et au script ;
- commande fixe exécutée sans shell, `npm --ignore-scripts run dev`, qui
  désactive `predev` et `postdev` ;
- variables de contrôle internes `NODE_OPTIONS`, `NODE_PATH`,
  `NPM_CONFIG_NODE_OPTIONS` et `ELECTRON_*` utilisées par Revaloop retirées
  avant de lancer le projet ;
- aucun argument shell ou nom de commande fourni par le renderer ;
- un seul processus géré, démarrages et arrêts sérialisés, puis arrêt de son
  groupe sur macOS/Linux ou de son arbre sur Windows ;
- preview restreinte à `127.0.0.1`, `localhost` ou `::1`, sans credentials,
  query ni fragment ;
- origine Revaloop en HTTPS, ou HTTP uniquement pour une instance loopback ;
- destinations externes en liste fermée, ouvertes dans le navigateur système ;
- aucun mot de passe, cookie, token développeur ou invitation dans l’app ;
- paramètres non secrets seulement, fichier local `0600` sur Unix ;
- chaque ligne de journal est nettoyée, limitée à 2 000 caractères et masquée
  si elle contient un marqueur sensible ; le processus principal cesse
  d’émettre après 20 000 événements et l’interface ne conserve que les 250
  dernières lignes en mémoire ;
- les artefacts Electron configurent des fuses interdisant RunAsNode,
  `NODE_OPTIONS`, l’inspection CLI et le chargement hors ASAR, avec validation
  d’intégrité ASAR et chiffrement des cookies activés ;
- aucun appel à l’API Revaloop, aucun token natif et aucun cookie web dans le
  runtime desktop ;
- tests TypeScript/Node des validateurs, frontières d’assets, destinations,
  projet, logs et configuration ; la suite Tauri/Rust reste disponible pour le
  fallback.

Le desktop n’est pas une sandbox pour le code du projet. Confirmer
la commande reste indispensable : même si Revaloop démarre npm avec
`shell: false`, npm exécute le contenu du script `dev` avec les droits de votre
compte système. Désactiver les hooks `predev` et `postdev` évite une exécution
adjacente implicite, mais ne transforme pas le projet en sandbox.
Les autres variables du processus restent disponibles au projet pour préserver
son environnement de développement : ne lancez donc pas Revaloop depuis un
terminal chargé de secrets dont ce projet n’a pas besoin.

Electron embarque Chromium et Node et possède donc une surface de dépendances
plus large que Tauri. Cette décision est temporaire et optimise la boucle de
développement sans réinstallation ; les frontières ci-dessus compensent ce
choix mais ne remplacent ni audit ni mises à jour rapides d’Electron. Aucun
binaire public ne doit être annoncé avant signature des artefacts, notarisation
macOS et vérification de provenance.

## Limites connues

- il n’existe pas encore de vérification d’adresse e-mail, de réinitialisation
  de mot de passe, de MFA, de clés de récupération ni d’interface de gestion
  des sessions développeur ;
- la première personne qui atteint `/register` sur une base vide peut devenir
  propriétaire de l’instance : initialisez le compte avant une ouverture
  publique ;
- `REVALOOP_ALLOW_REGISTRATION=true` ouvre volontairement l’inscription à toute
  personne qui atteint la route ; ne l’activez pas sur une alpha fermée ;
- la preview est une ressource tierce, mutable et directement chargée par le
  navigateur ; l’invitation Revaloop ne protège pas son URL, ses comptes, sa
  base ni ses services ;
- `frame-src https:` est nécessaire pour accepter des previews arbitraires :
  l’URL reste choisie par le développeur authentifié, mais une allowlist
  d’origines est préférable pour un déploiement fermé ;
- une preview peut refuser l’iframe ; Revaloop ne contourne ni
  `X-Frame-Options` ni `frame-ancestors` ;
- l’authentification embarquée peut échouer à cause des cookies tiers,
  `SameSite`, des politiques navigateur ou d’une redirection OAuth/SSO ;
- le sandbox autorise scripts, formulaires, modales et popups, mais pas la
  navigation du contexte supérieur ni les téléchargements ; certaines popups
  d’authentification restent incompatibles ;
- caméra, microphone, géolocalisation, paiement et USB sont désactivés par la
  `Permissions-Policy` Revaloop dans le contexte embarqué ;
- le bridge ne transmet que `pathname` et `document.title` : il ne transmet ni
  scroll, ni sélecteur DOM, ni ancre d’élément ;
- même avec le bridge, la position externe est approximative et ne suit pas le
  scroll interne ; sans bridge, le chemin ne suit pas non plus les navigations
  SPA ;
- les anciennes releases ne sont pas encore navigables dans le dashboard ;
  une nouvelle release est bloquée tant que la courante est active en
  `in_review` ou `changes_requested`, puis devient possible après approbation ou
  expiration ;
- D1 reste une base partagée avec isolation logique, pas une base par tenant ;
- le bootstrap runtime complète les migrations pour Sites ; une distribution
  auto-hébergée doit exécuter les migrations de façon contrôlée ;
- il n’existe ni pièce jointe, ni capture, ni stockage R2 ;
- les positions d’annotation sont des coordonnées de viewport ; aucune capture
  automatique, sélection DOM ou preuve visuelle immuable n’est produite ;
- le compagnon desktop local est implémenté, mais aucun agent de tunnel, relais
  ou partage distant de `localhost` ne l’est ;
- le desktop n’appelle pas encore l’API Revaloop : l’authentification reste dans
  le navigateur système ;
- aucune distribution desktop signée, notariée ou mise à jour automatiquement
  n’est publiée ;
- le filtre des logs repose sur des marqueurs connus et ne remplace pas
  l’interdiction de journaliser des secrets dans le projet ;
- `HOST=127.0.0.1` est fourni au script, mais un framework peut l’ignorer et
  écouter sur une interface LAN ; le compagnon borne sa propre cible, pas le
  comportement du code exécuté ;
- un poste ou un compte système déjà compromis peut lire les données et agir
  avec les droits de l’utilisateur ;
- aucun build, hébergement ou déploiement de preview n’est fourni ;
- le signalement d’une nouvelle `preview_revision` ne déploie pas la preview,
  n’isole pas sa base et ne prouve pas son contenu ;
- le rechargement conserve la même URL et ne garantit pas de contourner le
  cache HTTP, un CDN ou le Service Worker de la preview ;
- la suite automatisée vérifie les frontières HTTP et primitives, mais les
  scénarios de forte concurrence D1 doivent encore être élargis.

## Règles pour un pilote

- base et comptes de test uniquement ;
- services externes en mode sandbox ;
- aucun moyen de paiement, mot de passe de la preview ou donnée personnelle
  réelle dans les scénarios, consignes, messages ou retours ;
- protection d’accès du staging configurée indépendamment de Revaloop ;
- compatibilité testée pour iframe, authentification, cookies, OAuth/SSO,
  popups, téléchargements, paiement et caméra ; nouvel onglet utilisé dès qu’un
  parcours embarqué échoue ;
- invitation transmise sur un canal adapté ;
- révocation à la fin de la session ;
- suppression du projet lorsqu’il n’est plus nécessaire ;
- vérification contractuelle séparée si le projet exige un procès-verbal de
  recette formel.

Pour le compagnon desktop :

- inspectez le script `dev` avant de confirmer ;
- n’ouvrez qu’un dépôt de confiance et gardez ses dépendances à jour ;
- utilisez une URL loopback et une base locale ou de test ;
- ne collez aucun token dans l’URL du site ou de la preview ;
- arrêtez le projet depuis Revaloop avant de quitter ;
- ne distribuez pas le binaire alpha non signé à un client.

`noindex` n’est jamais un contrôle d’accès.

## Périmètre prioritaire des signalements

- IDOR ou accès croisé entre organisations/projets ;
- contournement du login Revaloop, du bootstrap d’inscription, de l’invitation,
  de l’expiration ou de la révocation ;
- vol, fixation ou non-révocation d’une session développeur ;
- rejeu ou fuite d’un secret ;
- session encore capable d’écrire après révocation ;
- approbation possible avec retour ouvert ;
- injection persistante dans un retour ;
- contournement de la CSP ou de l’origine ;
- audit contenant un secret ou décrivant une mutation inexistante ;
- suppression incomplète ;
- plus tard : SSRF, proxy ouvert, confusion de tunnel ou contournement mTLS.

Les failles propres à la preview tierce doivent être signalées à son
propriétaire, sauf si elles permettent de franchir une frontière Revaloop.

## Divulgation coordonnée

Nous demandons un délai raisonnable avant publication. Le projet s’engage à
traiter le signalement de bonne foi, limiter l’accès aux informations et
créditer la personne si elle le souhaite.

Cette politique n’autorise pas l’accès à des systèmes tiers, l’exfiltration,
l’interruption de service ou l’ingénierie sociale.
