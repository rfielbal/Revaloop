# Politique de sécurité

## Statut du projet

Revaloop est actuellement un prototype de démonstration. Aucune version n’est
considérée comme suffisamment durcie pour traiter des données client réelles
ou être exposée comme un service de production.

| Version | Support de sécurité |
|---|---|
| `main` / `0.1.x` | expérimental, correction au mieux |
| version stable | aucune publiée |

Une version devient supportée uniquement lorsqu’elle est explicitement
référencée dans ce tableau.

## Signaler une vulnérabilité

Ne publiez pas de vulnérabilité exploitable, de token, de donnée personnelle ou
de preuve de concept offensive dans une issue publique.

Le dépôt public devra activer **GitHub Private Vulnerability Reporting** avant
sa première release. Le canal attendu sera :

1. ouvrir l’onglet **Security** du dépôt ;
2. choisir **Report a vulnerability** ;
3. fournir les informations demandées ci-dessous.

Tant que ce canal privé n’est pas visible, ouvrez seulement une issue publique
sans détail technique demandant un moyen de contact confidentiel. L’absence
d’un canal privé opérationnel est un bloqueur de release, pas une invitation à
divulguer publiquement.

Merci d’indiquer :

- la version ou le commit concerné ;
- le composant, la route et le scénario ;
- l’impact estimé ;
- les préconditions nécessaires ;
- des étapes de reproduction minimales, sans donnée tierce ;
- toute mesure temporaire connue ;
- un moyen de vous recontacter.

## Délais visés

Ces délais sont des objectifs de collaboration et non un engagement de niveau
de service :

- accusé de réception sous 3 jours ouvrés ;
- première qualification sous 7 jours ouvrés ;
- point d’avancement au moins tous les 14 jours pendant l’analyse ;
- calendrier de correction et de divulgation convenu avec la personne ayant
  signalé le problème.

Le projet ne propose actuellement aucun programme de prime.

## Périmètre prioritaire

Les signalements suivants sont particulièrement importants :

- lecture ou modification non autorisée d’un projet, d’une release, d’un
  retour ou d’une décision ;
- contournement futur d’une authentification, d’une expiration ou d’une
  révocation ;
- exposition d’un token dans une URL, un log, un audit ou une télémétrie ;
- accès croisé entre projets ou utilisateurs ;
- injection persistante dans les retours ;
- contournement de la CSP ou d’une frontière d’origine ;
- modification d’une décision ou d’une version supposée immuable ;
- fuite d’une capture ou d’une pièce jointe ;
- plus tard : SSRF via l’agent, transformation en proxy ouvert, détournement
  d’un lease, contournement mTLS ou confusion de routage entre tunnels.

Les vulnérabilités propres à une application tierce simplement présentée dans
Revaloop doivent être signalées à son propriétaire. Une faille permettant à
cette application de franchir une frontière Revaloop reste, elle, dans le
périmètre.

## Garanties actuelles

Le prototype applique actuellement :

- une Content Security Policy au niveau du Worker ;
- `X-Content-Type-Options: nosniff` ;
- `Referrer-Policy: no-referrer` ;
- `X-Frame-Options: DENY` et `frame-ancestors 'none'` ;
- une `Permissions-Policy` restrictive ;
- des limites de longueur et des listes fermées sur plusieurs champs d’API ;
- un rendu React qui encode le texte des retours ;
- une page client marquée `noindex`, `nofollow`, `noarchive` et `nosnippet`.

Ces mécanismes réduisent certains risques. Ils ne constituent pas une
authentification ou une autorisation.

## Limites de sécurité connues

Dans l’état actuel :

- le dashboard et les API ne vérifient pas l’identité du développeur ;
- le token de démonstration est fixe, public, stocké en clair et présent dans
  le chemin de l’URL ;
- ce token n’est ni haché, ni rotatif, ni échangé contre un cookie de session ;
- l’expiration bloque l’accès mais n’efface pas les données ;
- aucune révocation n’existe ;
- les mutations ne vérifient pas encore `Origin` et n’emploient pas de
  protection CSRF dédiée ;
- l’API de mise à jour vérifie le token de la release, mais pas l’identité de la
  personne qui le possède ;
- aucune limite de débit, détection d’abus ou journalisation d’audit n’existe ;
- D1 n’est pas isolé par tenant ;
- aucun mécanisme de suppression, d’export ou de rétention n’est disponible ;
- R2 et les captures ne sont pas implémentés ;
- aucun tunnel ou trafic d’application externe ne traverse Revaloop.

Par conséquent :

- considérez toute URL de review actuelle comme publique ;
- n’utilisez que des données fictives ;
- ne déployez pas le prototype pour un client réel ;
- n’utilisez jamais `noindex` comme contrôle d’accès.

Le détail et les mesures prévues sont maintenus dans
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Conditions minimales avant une release utilisable

Une première release destinée à de vrais projets devra au minimum apporter :

- une authentification développeur indépendante du mode de démonstration ;
- une autorisation systématique par projet et par ressource ;
- un token reviewer de 32 octets aléatoires, stocké uniquement sous forme
  hachée ;
- un échange ponctuel du secret contre un cookie opaque `Secure`, `HttpOnly`
  et expirant ;
- expiration, révocation et rotation effectives ;
- vérification d’origine et protection CSRF des mutations ;
- limites de débit et de taille ;
- tests d’accès croisé et de transition d’état ;
- suppression et durée de conservation ;
- logs expurgés des cookies, secrets, corps et paramètres sensibles ;
- un canal privé de signalement testé.

Le futur agent et le futur relais auront leur propre revue de sécurité avant
de pouvoir exposer un serveur local.

## Divulgation coordonnée

Nous demandons de laisser au projet un délai raisonnable pour analyser,
corriger et publier une version sûre avant toute divulgation. En retour, les
mainteneurs s’engagent à :

- traiter le signalement de bonne foi ;
- limiter l’accès aux informations fournies ;
- créditer la personne à l’origine du signalement si elle le souhaite ;
- expliquer les arbitrages et le statut de la correction.

Cette politique n’autorise pas l’accès à des systèmes ou données ne vous
appartenant pas, l’interruption d’un service, l’ingénierie sociale ou
l’exfiltration de données.
