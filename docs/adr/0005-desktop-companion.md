# ADR-0005 — Séparer le compagnon desktop du site et du tunnel

- **Statut :** accepté
- **Date :** 25 juillet 2026

## Contexte

Le site Revaloop porte aujourd’hui le compte développeur, les invitations,
retours, messages et décisions dans un Worker vinext avec D1. Il repose sur des
cookies `HttpOnly`, `SameSite=Strict` et une vérification d’origine exacte.

Une application desktop est utile pour agir sur le projet local, mais le build
web est un Worker SSR et non une SPA statique. L’embarquer comme contenu distant
dans une WebView privilégiée mélangerait en plus une origine réseau avec des
capacités natives.

Enfin, rendre `localhost` accessible au client exige un relais public et un
protocole de tunnel. Une fenêtre desktop seule ne supprime pas ce besoin.

## Décision

Revaloop adopte trois frontières explicites :

1. le **site web** reste le plan de revue et le parcours client sans
   installation ;
2. un **compagnon Tauri 2** embarque une SPA locale distincte et ne charge
   aucune origine distante dans sa fenêtre privilégiée ;
3. le futur **data plane** utilisera un agent et un relais séparés pour
   transporter une cible loopback explicitement autorisée.

La première alpha desktop :

- choisit un dossier avec le sélecteur natif ;
- lit uniquement un `package.json` borné avant toute action ;
- affiche le script `dev` et exige une confirmation explicite ;
- exécute exactement `npm --ignore-scripts run dev`, sans hooks npm adjacents
  ni chaîne shell fournie par le renderer ;
- conserve et arrête uniquement le processus qu’elle a lancé ;
- teste seulement une URL loopback normalisée ;
- ouvre la preview et le plan de revue dans le navigateur système ;
- garde les logs en mémoire, masque les lignes potentiellement sensibles et ne
  les écrit pas sur disque ;
- ne stocke que le chemin du projet et des origines non secrètes dans un fichier
  local protégé par les permissions du compte système.

Elle n’embarque aucun token, ne réutilise pas les cookies du navigateur et
n’ajoute aucune API native. La CSP interdit les frames et les capacités Tauri
restent limitées à la fenêtre locale et au choix de dossier.

## Authentification native future

Une future API desktop ne devra ni retirer la vérification `Origin` des routes
web, ni ouvrir CORS, ni copier le cookie développeur.

Le client natif utilisera le navigateur système avec Authorization Code et PKCE
S256, un callback loopback exact, un code court et one-shot, puis des tokens
appareil opaques, hachés côté serveur, courts et révocables. Le refresh token
rotatif restera dans le coffre du système d’exploitation et ne sera jamais
exposé au renderer JavaScript.

Les routes natives seront versionnées, sans CORS, avec des commandes Rust
sémantiques. Il n’existera pas de commande générique `fetch(url)` ou
`execute(command)`.

## Conséquences

- le client conserve le lien web et n’a rien à installer ;
- le desktop apporte une valeur locale réelle sans prétendre partager
  `localhost` ;
- l’UI web et l’UI desktop restent deux applications à valider ;
- un backend partagé reste nécessaire pour collaborer à distance ;
- le tunnel, les tokens appareil, la signature et la mise à jour sécurisée
  restent des jalons séparés ;
- un binaire distribué devra être signé et, sur macOS, notarié.

## Options écartées

### Charger le site distant dans Tauri

Cette option ne fournirait qu’un wrapper et rapprocherait du contenu réseau des
capacités système. Elle ne résout ni l’authentification native, ni le tunnel.

### Embarquer directement le build vinext

Le build est un Worker SSR avec D1, pas un ensemble d’assets statiques
autonomes.

### Relâcher CORS ou SameSite

Cette option affaiblirait la protection du site pour adapter un nouveau client.
Le canal natif doit posséder son propre contrat d’authentification.

### Electron

Electron faciliterait une UI TypeScript mais embarquerait Chromium et Node alors
que l’agent réseau futur devra de toute façon être fortement isolé. Tauri offre
des capacités explicites et un backend Rust adapté à ce rôle.
