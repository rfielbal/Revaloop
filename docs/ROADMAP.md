# Feuille de route technique

- **Dernière mise à jour :** 24 juillet 2026
- **Principe :** aucune date sans capacité et aucun statut sans preuve

## Légende

- ✅ **Implémenté** : présent dans le dépôt et démontrable.
- 🧪 **Prototype** : parcours interactif, sans garantie de production.
- ⏳ **Prévu** : périmètre décidé, code absent.
- 🔬 **Recherche** : faisabilité ou compromis non tranché.
- 🚫 **Hors périmètre** : volontairement exclu de la phase.

Une fonctionnalité n’est terminée que si son code, ses tests, sa documentation
et ses limites sont fusionnés.

## État actuel — prototype 0.1

### Implémenté

- ✅ landing française ;
- 🧪 dashboard Maison Matisse ;
- 🧪 espace client interactif avec consignes ;
- 🧪 changement de viewport sur une surface simulée ;
- 🧪 marqueurs et création de retours ;
- 🧪 changement du statut d’un retour ;
- 🧪 approbation ou demande de modifications ;
- ✅ schéma et persistance D1 ;
- ✅ API de lecture et de mutation du jeu de démonstration ;
- ✅ rejet des liens inconnus ou expirés et transitions de statut bornées ;
- ✅ en-têtes HTTP défensifs ;
- ✅ robots `noindex` sur l’espace client ;
- ✅ smoke tests de rendu et contrôle schéma/migration.

### Non implémenté

- authentification et autorisation ;
- invitation secrète réelle ;
- révocation et rotation des invitations ;
- multi-projet et membres ;
- release réellement créée ou immuable ;
- preview externe ou capture ;
- stockage R2 ;
- tunnel, agent et relais ;
- isolation multi-tenant ;
- auto-hébergement ;
- tests métier, d’autorisation et d’accès croisé.

## Jalon 1 — rendre le review plane non public

**Objectif :** permettre un test contrôlé avec des données non sensibles.

- ⏳ authentification développeur derrière un adaptateur ;
- ⏳ modèle utilisateurs, organisations et membres ;
- ⏳ contrôles d’autorisation sur chaque route ;
- ⏳ invitation aléatoire de 32 octets stockée hachée ;
- ⏳ échange fragment→session→cookie ;
- ⏳ expiration, rotation et révocation effectives ;
- ⏳ protection d’origine et CSRF des mutations ;
- ⏳ rate limits, limites de taille et gestion des abus ;
- ⏳ audit minimal sans secret ;
- ⏳ tests IDOR et inter-projets ;
- ⏳ extension de la suite aux mutations, transitions et accès croisés ;
- ⏳ canal privé de vulnérabilité et contact de modération.

### Porte de sortie

- aucune route métier accessible sans identité ou session valide ;
- tous les tests d’accès croisé échouent comme attendu ;
- aucun token brut en base ou dans les logs ;
- révocation et expiration vérifiées côté serveur ;
- suppression des fixtures possible.

## Jalon 2 — véritable plan de validation

**Objectif :** gérer plusieurs projets et versions sans tunnel natif.

- ⏳ création et paramétrage de projets ;
- ⏳ releases numérotées et immuables après publication ;
- ⏳ changelog et référence Git facultative ;
- ⏳ cycles de review conservés par release ;
- ⏳ room client stable pointant vers la release courante ;
- ⏳ consignes et points à vérifier persistés ;
- ⏳ fils de discussion et réponses ;
- ⏳ décisions historisées ;
- ⏳ export Markdown ;
- ⏳ suppression et rétention configurables ;
- ⏳ événements d’audit ;
- ⏳ adaptateur `external` pour une URL HTTPS fournie manuellement ;
- ⏳ fallback lorsque l’iframe est bloquée.

### Limite assumée

Une URL externe peut changer sans que Revaloop le sache. Elle doit être
affichée comme **mutable** et ne constitue jamais une preuve de la version
validée.

## Jalon 3 — captures figées et stockage objet

**Objectif :** proposer une preuve visuelle réellement rattachée à une
release.

- ⏳ binding R2 et interface `ObjectStore` ;
- ⏳ upload explicite de captures ;
- ⏳ type, taille, dimensions et métadonnées contrôlés ;
- ⏳ bucket privé et route média autorisée ;
- ⏳ empreinte de contenu ;
- ⏳ annotation en coordonnées relatives ;
- ⏳ suppression de l’objet avec le retour ou la release ;
- ⏳ export des pièces jointes ;
- ⏳ quotas par projet.

### Hors périmètre

- 🚫 capture silencieuse ou continue ;
- 🚫 enregistrement vidéo ;
- 🚫 collecte de champs de formulaire.

## Jalon 4 — portabilité et auto-hébergement

**Objectif :** rendre le review plane déployable hors de la plateforme de
démonstration.

