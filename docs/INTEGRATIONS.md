# API d’intégration v1

Cette API additive relie un espace de travail interne à un projet Revaloop sans partager les sessions navigateur, invitations clientes ou bases de données. Revaloop reste utilisable seul. La première intégration est VisionBuild.

## Créer une connexion

Dans le dashboard développeur, choisir le projet puis **Connecter un outil**. Donner un nom, une expiration (7, 30 ou 90 jours) et choisir lecture seule ou autorisation des actions développeur. Copier le jeton affiché une seule fois dans le serveur de l’outil connecté. Il est limité à ce projet, conservé uniquement sous forme SHA-256 côté Revaloop et révocable depuis le même écran. Le propriétaire de l’organisation peut révoquer toutes les connexions du projet ; un développeur uniquement les siennes.

Le jeton donne accès aux informations de recette partagées : nom/description du projet, versions, retours, messages et décisions. Aucun mot de passe, secret d’invitation, cookie, e-mail reviewer ou donnée CRM n’est exporté. Les corps de retours et messages peuvent néanmoins contenir des données personnelles saisies par les utilisateurs : l’outil destinataire doit les traiter comme du contenu externe non fiable.

## Contrat HTTP

Routes serveur à serveur, sans CORS permissif, avec `Authorization: Bearer <jeton>`. HTTPS est attendu en exploitation ; HTTP loopback est destiné au développement. Les cookies seuls ne donnent jamais accès à cette API. Un en-tête Origin présent doit correspondre exactement à Revaloop.

- `GET /api/integrations/v1/capabilities` : `apiVersion: "1"`, `instanceId`, `organizationId`, `project: { id, name }`, `capabilities`.
- `GET /api/integrations/v1/projects` : même identité et un tableau contenant uniquement le projet autorisé.
- `GET /api/integrations/v1/projects/:id/snapshot` : identité, `project`, `version` opaque, `fetchedAt`, `releases`, `feedback`, `messages`, `decisions`, `limited`.
- `POST /api/integrations/v1/projects/:id/commands` : `{requestId, expectedVersion, command}`. `requestId` est un UUID ; `expectedVersion` vient du dernier snapshot relu par l’utilisateur.

Commandes actuellement disponibles :

```json
{
  "type": "feedback.transition",
  "feedbackId": "feedback_…",
  "status": "in_progress"
}
```

```json
{
  "type": "message.create",
  "releaseId": "release_…",
  "body": "Le correctif est prêt à vérifier."
}
```

Les seules transitions développeur sont `open → in_progress → to_review`. `resolved`, l’approbation finale, les invitations, nouvelles releases, publications de build et suppressions ne sont pas exposés par cette V1. Un message est **visible au client**, limité à 2 000 caractères et accepté seulement pour une release active/non expirée.

La réponse d’écriture contient `{requestId, alreadyApplied, result, snapshot}`. Réessayer exactement la même commande et la même version avec le même UUID renvoie le reçu sans duplication, même après un redémarrage ou une rotation du jeton pour le même développeur/projet. Réutiliser cet UUID pour un autre contenu est refusé. Une erreur 409 nécessite une actualisation/relecture ; l’outil ne doit pas contourner ce conflit en créant silencieusement un nouvel UUID. Une réponse réseau incertaine se reprend avec le même UUID.

Codes : 400 entrée invalide, 401 jeton inconnu/expiré/révoqué, 403 capacité ou origine refusée, 404 projet/ressource hors périmètre, 409 état obsolète/transition/conflit d’idempotence, 429 débit dépassé. Les réponses ne sont pas mises en cache.

## Cohérence et stockage

Migration additive `0005_typical_stephen_strange.sql` : identité d’instance persistante, compteur de révision par projet, jetons et reçus de commande. Elle inclut des triggers sur projets, releases, retours, messages et décisions ; les modifications depuis l’interface web invalident donc aussi les versions précédentes. Le bootstrap local applique les mêmes tables/triggers de manière idempotente. Appliquer la migration avec le mécanisme D1 habituel avant publication du code ; aucun déploiement automatique n’est effectué par le connecteur.

Le snapshot est lu dans un batch D1 cohérent. La version SHA-256 dérive de l’identité d’instance, du projet et de sa révision. La commande vérifie atomiquement cette révision, l’accès, l’expiration, le rôle et l’état métier, puis conserve son reçu et son audit dans le même batch. Les compteurs `meta.changes` de D1 incluent les écritures de triggers : les anciennes mutations ciblant une clé unique vérifient désormais qu’au moins une ligne a été modifiée, sans changer leurs prédicats d’accès.

Limites : 100 versions récentes, 1 000 retours et 1 000 messages de ces versions, 100 décisions. `limited: true` indique une liste partielle ; les enfants ne sont jamais retournés sans leur version. Ordre des collections : date décroissante puis identifiant décroissant. Les reçus sont conservés avec le projet, jusqu’à 10 000 commandes ; vingt connexions non expirées/révoquées au maximum sont créables par projet. Révoquer un jeton conserve les reçus. Supprimer un projet les supprime avec les autres données de recette.

Il n’y a pas encore de flux d’événements incrémental, webhook, synchronisation native du compagnon desktop ou système de builds immuables. Un connecteur local utilise des lectures sortantes de snapshots et indique sa dernière actualisation. Une validation Revaloop n’écrit pas automatiquement dans la comptabilité et ne prouve pas qu’une preview mutable correspond au commit déclaré.

## Vérification

`node --test tests/integrations.test.mjs tests/database-migrations.test.mjs` vérifie les migrations réelles dans SQLite en mémoire, les limites de projet, jetons, expiration/révocation, statuts, reçus et conflits. Le shim de test compte les écritures de triggers comme D1. Un test HTTP avec le runtime Worker/D1 local reste nécessaire avant livraison ; ces tests ne prouvent pas le déploiement distant.
