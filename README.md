# Revaloop

Revaloop explore une manière plus simple de faire valider un site ou une
application web par une personne non technique : une version clairement
identifiée, des consignes, des retours positionnés et une décision explicite.

> [!WARNING]
> **Statut : prototype de démonstration, non destiné à la production.**
> Le dépôt contient un plan de revue interactif persisté dans Cloudflare D1.
> Il ne contient pas encore le tunnel réseau, l’agent local, une véritable
> authentification, des invitations secrètes hachées, une isolation
> multi-tenant ou une procédure d’auto-hébergement prête à l’emploi.
> N’y placez aucune donnée client réelle, donnée personnelle sensible,
> authentifiant ou secret.

## Ce qui fonctionne aujourd’hui

Le prototype présente un projet fictif, **Maison Matisse**, et permet de
parcourir toute une boucle de démonstration :

- une landing publique en français ;
- un tableau de bord développeur avec une version, des indicateurs et une boîte
  de retours ;
- un espace client sans création de compte dans lequel on peut suivre des
  consignes, changer de viewport, poser un marqueur et envoyer un retour ;
- quatre états de traitement d’un retour : signalé, en cours, à revalider et
  validé ;
- une décision finale : approbation ou demande de modifications ;
- une approbation bloquée tant que des retours restent à traiter ou à
  revalider ;
- un refus serveur des liens inconnus ou arrivés à expiration ;
- une persistance D1 pour les projets, releases, retours et décisions ;
- des API de prototype pour lire l’espace, ajouter un retour, enregistrer une
  décision et changer le statut d’un retour ;
- des smoke tests de rendu pour la landing, le dashboard et l’espace client,
  ainsi qu’un contrôle d’alignement schéma/migration ;
- des directives `noindex`, `nofollow`, `noarchive` et `nosnippet` sur
  l’espace client ;
- des en-têtes HTTP défensifs appliqués par le Worker : CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` et
  `Permissions-Policy`, isolation cross-origin, absence de cache sur les
  recettes et `X-Robots-Tag`.

Les pages actuellement disponibles sont :

| Route | Contenu |
|---|---|
| `/` | landing Revaloop |
| `/dashboard` | espace développeur de démonstration |
| `/review/maison-matisse-v12` | espace client interactif de démonstration |

Les routes d’API actuellement implémentées sont :

| Méthode et route | Effet |
|---|---|
| `GET /api/workspace` | lit l’espace de démonstration |
| `GET /api/review/[token]` | lit une release et ses retours |
| `POST /api/review/[token]` | crée un retour ou une décision |
| `PATCH /api/feedback/[id]` | modifie le statut d’un retour |

## Ce que le prototype ne fait pas

Cette distinction est contractuelle pour le projet : une fonction visible dans
une maquette ou citée dans la vision n’est pas considérée comme disponible.

| Capacité | Statut |
|---|---|
| Partager un serveur `localhost` | **Non implémenté** |
| CLI `revaloop share` | **Non implémentée** |
| Agent local et relais HTTP/WebSocket | **Non implémentés** |
| Preview externe réelle ou capture de page | **Non implémentée** |
| Authentification du développeur | **Non implémentée** |
| Invitation client sécurisée | **Non implémentée** |
| Expiration des accès de démonstration | **Implémentée** |
| Hashage, rotation et révocation des tokens | **Non implémentés** |
| PIN comme second facteur | **Non implémenté** |
| Comptes, membres, rôles et autorisation par projet | **Non implémentés** |
| Captures et pièces jointes R2 | **Non implémentées** |
| Fils de discussion | **Non implémentés** |
| Isolation multi-tenant | **Non implémentée** |
| Auto-hébergement documenté et testé | **Non implémenté** |
| TLS passthrough ou chiffrement de bout en bout | **Recherche future** |

Le token `maison-matisse-v12` est une donnée de démonstration publique, stockée
en clair et présente dans le code source. Le serveur refuse un token inconnu ou
expiré et exige que les changements d’état soient rattachés à la même release,
mais cela ne vérifie toujours ni l’identité ni l’autorisation réelle de
l’appelant. Le prototype ne doit donc pas être présenté comme un espace privé
ou sécurisé.

## Vision produit

À terme, Revaloop doit transformer une application locale en espace de
validation guidé :

```text
Développeur                    Client

