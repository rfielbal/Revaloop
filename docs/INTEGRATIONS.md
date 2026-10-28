# API d’intégration v1

L’API relie un espace interne, notamment VisionBuild, à Revaloop sans partager les sessions web ni les bases de données. Revaloop reste autonome. VisionBuild garde les clients, projets internes, notes privées et finances ; Revaloop reçoit uniquement les projets de recette, versions et informations explicitement partagées.

## Connexions

**Connecter mon espace**, dans la navigation développeur, crée un jeton d’organisation `rvo_…` pour retrouver les recettes et les gérer depuis un outil interne. L’option d’écriture autorise la création de projets/versions, les invitations, la mise à jour des previews, les messages et les transitions développeur. Elle ne donne jamais le rôle client.

**Connecter un outil**, dans un projet, conserve le jeton historique `rvi_…` limité à ce projet : lecture, puis messages/transitions si explicitement autorisés. Les anciens jetons ne gagnent aucune capacité supplémentaire.

Chaque jeton expire (7, 30 ou 90 jours), s’affiche une fois, est stocké uniquement sous forme SHA-256 et peut être révoqué depuis le même écran. Le propriétaire de l’organisation peut gérer toutes ses connexions ; un développeur seulement les siennes. Les routes web de gestion exigent une session développeur et conservent la vérification d’origine.

`POST /api/integrations/tokens` accepte `{scope:"organization",label,write,expiresInDays}` pour l’organisation, ou `{projectId,label,write,expiresInDays}` pour un projet. GET utilise `?scope=organization` ou `?project=…`. DELETE reprend le périmètre et `tokenId`. Le jeton brut ne doit être conservé que dans le stockage sécurisé du serveur destinataire.

## Lecture HTTP

Le serveur destinataire utilise `Authorization: Bearer <jeton>`, sans cookies ni CORS permissif. HTTPS est attendu en exploitation ; HTTP loopback sert aux tests locaux. Un en-tête Origin présent doit correspondre à Revaloop. Les réponses sont `private, no-store`.

- `GET /api/integrations/v1/capabilities` : `{apiVersion:"1",instanceId,organizationId,scope,project,capabilities}`. `project` vaut `{id,name}` pour un jeton projet, `null` pour une organisation.
- `GET /api/integrations/v1/projects` : identité, `version` opaque du catalogue, `projects:[{id,name,description}]`, `limited`. Le résultat reste limité à l’organisation autorisée, et au seul projet pour les anciens jetons.
- `GET /api/integrations/v1/projects/:id/snapshot` : identité, `project`, `version`, `fetchedAt`, `releases`, `feedback`, `messages`, `decisions`, `invitations`, `limited`.

Chaque release expose aussi `reviewerMessage` et `testItems:[{id,title,description,position}]`. Chaque invitation expose `{id,releaseId,reviewerName,expiresAt,revokedAt,usedAt}`. Aucun secret d’invitation, cookie, mot de passe ou e-mail reviewer n’apparaît dans les snapshots. Le contenu partagé peut contenir des données personnelles et reste du contenu externe non fiable pour un assistant.

## Écriture HTTP

Toutes les commandes utilisent `{requestId,expectedVersion,command}`. `requestId` est un UUID conservé pour les retries. `expectedVersion` vient de la dernière lecture présentée à l’utilisateur.

`POST /api/integrations/v1/commands`, avec la version du **catalogue** et les capacités organisation `projects:write` et `releases:write`, accepte :

```json
{
  "type": "project.create",
  "name": "Site du client",
  "description": "Périmètre partagé",
  "release": {
    "version": "v1",
    "title": "Première recette",
    "commitSha": "abc123",
    "previewUrl": "https://staging.example.com/",
    "reviewerMessage": "Vérifiez le formulaire de contact.",
    "expiresInDays": 14,
    "testItems": [
      {
        "title": "Envoyer un message",
        "description": "Une confirmation apparaît."
      }
    ]
  }
}
```

`release` est réutilisé pour `release.create` ; expiration entre 1 et 30 jours, 12 points à vérifier au maximum, URL HTTPS sans identifiants intégrés. Créer une release nécessite que la précédente soit approuvée ou expirée ; son numéro doit être unique pour ce projet.

`POST /api/integrations/v1/projects/:id/commands`, avec la version du **snapshot projet**, accepte :