- ⏳ `ProjectRepository`, `ReviewRepository` et `ObjectStore` indépendants de
  Cloudflare ;
- ⏳ PostgreSQL comme base de référence ;
- ⏳ S3/MinIO comme stockage objet de référence ;
- ⏳ OIDC générique ;
- ⏳ migrations et seed explicites, sans bootstrap au runtime ;
- ⏳ Docker Compose documenté et testé ;
- ⏳ sauvegarde, restauration, purge et réversibilité ;
- ⏳ configuration des domaines, TLS et e-mail ;
- ⏳ guide de mise à jour et rollback ;
- ⏳ matrice des responsabilités opérateur/mainteneurs.

L’auto-hébergement ne passe à « implémenté » qu’après un test depuis une
machine vierge et une restauration de sauvegarde.

## Jalon 5 — agent et relais Revaloop

**Objectif :** résoudre le problème initial du partage d’un serveur local.

- ⏳ CLI `revaloop` ;
- ⏳ détection ou sélection explicite du port ;
- ⏳ agent Go ;
- ⏳ device flow avec le review plane ;
- ⏳ lease court lié à projet, release et port ;
- ⏳ connexion sortante mTLS ;
- ⏳ relais Go auto-hébergeable ;
- ⏳ routage HTTP et WebSocket ;
- ⏳ cible `127.0.0.1:<port>` par défaut ;
- ⏳ heartbeat et états online/offline ;
- ⏳ expiration et fermeture sous délai borné ;
- ⏳ quotas, timeout et backpressure ;
- ⏳ binaire signé, checksums et provenance ;
- ⏳ adaptateur `tunnel` dans le review plane.

### Porte de sortie

Un test end-to-end doit prouver :

1. démarrage d’une application locale fictive ;
2. ouverture du tunnel sans port entrant ;
3. navigation HTTP et WebSocket depuis un autre réseau ;
4. contrôle d’accès avant l’application ;
5. coupure effective après révocation ;
6. absence d’accès à une autre adresse du LAN ;
7. maintien des retours quand le poste devient hors ligne.

Avant cette porte, la phrase « partagez votre localhost » reste une vision.

## Jalon 6 — durcissement multi-tenant

**Objectif :** exploiter un service managé sans fuite entre projets.

- ⏳ séparation control plane/data plane ;
- ⏳ routage lié cryptographiquement au lease ;
- ⏳ origines et cookies sans portée wildcard dangereuse ;
- ⏳ quotas par organisation, projet et tunnel ;
- ⏳ tests de confusion de hostname et tunnel ;
- ⏳ rotation des clés et procédure de compromission ;
- ⏳ régions de données documentées ;
- ⏳ export, suppression et preuve de purge ;
- ⏳ observabilité sans contenu applicatif ;
- ⏳ revue de sécurité externe avant statut stable.

L’isolation logique n’est pas décrite comme une isolation par conteneur ou VM.

## Jalon 7 — previews hébergées

**Objectif :** conserver le même espace client pour une preview distante
durable.

- 🔬 runner éphémère rootless par release ;
- 🔬 filtrage réseau sortant ;
- 🔬 secrets à portée minimale ;
- 🔬 filesystem jetable ;
- 🔬 limites CPU, mémoire, disque et temps ;
- 🔬 destruction et audit de fin de vie ;
- 🔬 adaptateur `hosted`.

Cette phase exécute du code non fiable et nécessite un modèle de menace
spécifique avant tout prototype public.

## Recherche — TLS passthrough

Le mode « confidential passthrough » est une piste, pas un jalon promis.

Questions ouvertes :

- comment fournir un certificat reconnu par le navigateur sans exposer sa clé
  au relais ?
- comment associer un domaine stable à un agent éphémère ?
- comment authentifier le reviewer sans terminer HTTP à l’edge ?
- comment fournir le widget de review si le relais ne voit pas le contenu ?
- comment révoquer rapidement une session et son certificat ?

Une preuve de concept et un ADR mis à jour sont nécessaires avant toute date.

## Fonctions produit ultérieures

Après les fondations :

- plusieurs reviewers et rôles ;
- notifications ;
- retest et report explicite d’un fil ;
- intégrations GitHub, GitLab, Linear ou Trello ;
- domaines et marque agence ;
- i18n ;
- comparaison de releases ;
- règles de rétention avancées ;
- SSO et audit renforcé.

## Non-objectifs initiaux

- disponibilité 24/7 d’un poste local ;
- données de production ;
- application native ;
- co-navigation ;
- gestion de projet complète ;
- paiement réel ;
- capture vidéo ;
- intelligence artificielle ;
- proxy TCP ou réseau généraliste.

## Règle de gouvernance

À chaque release :

1. comparer ce document au code ;
2. déplacer uniquement les éléments prouvés ;
3. publier les limites connues ;
4. mettre à jour le modèle de menace ;
5. ne pas transformer une recherche en promesse marketing.
