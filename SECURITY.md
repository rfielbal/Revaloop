# Politique de sécurité

## Statut

| Version | Support |
|---|---|
| `main` / `0.2.x` | alpha, pilote contrôlé, corrections au mieux |
| version stable | aucune publiée |

L’alpha sécurise le review plane, mais elle n’est pas qualifiée pour des
données sensibles, réglementées ou une production critique. Utilisez une
preview et une base de test. Revaloop protège l’invitation et les retours ; il
ne rend pas privée l’URL de staging, qui doit avoir son propre contrôle d’accès.

## Signaler une vulnérabilité

Ne publiez jamais de secret, donnée personnelle, preuve de concept exploitable
ou vulnérabilité non corrigée dans une issue publique.

Utilisez **GitHub Private Vulnerability Reporting** dans l’onglet Security du
dépôt. Si ce bouton n’est pas disponible, ouvrez uniquement une issue sans
détail technique pour demander un canal confidentiel.

Indiquez :

- le commit ou la version ;
- la route et le scénario ;
- l’impact et les préconditions ;
- des étapes de reproduction minimales avec des données synthétiques ;
- toute mesure temporaire connue ;
- un moyen de contact.

Objectifs de réponse, sans engagement de niveau de service :

- accusé de réception sous 3 jours ouvrés ;
- première qualification sous 7 jours ouvrés ;
- point d’avancement au moins tous les 14 jours.

## Garanties implémentées

### Développeur

- Sign in with ChatGPT fourni par OpenAI Sites ;
- fallback local désactivé dans le build de production ;
- création d’un espace isolé par identité ;
- autorisation par organisation, projet, release et retour ;
- aucune route développeur accessible sans identité Sites ;
- création, révocation, export et suppression contrôlés côté serveur.

L’application fait confiance aux en-têtes d’identité réservés ajoutés par
l’ingress Sites. Un déploiement hors Sites doit remplacer cet adaptateur par
une authentification vérifiable et supprimer les headers entrants non fiables.

### Reviewer

- invitation aléatoire de 32 octets ;
- secret placé dans le fragment de `/join`, absent de la requête initiale ;
- uniquement le SHA-256 du secret en D1 ;
- consommation one-shot et création de session dans un même batch D1 ;
- cookie opaque `HttpOnly`, `Secure`, `SameSite=Strict`, sans `Domain` ;
- durée de session maximale de 24 heures ;
- expiration et révocation vérifiées à chaque lecture et dans la mutation
  finale ;
- auteur dérivé de la session, jamais fourni par le corps de la requête ;
- fermeture explicite qui révoque aussi la session serveur.

Le nom de session est saisi par le développeur lors de l’invitation puis recopié
côté serveur comme auteur. Il reste déclaratif : Revaloop ne vérifie pas
l’identité de la personne qui possède le lien. L’interface fournie ne collecte
plus d’adresse e-mail cliente. Le schéma et l’API conservent toutefois un champ
e-mail nullable pour compatibilité avec d’éventuels clients API personnalisés ;
ce champ n’est ni un facteur d’authentification ni un canal d’envoi.

### Mutations et données

- `Origin` exact obligatoire ;
- JSON uniquement, corps bornés, textes limités et listes fermées ;
- requêtes préparées ;
- limites de débit persistées dans D1 ;
- transition développeur et transition reviewer séparées ;
- séquence + insertion d’un retour atomiques ;
- une seule ligne de décision courante par release ;
- une demande d’ajustements peut être remplacée par un bilan ultérieur et ne
  clôt pas la release ;
- seule l’approbation est terminale ;
- approbation et absence de retour ouvert vérifiées dans la même transaction ;
- audits conditionnés à l’existence de la mutation ;
- aucune URL de preview avec credentials ou query string ;
- aucun cookie, champ ou contenu de page collecté par le bridge.

### Navigateur

- CSP avec `frame-ancestors 'none'`, `base-uri 'self'` et `form-action 'self'` ;
- `X-Frame-Options: DENY` ;
- `X-Content-Type-Options: nosniff` ;
- `Referrer-Policy: no-referrer` ;
- `Permissions-Policy` restrictive ;
- `Cache-Control: private, no-store` sur dashboard, join, review et API ;
- `noindex`, `nofollow`, `noarchive`, `nosnippet` sur les espaces privés.