revaloop share 3000            ouvre un lien stable
        │                       lit les consignes
        │                       teste la bonne version
        └── version privée ───> pose un retour contextualisé
                                approuve ou demande des changements
```

La promesse « de localhost au retour client, en une commande » reste une
**vision** tant qu’un agent et un relais audités ne réalisent pas ce flux de
bout en bout.

## Architecture actuelle

```text
┌─────────────────────────────────────────────────────────────┐
│ Application vinext sur Cloudflare Worker                    │
│                                                             │
│  landing       dashboard       espace client de démo        │
│                       │                  │                   │
│                       └──── API métier ──┘                   │
│                                  │                          │
│                           repository D1                     │
└──────────────────────────────────┬──────────────────────────┘
                                   │
                  projects · releases · feedback · decisions
```

L’espace client affiche une application de restaurant simulée directement
dans Revaloop. Il ne charge, ne capture et ne proxifie aucun site externe.

La trajectoire technique sépare volontairement :

- le **review plane**, chargé des projets, versions, consignes, retours et
  décisions ;
- le futur **data plane**, chargé du transport entre le navigateur et
  l’application locale.

Consultez :

- [Architecture](docs/ARCHITECTURE.md)
- [Modèle de menace](docs/THREAT_MODEL.md)
- [Cycle de vie des données](docs/DATA_LIFECYCLE.md)
- [Feuille de route](docs/ROADMAP.md)
- [Système de design](docs/DESIGN_SYSTEM.md)
- [ADRs](docs/adr/)

## Prérequis

- Node.js `>= 22.13.0`
- npm

## Développement local

```bash
npm ci
npm run dev
```

Le binding D1 local se nomme `DB`. Au premier appel d’API, le repository crée
les tables manquantes et injecte les données fictives Maison Matisse. Une
migration Drizzle équivalente est également versionnée.

Commandes utiles :

```bash
npm run lint
npm run typecheck
npm run build
npm test
npm run db:generate
```

La suite actuelle vérifie surtout le rendu serveur, les en-têtes de sécurité et
l’alignement entre schéma et migration. Elle ne démontre pas encore la sécurité
des mutations d’API, l’autorisation ou la résistance aux accès croisés.

## Données de démonstration

Toutes les données livrées dans le dépôt sont fictives. Conservez cette règle
pour les contributions :

- aucune base de production ;
- aucune capture d’un projet client ;
- aucun cookie, token ou mot de passe réel ;
- aucune adresse ou identité réelle sans consentement explicite.

Le projet n’offre actuellement ni export, ni suppression, ni rétention
automatique. Voir [Cycle de vie des données](docs/DATA_LIFECYCLE.md).

## Sécurité

Avant tout test :

- utilisez uniquement des données synthétiques ;
- considérez l’URL de démonstration comme publique ;
- n’exposez pas le prototype sur Internet avec des données réelles ;
- ne confondez pas `noindex` avec un contrôle d’accès.

Pour signaler une vulnérabilité, suivez [SECURITY.md](SECURITY.md) et ne
publiez pas de détails exploitables dans une issue.

## Contribuer

Les contributions sont bienvenues, en particulier sur les frontières
d’authentification, d’autorisation, de confidentialité et de portabilité.
Commencez par lire :

- [Guide de contribution](CONTRIBUTING.md)
- [Code de conduite](CODE_OF_CONDUCT.md)
- [Modèle de menace](docs/THREAT_MODEL.md)

Toute modification d’une frontière de confiance doit inclure un test et une
mise à jour du modèle de menace ou un ADR.

## Licence

Le code et la documentation sont distribués sous
[Apache License 2.0](LICENSE).

Le fichier `LICENSE` est la référence canonique.

Copyright 2026 Revaloop contributors.
