# ADR-0003 — Distinguer terminaison TLS et passthrough

- **Statut de la décision :** proposé
- **Statut d’implémentation :** non implémenté
- **Date :** 24 juillet 2026

## Contexte

Le futur relais recevra le trafic d’un navigateur et le transmettra à un agent
local. Dire seulement « le trafic utilise HTTPS » ne précise pas quel
composant voit les requêtes en clair.

Le contrôle d’accès HTTP, l’injection d’un bridge, la normalisation des headers
et un éventuel WAF exigent généralement une terminaison TLS au relais. À
l’inverse, réduire la confiance accordée à l’opérateur exige que le relais ne
possède pas les clés permettant de lire le trafic.

Ces deux objectifs ne doivent pas être confondus.

## Décision proposée

Définir deux modes avec des propriétés distinctes.

### `managed-review`

```text
navigateur ──TLS──> relais ──mTLS──> agent ──HTTP──> localhost
```

- TLS public termine au relais ;
- l’opérateur du relais peut lire le trafic HTTP ;
- l’accès reviewer peut être appliqué à l’edge ;
- le relais peut intégrer un bridge ou modifier des headers ;
- aucun corps, cookie ou header d’autorisation n’est journalisé ;
- l’interface indique que le trafic est lisible par l’opérateur.

### `confidential-passthrough`

```text
navigateur ───────── TLS de bout en bout ────────> agent
                         relais opaque
```

- la terminaison TLS a lieu dans l’agent ;
- le relais route les octets selon SNI ou un mécanisme équivalent ;
- le relais ne lit pas le HTTP ;
- pas d’authentification HTTP, WAF ou injection au relais ;
- le contrôle d’accès et le widget exigent un autre mécanisme ;
- la distribution des certificats reste à concevoir.

Le mode `managed-review` appartient à la trajectoire produit. Le mode
`confidential-passthrough` reste une recherche jusqu’à preuve de concept.

## Invariants de communication

- ne jamais qualifier `managed-review` de chiffrement de bout en bout ;
- préciser l’emplacement de la terminaison ;
- distinguer chiffrement en transit et confidentialité vis-à-vis de
  l’opérateur ;
- publier les métadonnées conservées ;
- ne pas promettre le passthrough avant résolution du cycle de certificats.

## Conséquences positives

- propriétés de sécurité compréhensibles ;
- threat model propre à chaque mode ;
- arbitrage explicite entre inspection et confidentialité ;
- possibilité d’un relais minimal pour les environnements sensibles ;
- réduction du risque de déclaration marketing trompeuse.

## Coûts et risques

- deux protocoles ou capacités à maintenir ;
- UX différente selon le mode ;
- perte du widget et du contrôle d’accès edge en passthrough ;
- gestion de certificats complexe sur un agent éphémère ;
- compatibilité incertaine avec domaines stables et navigateurs ;
- le passthrough ne protège pas contre une application locale compromise.

## Alternatives écartées

### Présenter les deux modes comme équivalents

Écarté : propriétés et responsabilités différentes.

### Chiffrer seulement le lien relais-agent

Utile en mode managé, mais insuffisant pour cacher le contenu au relais.

### Partager la clé privée publique avec le relais et l’agent

Écarté : annule l’objectif de confidentialité et augmente le rayon de
compromission.

## Questions ouvertes

- émission et renouvellement des certificats ;
- compatibilité ACME ;
- domaine stable ou domaine par session ;
- révocation lors de l’arrêt du tunnel ;
- authentification reviewer avant le handshake ;
- feedback sans injection edge ;
- routage SNI sans réattribution dangereuse d’un hostname.

## Conditions de réévaluation

Une preuve de concept navigateur, une analyse de certificats et un test de
révocation sont nécessaires avant de convertir le passthrough en jalon de
livraison.
