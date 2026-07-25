# Cycle de vie des données

- **Version :** alpha 0.3 en cours
- **Dernière vérification :** 25 juillet 2026

## Résumé

Revaloop conserve les métadonnées nécessaires à une recette, pas le trafic de
la preview. Le développeur peut exporter une recette en Markdown et supprimer
un projet complet. Les données opérationnelles expirées sont purgées de façon
opportuniste.

Cette politique technique ne remplace ni un registre de traitement, ni un
contrat, ni un avis juridique.

## Données publiques du dépôt

`lib/revaloop.ts` contient la démonstration fictive Maison Matisse :

- projet et release synthétiques ;
- noms fictifs ;
- retours fictifs ;
- identifiant `maison-matisse-v12`.

Ces valeurs sont publiques. `/demo` ne lit et n’écrit aucune donnée réelle.

## Données D1

| Catégorie | Données | Finalité |
|---|---|---|
| identité développeur | e-mail, nom affiché, dernière activité | connexion et autorisation |
| credential développeur | dérivé PBKDF2-SHA-256, sel, coût, dates | vérifier le mot de passe sans le stocker en clair |
| session développeur | hash du token, activité, expiration, révocation | autoriser le dashboard et ses API |
| organisation/membre | nom d’espace, rôle | isolation |
| projet | nom, description, slug, dates | classement |
| release | version, titre, commit déclaré, URL HTTPS, message, `preview_revision`, dates | cible de recette et signal de mise à jour |
| consigne optionnelle | titre, description, ordre | suggérer une vérification sans bloquer l’exploration |
| invitation | hash, nom reviewer déclaratif, e-mail API nullable, expiration, usage, révocation | créer l’accès |
| session | hash, nom reviewer, activité, expiration, révocation | autoriser la recette |
| retour | texte libre, métadonnées techniques, chemin, titre, viewport, position, auteur, dates | collaboration contextualisée |
| message de release | rôle et nom auteur, texte, date, références auteur nullable | discussion client-développeur |
| décision courante | état, note, auteur, date | demander des ajustements ou clôturer par approbation |
| audit | acteur interne, action, ressource, métadonnées minimales, date | sécurité |
| rate limit | clé contenant un hash tronqué, compteur, expiration | limiter l’abus |

Le secret d’invitation et les tokens de session développeur ou reviewer ne sont
jamais stockés en clair. Le mot de passe développeur est reçu uniquement pour
l’inscription ou la connexion puis dérivé avec Web Crypto ; D1 ne conserve que
le dérivé PBKDF2, le sel et le nombre d’itérations.
Le nom reviewer est saisi par le développeur et ne prouve pas l’identité de la
personne qui utilise le lien. L’interface fournie ne collecte plus d’e-mail
reviewer. L’API et le schéma conservent un champ nullable pour compatibilité
avec des clients personnalisés ; s’il est alimenté, il ne déclenche aucun envoi
et ne prouve pas davantage l’identité.

## Données locales du compagnon desktop

Le runtime Electron principal ne lit ni D1, ni les cookies du navigateur, ni un
token API. Il n’appelle actuellement aucune API Revaloop. Son processus
principal conserve dans le dossier de configuration de l’application :

| Donnée | Finalité | Rétention |
|---|---|---|
| chemin canonique du projet | retrouver le dossier choisi | jusqu’au changement, à la suppression du fichier ou de l’app |
| URL loopback de preview | tester et ouvrir le port local explicite | même règle |
| origine du site Revaloop | ouvrir `login` ou `dashboard` dans le navigateur | même règle |

Ces valeurs sont sérialisées dans `settings.json`. Sur Unix, le fichier reçoit
le mode `0600`. Ce ne sont pas des secrets, mais le chemin peut révéler un nom
de client : utilisez un nom de dossier neutre si cette métadonnée est sensible.

