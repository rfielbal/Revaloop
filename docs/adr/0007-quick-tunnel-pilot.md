# ADR-0007 — Utiliser un Quick Tunnel tiers pour le premier pilote

- **Statut :** accepté, alpha limitée au pilote contrôlé
- **Date :** 2 août 2026
- **Complète :** [ADR-0001](0001-review-plane-first.md),
  [ADR-0005](0005-desktop-companion.md) et
  [ADR-0006](0006-electron-development-runtime.md)

## Contexte

Le review plane fonctionne autour d’une preview HTTPS, mais un développeur qui
ne possède qu’un serveur loopback ne peut pas encore faire tester son projet à
distance. Construire immédiatement un relais Revaloop authentifié, stable et
multi-tenant demanderait des leases, une identité d’appareil, du routage, des
quotas, une politique de logs et un cycle de révocation qui dépassent le premier
pilote.

Cloudflare Quick Tunnel fournit une URL HTTPS aléatoire sans compte ni token.
Cette facilité a une contrepartie importante : l’URL est publique, non durable,
gérée par un tiers et sans contrôle d’accès Revaloop. Elle ne doit donc pas être
présentée comme un tunnel privé ou une solution de production.

## Décision

Le runtime Electron peut lancer une installation locale de `cloudflared` pour
exposer uniquement l’URL loopback déjà gérée par le compagnon. Revaloop ne
télécharge pas le binaire, ne l’installe pas, n’utilise aucun token et n’écrit
aucune configuration Cloudflare.

Chaque création exige une confirmation native et une checklist non persistée :
comptes fictifs, base isolée, services externes en sandbox et absence de secrets
de production. Le processus principal relit la cible après le consentement,
valide la disponibilité locale puis démarre `cloudflared` avec un environnement
minimal. Seule une URL racine `https://*.trycloudflare.com` est acceptée.

Le compagnon ne transmet pas automatiquement cette URL à une API. Il ouvre
`/connect-preview#url=…` dans le navigateur système. Le fragment est supprimé,
l’adresse reste temporairement dans `sessionStorage`, puis le développeur la
confirme dans le dashboard. Une release active peut remplacer atomiquement son
URL et incrémenter `preview_revision` sans perdre la session, les messages ou
les retours de la cliente.

La cliente reçoit normalement l’invitation Revaloop, pas l’URL brute du tunnel.
Cette invitation protège la revue mais ne protège toujours pas la preview.

## Invariants obligatoires

- aucune URL distante, commande ou option `cloudflared` fournie par le renderer ;
- cible locale loopback, sans credentials, query ni fragment ;
- consentement natif à chaque tunnel, jamais mémorisé ;
- environnement subprocess en allowlist et aucun secret Cloudflare ;
- logs drainés, bornés et masqués ; URL publique absente du journal UI ;
- arrêt manuel possible et arrêt automatique avec le projet, la fenêtre ou
  l’application ;
- statut d’erreur explicite si le processus ne confirme pas son arrêt ;
- documentation disant « public et temporaire », jamais « privé » ;
- fixture non sensible fournie pour le premier parcours reproductible.

## Conséquences

- un développeur peut mener un premier essai distant sans VPS ni upload du code ;
- la machine, le serveur local et `cloudflared` doivent rester actifs ;
- un redémarrage produit un nouveau hostname, que le dashboard doit confirmer ;
- Cloudflare transporte le trafic et peut voir le HTTP après terminaison TLS ;
- Revaloop ne peut pas détecter une DB de production, un secret dans le projet
  ou un service externe mal configuré ;
- aucune garantie de disponibilité, hostname stable, WebSocket exhaustif,
  Server-Sent Events ou contrôle d’accès n’est annoncée ;
- Tauri reste sans cette capacité tant que ses frontières natives n’atteignent
  pas la parité Electron.

## Porte de remplacement

Le Quick Tunnel ne devient pas l’architecture définitive. Il sera remplacé pour
les usages réels par un staging protégé ou par un data plane Revaloop possédant
au minimum identité d’appareil, lease courte liée au projet, contrôle d’accès,
hostname maîtrisé, révocation immédiate, quotas, politique de logs, tests SSRF
et procédure de distribution signée.
