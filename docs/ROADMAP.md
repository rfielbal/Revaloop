# Feuille de route technique

- **Dernière mise à jour :** 25 juillet 2026
- **Principe :** aucun statut sans code, test et limite documentée

## Légende

- ✅ implémenté et démontrable ;
- 🧪 alpha utilisable dans un pilote contrôlé ;
- ⏳ prévu, code absent ;
- 🔬 recherche ;
- 🚫 hors périmètre initial.

## État actuel — alpha 0.2

### Review plane

- ✅ landing et démo cliente fictive ;
- ✅ Sign in with ChatGPT pour le développeur sur Sites ;
- ✅ utilisateurs, organisations, membres et autorisation par projet ;
- ✅ projets multiples ;
- ✅ création d’une release avec URL HTTPS, consignes et référence Git ;
- ✅ cible `external` dans une iframe et fallback nouvel onglet ;
- ✅ bridge facultatif ne transmettant que chemin et titre ;
- ✅ invitations one-shot de 32 octets stockées hachées ;
- ✅ échange atomique fragment → session → cookie ;
- ✅ session maximale de 24 h, rotation, révocation et fermeture ;
- ✅ checklist persistée ;
- ✅ retours généraux et visuels ;
- ✅ transitions séparées développeur/reviewer ;
- ✅ synchronisation à cinq secondes ;
- ✅ demande d’ajustements non terminale puis approbation finale atomique ;
- ✅ nouvelle release bloquée jusqu’à approbation ou expiration de la courante ;
- ✅ export Markdown ;
- ✅ suppression d’un projet ;
- ✅ audit minimal et rate limits ;
- ✅ migrations D1 et purge opportuniste des données opérationnelles ;
- ✅ en-têtes défensifs et absence de cache ;
- 🧪 pilotage d’une vraie preview non sensible.

### Limites de l’alpha

- une seule release courante est exposée dans le dashboard ;
- après approbation, la release reste approuvée mais n’est plus navigable depuis
  le dashboard dès qu’une nouvelle version existe ;
- après expiration, publier une nouvelle release révoque les anciens accès et
  passe la précédente à `superseded` ;
- l’origine de preview n’est pas limitée par allowlist globale ;
- l’ouverture publique autorise l’inscription SIWC libre dans un tenant isolé ;
- le bridge transmet seulement le chemin et le titre : les annotations externes
  ne sont jamais ancrées à un élément et ne suivent pas le scroll interne ;
- l’invitation protège la revue, pas l’accès à l’URL de staging ;
- iframe, authentification, cookies tiers, OAuth/SSO, popups, téléchargements,
  paiement et caméra restent dépendants de la preview et du navigateur ;
- le nom reviewer est déclaratif et non vérifié ; l’interface ne collecte pas
  d’adresse e-mail cliente ;
- aucune capture ou pièce jointe ;
- aucun e-mail n’est envoyé ;
- aucun tunnel local.

## Jalon 0.2.1 — fiabiliser le pilote

- ⏳ tests automatisés D1 des doubles échanges et écritures concurrentes ;
- ⏳ statut et dernière activité d’une invitation dans le dashboard ;
- ✅ aide après délai et fallback explicite vers un nouvel onglet ;
- ⏳ détection fiable du chargement ou du refus de framing, lorsque le navigateur
  permet de distinguer ces états ;
- ⏳ journal d’audit consultable par le propriétaire ;
- ⏳ export serveur signé et format JSON ;
- ⏳ configuration de rétention par projet ;
- ⏳ confirmation de suppression renforcée ;
- ⏳ quotas par organisation ;
- ⏳ allowlist/invitation développeur pour alpha fermée ;
- ⏳ historique et sélection de releases.

### Porte de sortie

- parcours réel validé sur Chrome, Safari et Firefox ;
- tests d’accès croisé entre deux identités ;
- double échange et feedback concurrent à une approbation couverts ;
- déploiement public vérifié avec dashboard protégé et `/join` anonyme ;
- canal privé de vulnérabilité opérationnel.

## Jalon 0.3 — captures et discussions

- ⏳ binding R2 et stockage privé ;
- ⏳ capture explicite avec prévisualisation ;
- ⏳ contrôle MIME, taille et dimensions ;
- ⏳ empreinte de contenu ;
- ⏳ suppression de l’objet avec son retour ;
- ⏳ fil de discussion par retour ;
- ⏳ mentions et notifications configurables ;
- ⏳ intégrations GitHub/GitLab ;
- ⏳ quotas de stockage.

🚫 Captures silencieuses, enregistrement continu et collecte de champs restent
hors périmètre.

## Jalon 0.4 — portabilité du review plane

- ⏳ interfaces repository indépendantes de D1 ;
- ⏳ PostgreSQL de référence ;
- ⏳ S3/MinIO de référence ;
- ⏳ OIDC générique ;
- ⏳ migrations, sauvegarde, restauration et purge documentées ;
- ⏳ image conteneur et exemple de déploiement ;
- ⏳ test d’installation sur un environnement vierge ;
- ⏳ documentation des régions et sous-traitants.

## Jalon 0.5 — agent et tunnel

Objectif : rendre enfin possible `revaloop share 3000`.

- ⏳ CLI et agent local ;
- ⏳ authentification d’appareil ;
- ⏳ connexion sortante mTLS ;
- ⏳ cible loopback et port explicitement autorisés ;
- ⏳ relais HTTP/WebSocket séparé du Worker ;
- ⏳ lease court lié au projet et à la release ;
- ⏳ révocation immédiate ;
- ⏳ quotas de bande passante et connexions ;
- ⏳ filtres d’hôtes et refus des réseaux internes ;
- ⏳ aucun log de corps, cookie ou header d’autorisation ;
- ⏳ tests de proxy ouvert, SSRF, confusion de routage et rejeu.

### Porte de sortie

- un poste neuf peut partager une application locale par connexion sortante ;
- aucune autre cible locale n’est accessible ;
- l’arrêt ou la révocation coupe le trafic ;
- les commentaires restent disponibles hors ligne ;
- l’opérateur documente clairement s’il peut lire le trafic.

## Jalon 0.6 — hébergement de previews

- ⏳ build reproductible depuis une source autorisée ;
- ⏳ runner rootless éphémère ;
- ⏳ réseau et secrets isolés ;
- ⏳ base par release ;
- ⏳ destruction vérifiable ;
- ⏳ limites CPU, mémoire, temps et disque ;
- ⏳ analyse des dépendances et provenance.

## Recherche — TLS passthrough

Le mode managé termine TLS au relais : il facilite l’authentification mais
l’opérateur peut lire le trafic. Un mode passthrough rendrait le trafic opaque
au relais, au prix d’une gestion complexe des certificats et de l’impossibilité
d’injecter un bridge HTTP. Aucun chiffrement de bout en bout ne sera annoncé
avant prototype et audit.

## Gouvernance

Une fonction passe à ✅ uniquement lorsque :

1. le parcours nominal fonctionne ;
2. les erreurs et accès croisés sont testés ;
3. les données collectées et leur suppression sont documentées ;
4. le modèle de menace ou un ADR est à jour ;
5. la limitation utilisateur est visible dans l’interface.