## Limites connues

- l’ouverture globale du Site permet à tout utilisateur Sign in with ChatGPT
  de créer son propre espace isolé ; une alpha fermée doit ajouter une
  allowlist ou des invitations développeur avant publication générale ;
- la preview est une ressource tierce, mutable et directement chargée par le
  navigateur ; l’invitation Revaloop ne protège pas son URL, ses comptes, sa
  base ni ses services ;
- `frame-src https:` est nécessaire pour accepter des previews arbitraires :
  l’URL reste choisie par le développeur authentifié, mais une allowlist
  d’origines est préférable pour un déploiement fermé ;
- une preview peut refuser l’iframe ; Revaloop ne contourne ni
  `X-Frame-Options` ni `frame-ancestors` ;
- l’authentification embarquée peut échouer à cause des cookies tiers,
  `SameSite`, des politiques navigateur ou d’une redirection OAuth/SSO ;
- le sandbox autorise scripts, formulaires, modales et popups, mais pas la
  navigation du contexte supérieur ni les téléchargements ; certaines popups
  d’authentification restent incompatibles ;
- caméra, microphone, géolocalisation, paiement et USB sont désactivés par la
  `Permissions-Policy` Revaloop dans le contexte embarqué ;
- le bridge ne transmet que `pathname` et `document.title` : il ne transmet ni
  scroll, ni sélecteur DOM, ni ancre d’élément ;
- même avec le bridge, la position externe est approximative et ne suit pas le
  scroll interne ; sans bridge, le chemin ne suit pas non plus les navigations
  SPA ;
- les anciennes releases ne sont pas encore navigables dans le dashboard ;
  une nouvelle release est bloquée tant que la courante est active en
  `in_review` ou `changes_requested`, puis devient possible après approbation ou
  expiration ;
- D1 reste une base partagée avec isolation logique, pas une base par tenant ;
- le bootstrap runtime complète les migrations pour Sites ; une distribution
  auto-hébergée doit exécuter les migrations de façon contrôlée ;
- il n’existe ni pièce jointe, ni capture, ni stockage R2 ;
- aucun agent ou tunnel local n’est implémenté ;
- la suite automatisée vérifie les frontières HTTP et primitives, mais les
  scénarios de forte concurrence D1 doivent encore être élargis.

## Règles pour un pilote

- base et comptes de test uniquement ;
- services externes en mode sandbox ;
- aucun moyen de paiement, mot de passe ou donnée personnelle réelle ;
- protection d’accès du staging configurée indépendamment de Revaloop ;
- compatibilité testée pour iframe, authentification, cookies, OAuth/SSO,
  popups, téléchargements, paiement et caméra ; nouvel onglet utilisé dès qu’un
  parcours embarqué échoue ;
- invitation transmise sur un canal adapté ;
- révocation à la fin de la session ;
- suppression du projet lorsqu’il n’est plus nécessaire ;
- vérification contractuelle séparée si le projet exige un procès-verbal de
  recette formel.

`noindex` n’est jamais un contrôle d’accès.

## Périmètre prioritaire des signalements

- IDOR ou accès croisé entre organisations/projets ;
- contournement SIWC, invitation, expiration ou révocation ;
- rejeu ou fuite d’un secret ;
- session encore capable d’écrire après révocation ;
- approbation possible avec retour ouvert ;
- injection persistante dans un retour ;
- contournement de la CSP ou de l’origine ;
- audit contenant un secret ou décrivant une mutation inexistante ;
- suppression incomplète ;
- plus tard : SSRF, proxy ouvert, confusion de tunnel ou contournement mTLS.

Les failles propres à la preview tierce doivent être signalées à son
propriétaire, sauf si elles permettent de franchir une frontière Revaloop.

## Divulgation coordonnée

Nous demandons un délai raisonnable avant publication. Le projet s’engage à
traiter le signalement de bonne foi, limiter l’accès aux informations et
créditer la personne si elle le souhaite.

Cette politique n’autorise pas l’accès à des systèmes tiers, l’exfiltration,
l’interruption de service ou l’ingénierie sociale.
