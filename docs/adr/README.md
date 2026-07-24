# Registre des décisions d’architecture

Les Architecture Decision Records décrivent une décision et ses compromis.
Ils ne prouvent pas que la décision est déjà implémentée.

| ADR | Statut | Sujet |
|---|---|---|
| [0001](0001-review-plane-first.md) | accepté, prototype partiel | construire le review plane avant le tunnel |
| [0002](0002-reviewer-authentication.md) | proposé, non implémenté | invitation opaque échangée contre une session |
| [0003](0003-tls-termination-modes.md) | proposé, non implémenté | distinguer terminaison TLS et passthrough |

Statuts possibles :

- **proposé** ;
- **accepté** ;
- **remplacé** ;
- **abandonné**.

Une modification structurante ajoute un ADR ou remplace explicitement une
décision existante.
