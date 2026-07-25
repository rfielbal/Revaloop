# Registre des décisions d’architecture

Les Architecture Decision Records décrivent une décision et ses compromis.
Ils ne prouvent pas que la décision est déjà implémentée.

| ADR | Statut | Sujet |
|---|---|---|
| [0001](0001-review-plane-first.md) | accepté, review plane externe implémenté | construire le review plane avant le tunnel |
| [0002](0002-reviewer-authentication.md) | accepté, implémenté en 0.2 et étendu en 0.3 | invitation opaque échangée contre une session |
| [0003](0003-tls-termination-modes.md) | proposé, non implémenté | distinguer terminaison TLS et passthrough |
| [0004](0004-developer-authentication.md) | accepté, implémenté en 0.3 | compte et session développeur first-party |
| [0005](0005-desktop-companion.md) | accepté, compagnon local implémenté | séparer le desktop, le site et le tunnel |

Statuts possibles :

- **proposé** ;
- **accepté** ;
- **remplacé** ;
- **abandonné**.

Une modification structurante ajoute un ADR ou remplace explicitement une
décision existante.