Le chemin sélectionné est canonisé et reste l’autorité du processus principal.
Le renderer peut l’afficher, mais le handler de démarrage n’accepte aucun chemin
fourni par l’interface : il réutilise le projet détenu dans le main puis relit
son manifeste.

Le nom, la version et le script `dev` du `package.json` sont lus à la demande et
gardés seulement dans la mémoire de l’application. Le manifeste est limité à
1 Mio et n’est pas copié dans le fichier de configuration.

Les sorties standard et erreur du processus ne sont pas persistées. Dans le
main Electron, chaque ligne est nettoyée et limitée à 2 000 caractères ; une
ligne contenant un marqueur courant de cookie, authorization, token, secret ou
mot de passe est remplacée entièrement. Le main cesse d’émettre après 20 000
événements par lancement et l’interface ne garde que les 250 dernières lignes,
oubliées à la fermeture ou lorsque l’utilisateur les efface. Ce filtre réduit
le risque mais ne garantit pas qu’un secret inhabituel soit reconnu : un projet
de test ne doit pas écrire ses credentials dans ses logs.

L’identifiant du processus existe uniquement en mémoire pendant son exécution.
La fermeture de Revaloop tente d’arrêter ce processus et son groupe sur Unix,
ou son arbre de processus sur Windows.

## Données non collectées

Revaloop ne conserve pas :

- mot de passe développeur en clair ;
- moyen de paiement ;
- cookie de la preview ;
- valeur de champ ou contenu DOM ;
- corps ou header du trafic applicatif ;
- query string de la preview ;
- capture automatique ou fichier ;
- vidéo ou audio ;
- donnée R2 ;
- trafic d’un serveur local.

Le bridge facultatif transmet uniquement `pathname` et `document.title`. Il ne
transmet ni scroll, ni ancre d’élément, ni sélecteur DOM. Le repère visuel reste
donc approximatif, y compris avec instrumentation.

L’adresse réseau peut être utilisée momentanément pour le rate limiting par
l’infrastructure. Le modèle métier ne la conserve pas ; D1 reçoit une empreinte
tronquée associée à une fenêtre courte.

## Flux

```mermaid
flowchart LR
    auth["Compte et session Revaloop"] --> api["API Revaloop"]
    developer["Saisie développeur"] --> api
    reviewer["Saisie reviewer"] --> api
    api --> d1[("D1")]
    d1 --> dashboard["Dashboard"]
    d1 --> review["Espace reviewer"]
    preview["Preview tierce"] -. "path + title" .-> review
    desktop["Compagnon desktop"] --> config["Configuration locale sans secret"]
    desktop -->|"ouvre"| dashboard
    desktop -->|"stdout/stderr en mémoire"| local["Projet local"]
```

La preview tierce est directement chargée dans le navigateur. Son opérateur et
ses sous-traitants ont leur propre cycle de données, indépendant de Revaloop.
L’invitation protège les données de revue, pas l’accès au staging ni les données
saisies dans celui-ci.

## Expiration et rétention

| Donnée | Règle actuelle |
|---|---|
| invitation | 1 à 14 jours dans l’UI, jamais au-delà de la release |
| session reviewer | au plus 24 heures |
| session développeur | autorisation au plus 30 jours ; ligne expirée ou révoquée purgée après 30 jours supplémentaires |
| release `in_review` ou `changes_requested` non expirée | bloque la publication d’une nouvelle release |
| release active expirée | accès déjà invalide ; passée à `superseded` et révoquée lors de la publication suivante |
| release approuvée | terminale ; une nouvelle release peut ensuite être publiée |
| bucket de rate limit | supprimé après expiration |
| session/invitation opérationnelle ancienne | purge après 30 jours lorsqu’aucune décision ne la retient |
| audit | purge après 365 jours |
| projet, release, retour, décision | jusqu’à suppression du projet |
| message de release | jusqu’à suppression du projet |
| utilisateur/organisation | pas encore de suppression self-service |
| configuration desktop | jusqu’à suppression manuelle du fichier ou de l’app |
| logs et PID desktop | mémoire uniquement, oubliés à la fermeture |