| Commande              | Paramètres                                                                                        | Capacité            |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| `release.create`      | `release`                                                                                         | `releases:write`    |
| `invitation.create`   | `releaseId`, `reviewerName`, `reviewerEmail` (string ou null), `expiresInDays`, `replaceExisting` | `invitations:write` |
| `invitation.revoke`   | `releaseId`                                                                                       | `invitations:write` |
| `preview.update`      | `releaseId`, `previewUrl` optionnelle                                                             | `preview:write`     |
| `feedback.transition` | `feedbackId`, `status`                                                                            | `feedback:write`    |
| `message.create`      | `releaseId`, `body`                                                                               | `messages:write`    |

Seules les transitions `open → in_progress → to_review` sont autorisées. La résolution, la décision finale, les suppressions et les builds immuables ne sont pas exposés. Un message est **visible au client**, limité à 2 000 caractères. `preview.update` incrémente la révision de preview mais ne change pas le commit déclaré ni ne prouve son contenu.

La réponse est `{requestId,alreadyApplied,result,snapshot}`. Le résultat de création de projet/release contient `projectId` et `releaseId`.

### Invitation : secret fourni une seule fois

La première réponse réussie à `invitation.create` contient `result.invitePath`, un chemin `/join#token=…` à résoudre avec l’origine Revaloop validée. Le secret n’est jamais écrit dans le reçu D1, les audits ou les snapshots. Un replay renvoie les mêmes identifiants et `result.secretUnavailable:true`, sans régénérer ni révoquer de lien. Après une perte de réponse, l’utilisateur doit demander explicitement un remplacement : nouvelle commande, nouvelle version relue, `replaceExisting:true`.

`replaceExisting:false` refuse une invitation active existante. `true` révoque les anciennes invitations et sessions de cette release dans la même transaction. `invitation.revoke` révoque aussi les sessions. L’API n’envoie aucun e-mail ; le partage du lien relève d’une action distincte dans l’outil destinataire.

### Idempotence et conflits

Même UUID, version et contenu : reçu durable sans duplication, y compris après rotation du jeton pour le même développeur. Un UUID réutilisé autrement est refusé. Une réponse réseau incertaine se reprend avec le même UUID. Un conflit 409 demande une actualisation et une relecture ; aucun nouvel UUID ne doit être généré silencieusement pour contourner le conflit.

Codes : 400 entrée invalide, 401 jeton invalide/expiré/révoqué, 403 capacité/origine refusée, 404 ressource hors périmètre, 409 version/état/idempotence, 429 débit, 503 indisponibilité.

## Migrations et limites

Appliquer les migrations additives `0005_typical_stephen_strange.sql` puis `0006_steep_snowbird.sql` avant publication du code avec le mécanisme D1 prévu par l’hébergeur. La 0006 ajoute les jetons, révisions et reçus d’organisation et une vue d’authentification unifiée ; elle ne recrée ni ne vide les tables existantes. La migration 0006 ne contient aucun seed ni backfill. Les organisations existantes reçoivent leur première révision par une écriture de données bornée lors de la première lecture authentifiée du catalogue. Aucun DDL supplémentaire n’est exécuté dans les requêtes ; le bootstrap historique reste inchangé.

Les mutations projets/releases/retours/messages/décisions/invitations/instructions alimentent les révisions projet et organisation, y compris depuis l’interface web. Le heartbeat d’une session ne modifie pas ces révisions. Les commandes vérifient atomiquement révision, accès, expiration et état métier, puis enregistrent reçu, mutations et audit dans un même batch D1. Les changements comptés par D1 incluent les triggers.

Limites de lecture : 200 projets, 100 versions récentes, 1 000 retours, 1 000 messages, 100 décisions, 1 000 invitations et 1 200 points à vérifier. `limited:true` signale une lecture partielle ; les enfants ne sont pas retournés sans leur version. Collections par date décroissante puis ID décroissant ; points à vérifier par position. Limites de stockage : 20 jetons actifs par périmètre, 10 000 reçus par projet et par organisation. Révoquer conserve les reçus.

Pas encore de webhook, flux incrémental, connexion automatique Electron, validation comptable ni garantie de build immuable. Un connecteur sortant affiche sa dernière actualisation.

## Vérification

`npm test` compile puis exécute les tests applicatifs et le pilote. Les tests d’intégration utilisent les vraies migrations SQLite et un adaptateur comptant les écritures de triggers comme D1 : limites d’accès, compatibilité des anciens jetons, révocation, créations concurrentes, conflits, statuts, secrets d’invitation et replays. Le parcours HTTP local doit aussi vérifier le runtime Worker/D1 et les sessions client distinctes ; ces vérifications locales ne prouvent pas le déploiement distant.
