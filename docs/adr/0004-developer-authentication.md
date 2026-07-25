# ADR-0004 — Gérer le compte développeur dans Revaloop

- **Statut de la décision :** accepté
- **Statut d’implémentation :** implémenté dans l’alpha 0.3, validation pilote en cours
- **Date :** 25 juillet 2026

## Contexte

Le dashboard doit fonctionner comme une vraie application, sans dépendre d’une
identité injectée par un hébergeur particulier. Une instance nouvellement
déployée doit pouvoir créer son propriétaire, puis fermer l’inscription avant
d’exposer les liens clients.

L’alpha reste volontairement plus petite qu’un système complet de gestion
d’identité : elle ne propose encore ni vérification d’adresse e-mail, ni reset
de mot de passe, ni MFA.

## Décision

Revaloop gère un credential first-party par utilisateur :

- adresse e-mail normalisée et nom affiché ;
- mot de passe de 12 à 128 caractères ;
- sel aléatoire de 16 octets ;
- PBKDF2-SHA-256 avec Web Crypto et 600 000 itérations ;
- dérivé de 256 bits stocké avec le sel et le coût ;
- aucun mot de passe brut conservé après la requête.

Une connexion valide émet un token opaque aléatoire. Seul son SHA-256 est
stocké dans `developer_sessions`. Le navigateur reçoit un cookie
`__Host-revaloop_developer` en production avec `Secure`, `HttpOnly`,
`SameSite=Strict`, `Path=/`, sans `Domain`, pour 30 jours au maximum. La
déconnexion révoque la session côté serveur.

Les erreurs de connexion ne distinguent pas compte absent et mauvais mot de
passe. Une dérivation factice réduit l’écart de traitement, et des limites de
débit s’appliquent par compte et adresse réseau.

## Bootstrap

`/register` est ouvert seulement tant qu’aucun credential développeur n’existe.
Le contrôle est refait dans l’écriture D1 qui crée utilisateur, organisation,
membership propriétaire et credential.

Sur une base issue de la version 0.2, un utilisateur et son organisation
peuvent déjà exister sans credential first-party. Le bootstrap ne rattache le
credential qu’à l’adresse historique correspondante. Une autre adresse est
refusée au lieu de créer un tenant vide et de rendre l’espace historique
inaccessible. La reprise doit se faire derrière l’accès propriétaire de
l’hébergeur ; un changement d’adresse exigera plus tard un secret opérateur ou
une procédure de migration dédiée.

L’opérateur peut autoriser des inscriptions supplémentaires avec :

```text
REVALOOP_ALLOW_REGISTRATION=true
```

Ce drapeau est un choix explicite d’exploitation. Il ne fournit ni invitation,
ni allowlist, ni validation d’adresse ; une instance fermée doit le laisser
désactivé.

## Conséquences positives

- fonctionnement indépendant de l’identité de l’hébergeur ;
- frontière d’authentification testable dans le dépôt ;
- secrets de session révocables et jamais stockés en clair ;
- installation d’une instance vide sans manipulation directe de D1 ;
- inscription fermée par défaut après initialisation.

## Coûts et risques

- le premier accès à `/register` sur une base vide est sensible ;
- perte du mot de passe sans procédure self-service de récupération ;
- une adresse saisie n’est pas vérifiée ;
- absence de MFA et d’alerte de connexion ;
- durée de session de 30 jours en cas de navigateur compromis ;
- l’opérateur doit protéger sauvegardes, variables et accès D1 ;
- l’activation de l’inscription publique augmente immédiatement la surface
  d’abus et le nombre de tenants.

## Alternatives écartées pour l’alpha

- **Identité fournie par l’ingress :** couplage à un hébergeur et
  comportement différent entre preview et production.
- **OIDC générique immédiat :** configuration et matrice de fournisseurs trop
  larges pour ce jalon.
- **Lien magique par e-mail :** nécessite un fournisseur d’envoi, une
  réputation de domaine et un nouveau cycle de secrets.
- **Session JWT non révocable :** incompatible avec une déconnexion serveur et
  une révocation immédiate.

## Conditions de réévaluation

Avant une disponibilité générale, évaluer :

- vérification d’adresse et reset de mot de passe ;
- MFA ou passkeys ;
- gestion et révocation de toutes les sessions ;
- invitations ou allowlist pour ajouter des développeurs ;
- OIDC pour les organisations ;
- paramètres PBKDF2 réévalués selon les runtimes et recommandations du moment.