La maintenance s’exécute au bootstrap d’un isolate. Ce n’est pas un cron à
heure garantie : une instance inactive peut conserver les données plus
longtemps jusqu’au prochain accès.

Une release conserve une seule ligne de décision courante. Une demande
`changes_requested` peut être remplacée par un bilan ultérieur ; `approved` est
terminal. La décision conserve le nom déclaratif de son auteur même si la
référence de session est ensuite supprimée. Cette dénormalisation préserve la
lisibilité de la recette sans authentifier cette personne.

## Export

Le dashboard génère un fichier Markdown local contenant :

- projet et release ;
- URL déclarée et statut ;
- chaque retour, son contexte et son état ;
- décision éventuelle ;
- date de l’export.

Le fichier est construit dans le navigateur. Revaloop ne stocke pas une copie
supplémentaire de cet export. Dans l’alpha 0.3, la discussion générale et le
compteur `preview_revision` ne sont pas encore inclus dans cet export.

## Suppression

Le propriétaire peut supprimer un projet depuis le dashboard. D1 supprime en
cascade :

- releases ;
- consignes et complétions ;
- invitations et sessions ;
- retours ;
- messages de discussion ;
- décisions.

L’audit organisationnel peut subsister jusqu’à sa rétention avec les références
de projet/release mises à `NULL`. Il ne doit contenir ni secret ni corps de
commentaire.

Il n’existe pas encore :

- de suppression d’un retour isolé ;
- de suppression de compte/organisation self-service ;
- de preuve cryptographique de suppression ;
- de contrôle utilisateur des sauvegardes de l’hébergeur ;
- de reset de mot de passe, vérification d’e-mail ou MFA.

Ces limites doivent être évaluées avant toute donnée personnelle réelle.

## Logs

Les erreurs inattendues sont envoyées à `console.error` avec un message
générique. Le code ne journalise volontairement ni secret, cookie, corps de
retour, e-mail reviewer ni URL avec query.

Le compagnon desktop n’écrit aucun log applicatif sur disque. Son panneau
terminal reçoit uniquement la sortie du processus local et applique les limites
décrites plus haut. Les logs de compilation Electron/Vite, npm, du fallback
Tauri/Rust ou du système d’exploitation lancés en dehors de l’app suivent leur
propre configuration.

L’opérateur Sites/Cloudflare peut produire ses propres logs techniques selon
sa configuration. L’entité qui déploie l’instance doit documenter région,
accès, sauvegarde et sous-traitants.

## Captures futures

Si R2 est ajouté :

- bucket privé ;
- consentement avant chaque capture ;
- prévisualisation avant envoi ;
- contrôle du contenu réel, MIME, taille et dimensions ;
- suppression des métadonnées inutiles ;
- identifiant non dérivé d’un nom client ;
- accès par route autorisée ou URL signée courte ;
- suppression de l’objet avec le retour ;
- quota par organisation.

Les captures automatiques en arrière-plan restent hors périmètre.

## Futur tunnel

Le mode managé pourra exposer le trafic au relais après terminaison TLS. Par
défaut, aucun corps, cookie, header d’autorisation ou contenu de formulaire ne
devra être stocké.

Seules des métriques en liste fermée pourront être conservées : identifiant
interne, code agrégé, volume, durée et erreur de transport sans URL sensible.

## Checklist pour une nouvelle donnée

- Pourquoi est-elle nécessaire ?
- Qui peut la lire et la modifier ?
- Où et dans quelle région réside-t-elle ?
- Est-elle copiée dans un log, audit, export ou backup ?
- Quelle est sa durée ?
- Comment l’exporter et la supprimer ?
- Est-elle transmise à un tiers ?
- Quel test prouve l’autorisation ?
- Le modèle de menace et le contrat sont-ils à jour ?
