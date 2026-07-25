# ADR-0002 — Échanger une invitation opaque contre une session

- **Statut de la décision :** accepté
- **Statut d’implémentation :** implémenté dans l’alpha 0.2
- **Date :** 24 juillet 2026
- **Mise à jour :** 25 juillet 2026

## Contexte

La cliente ne doit pas créer de compte. Un bearer token dans le chemin ou la
query apparaît dans l’historique, les logs, les captures et parfois le
referrer. Un PIN court seul n’a pas assez d’entropie.

## Décision

Créer un secret aléatoire de 32 octets :

```text
https://revaloop.example/join#token=<secret>
```

Le flux est :

1. le fragment reste côté navigateur au premier `GET` ;
2. `/join` le lit puis remplace immédiatement l’URL par `/join` ;
3. un `POST` same-origin envoie le secret ;
4. le serveur compare son SHA-256 au hash D1 ;
5. un batch conditionnel crée la session, marque l’invitation utilisée et
   écrit l’audit ;
6. si la session ne peut pas être créée, l’invitation n’est pas consommée ;
7. le serveur renvoie un cookie opaque `Secure`, `HttpOnly`,
   `SameSite=Strict`, sans `Domain` ;
8. la session expire au plus tôt entre l’invitation et 24 heures ;
9. le navigateur rejoint `/review/[releaseId]`, sans secret dans l’URL.

Le secret brut :

- n’est rendu qu’une fois au développeur ;
- n’est jamais stocké ;
- n’apparaît ni dans l’audit, ni dans les métadonnées projet ;
- devient inutilisable après échange ;
- est révoqué lors d’une rotation ou d’une action explicite du développeur.

Une nouvelle release ne peut pas être publiée tant que la courante non expirée
est `in_review` ou `changes_requested`. Après expiration, la publication
suivante révoque les anciens accès restants ; après approbation, la release est
déjà terminale et sa session ne permet plus aucune mutation.

## Autorisation

La session est liée à une invitation et une release. Chaque lecture vérifie :

- hash de session ;
- correspondance session/invitation/release ;
- trois expirations ;
- deux états de révocation.

Chaque mutation refait la vérification dans son SQL final afin qu’une
révocation concurrente coupe aussi une écriture déjà commencée.

La session permet uniquement checklist, retours, revalidation et décision. Elle
n’accorde aucun accès au dashboard.

Le développeur saisit un nom affiché lors de l’invitation. Le serveur le porte
dans la session et l’utilise comme auteur, sans authentifier la personne qui
possède le lien. L’interface fournie ne demande aucune adresse e-mail cliente.
L’API conserve un champ e-mail nullable pour compatibilité avec un client
personnalisé, mais il n’accorde aucun droit.

## Déconnexion

« Fermer cette session » met `reviewer_sessions.revoked_at` à jour côté serveur,
écrit un audit sans secret puis efface le cookie. Effacer uniquement le cookie
n’aurait pas suffi contre une copie volée.

## Conséquences positives

- aucun bearer secret dans la requête initiale ;
- aucune valeur brute en D1 ;
- rejeu refusé ;
- révocation indépendante ;
- parcours cliente sans compte ;
- échange atomique ;
- auteur déterminé côté serveur.

## Coûts et risques

- JavaScript requis sur `/join` ;
- le bearer link est transférable avant son premier usage ;
- un script compromis sur `/join` pourrait lire le fragment ;
- une session de 24 h implique de recréer une invitation après expiration ;
- le nom déclaré ne prouve pas l’identité de la personne ;
- un e-mail éventuellement fourni par un client API personnalisé ne la prouve
  pas davantage ;
- un déploiement globalement privé empêche une cliente extérieure d’accéder à
  `/join`.

## Alternatives écartées

- **Token dans le chemin ou la query :** exposition inutile aux intermédiaires.
- **PIN seul :** espace de recherche insuffisant.
- **Compte reviewer obligatoire :** friction contraire au premier produit.
- **JWT non révocable :** incompatible avec la rotation immédiate recherchée.

## Vérification

La suite automatise génération, hash, attributs du cookie, origine et
non-divulgation sans session. Le pilote doit encore maintenir des tests
d’intégration D1 couvrant double échange, expiration, rotation et révocation
concurrente.
