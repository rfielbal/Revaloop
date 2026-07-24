# ADR-0002 — Échanger une invitation opaque contre une session

- **Statut de la décision :** proposé
- **Statut d’implémentation :** non implémenté
- **Date :** 24 juillet 2026

## Contexte

Le client ne doit pas créer de compte. Un simple identifiant dans l’URL est
facile à partager, mais il apparaît dans l’historique, les logs, les captures
et parfois les referrers.

Le prototype actuel utilise `maison-matisse-v12` dans le chemin, le stocke en
clair et ne vérifie ni expiration ni révocation. Ce mécanisme est une fixture,
pas un modèle d’authentification.

Un PIN court seul n’apporte pas assez d’entropie et invite au brute force.

## Décision proposée

Créer une invitation avec un secret aléatoire de 32 octets :

```text
https://revaloop.example/join#token=<secret>
```

Le flux cible est :

1. le fragment reste côté navigateur et n’est pas envoyé avec le premier
   `GET` ;
2. la page `/join` lit le fragment ;
3. elle envoie le secret une seule fois par `POST` same-origin ;
4. le serveur compare son SHA-256 au hash stocké ;
5. il vérifie expiration, révocation et quota de sessions ;
6. il crée une session opaque ;
7. il renvoie un cookie `Secure`, `HttpOnly`, `SameSite=Lax` ;
8. le navigateur efface le fragment et redirige vers une URL sans secret.

Le secret brut :

- n’est jamais stocké en base ;
- n’est jamais journalisé ;
- n’est jamais inclus dans l’audit ou l’analytics ;
- n’est plus nécessaire après l’échange.

Un PIN peut être ajouté comme second facteur facultatif. Il n’est jamais
l’unique secret et doit être protégé par des limites de tentatives.

## Autorisation

La session reviewer est limitée à :

- une review room ;
- les releases explicitement visibles dans cette room ;
- les actions de commentaire et décision autorisées ;
- une durée ;
- aucun accès au dashboard.

La possession d’un identifiant de ressource ne remplace pas cette vérification.

## Conséquences positives

- le secret n’apparaît pas dans la requête initiale ou le referrer ;
- la base ne contient qu’un hash ;
- la session peut être révoquée séparément ;
- l’URL de navigation reste partageable sans continuer à transporter le
  secret ;
- le client conserve un parcours sans compte.

## Coûts et risques

- JavaScript requis sur `/join` ;
- le fragment peut être lu par un script compromis sur cette page ;
- le bearer link reste transférable avant son premier usage ;
- gestion supplémentaire des sessions et cookies ;
- nécessité d’un flux de récupération ou de nouvelle invitation ;
- le hash SHA-256 protège la base, mais un token réellement aléatoire reste
  indispensable.

## Alternatives écartées

### Token dans le chemin

Écarté : présence dans access logs, historique et outils intermédiaires.

### Token dans la query string

Écarté pour les mêmes raisons et pour le risque de referrer.

### PIN seul

Écarté : espace de recherche trop faible.

### Compte obligatoire pour le client

Écarté pour le premier produit : friction contraire à la proposition de
valeur. Il pourra devenir une option pour les environnements réglementés.

## Conditions d’acceptation

Cet ADR ne passe à « implémenté » qu’avec des tests couvrant :

- secret valide, invalide, expiré et révoqué ;
- absence du secret dans URL finale, logs et base ;
- rejeu de l’invitation ;
- révocation d’une session existante ;
- accès à une autre room ;
- limites de tentative du PIN optionnel ;
- cookies et protection des mutations.
