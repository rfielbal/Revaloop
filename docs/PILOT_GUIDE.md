# Guide du pilote client

Ce guide prépare une recette réelle, mais non sensible, avec une seule cliente.

## 1. Préparer la preview

La voie recommandée reste une URL HTTPS de staging : VPS, environnement de
preview de l’hébergeur ou serveur dédié à la recette. Pour un premier essai
strictement non sensible, le compagnon Electron peut aussi exposer une cible
loopback au moyen d’un Quick Tunnel `cloudflared` public et temporaire.

Dans ce second cas, Revaloop ne téléverse pas le projet et n’installe pas
`cloudflared`. Le développeur lance son projet depuis le compagnon, confirme la
checklist native, crée le lien puis choisit « Continuer dans Revaloop ». Le
dashboard récupère l’adresse depuis un fragment client-side et demande sa
confirmation. Consultez le
[parcours reproductible sur fixture isolée](FIRST_CLIENT_PILOT.md) avant de
tester un vrai projet.

L’invitation Revaloop protège l’espace de revue et ses commentaires. Elle ne
protège pas l’URL de staging, ne la place pas derrière la session reviewer et ne
remplace pas son authentification. Configurez cette protection séparément.
Un Quick Tunnel est lui aussi directement accessible à toute personne qui
connaît son URL ; ne l’utilisez jamais avec une base ou des secrets de
production.

La preview doit avoir :

- une base distincte de la production ;
- des comptes fictifs ;
- e-mail, paiement, stockage et webhooks en mode sandbox ;
- aucun secret dans l’URL ;
- une date de suppression prévue ;
- une sauvegarde seulement si elle est nécessaire au test.

Revaloop refuse les URLs avec `user:password@` ou `?token=…`.

## 2. Autoriser ou contourner l’iframe

Pour afficher la preview dans Revaloop, la cible doit autoriser l’origine de
votre instance :

```http
Content-Security-Policy: frame-ancestors https://VOTRE-INSTANCE
```

Elle ne doit pas envoyer `X-Frame-Options: DENY` ou `SAMEORIGIN`.

Si vous ne pouvez pas changer ces headers, le lien « Ouvrir dans un nouvel
onglet » reste disponible. La cliente peut tester dans cet onglet puis déposer
un retour général dans Revaloop.

L’autorisation d’affichage ne garantit pas que toutes les fonctions marcheront
dans l’iframe. Testez au minimum :

- la connexion à la preview et le renouvellement de session ;
- les cookies tiers, leur attribut `SameSite` et Safari/Firefox avec protection
  renforcée ;
- OAuth/SSO, redirections de premier niveau et popups ;
- les téléchargements ;
- les paiements et moyens de paiement sandbox ;
- caméra, microphone et géolocalisation si le produit en dépend.

L’iframe Revaloop autorise scripts, formulaires, modales et popups, mais pas la
navigation du contexte supérieur ni les téléchargements. Sa
`Permissions-Policy` désactive caméra, microphone, géolocalisation, paiement et
USB. OAuth, certaines popups et les cookies cross-site peuvent également
échouer selon le navigateur. Ces parcours doivent être testés dans un nouvel
onglet, puis commentés avec « Retour général ».

## 3. Ajouter le bridge facultatif

Pour une SPA ou plusieurs pages :

```html
<script
  src="https://VOTRE-INSTANCE/revaloop-bridge.js"
  data-revaloop-origin="https://VOTRE-INSTANCE"
></script>
```

Vérifiez que la CSP de la preview autorise cette source de script. Le bridge
transmet uniquement le chemin sans query et le titre de page. Il ne transmet
jamais le scroll, un sélecteur DOM ou l’élément cliqué.

Avec ou sans bridge :

- la position du marqueur est un repère approximatif dans le viewport ;
- le marqueur n’est pas ancré à un élément et ne suit pas le scroll interne ;
- un retour général est souvent plus fiable après navigation.

Sans bridge, le chemin reste en plus celui de l’URL initiale.

## 4. Initialiser et protéger le compte développeur

Un Site globalement privé réserve toutes les routes à son propriétaire,
y compris `/join`. Il est adapté au développement interne, mais aucune cliente
extérieure ne pourra utiliser son invitation tant que ce mode reste actif.

Avant de rendre l’instance joignable par une cliente :

1. ouvrez `/register` sur la base vide depuis localhost ou avec l’identité
   propriétaire Sites ; le bootstrap anonyme public est bloqué par défaut ;
2. créez le premier compte développeur avec une adresse que vous contrôlez et
   un mot de passe unique de 12 à 128 caractères ;
3. vérifiez qu’une seconde inscription est refusée ;
4. laissez `REVALOOP_ALLOW_REGISTRATION` absent ou différent de `true` ;
5. déconnectez-vous puis vérifiez que `/dashboard` redirige vers `/login` ;
6. reconnectez-vous et vérifiez que `/logout` révoque bien la session.

Si cette base provient de Revaloop 0.2 et contient déjà un espace, utilisez
l’adresse e-mail exacte du compte développeur historique à l’étape 2. Une
adresse différente est refusée afin de ne pas fermer le bootstrap sur un tenant
vide. Effectuez toujours cette reprise tant que le Site reste globalement privé.
Pour un compte placeholder `@revaloop.local`, vérifiez également que
`REVALOOP_TRUSTED_SITES_HOSTNAME` correspond exactement au hostname du Site :
l’adresse authentifiée par Sites remplacera le placeholder sans déplacer les
projets.

Revaloop dérive le mot de passe avec PBKDF2-SHA-256 Web Crypto, sel aléatoire
et 100 000 itérations, maximum accepté par le runtime Workers actuel. La
session opaque est stockée hachée et son cookie `HttpOnly`, `Secure`,
`SameSite=Strict` expire après 30 jours.

Pour un pilote distant, l’instance doit être accessible publiquement tout en
conservant :

- la session Revaloop sur `/dashboard` et les API développeur ;
- l’inscription bootstrap fermée ;
- le cookie reviewer sur `/review` ;
- les headers `no-store` et `noindex` ;
- HTTPS sur toute l’instance.

Ne publiez pas l’instance tant que ces contrôles ne sont pas vérifiés. Il
n’existe pas encore de reset de mot de passe, de vérification d’e-mail ou de
MFA. Conservez donc le mot de passe initial dans un gestionnaire adapté et
préparez une procédure opérateur de récupération de la base.

## 5. Créer la recette

1. Ouvrez `/dashboard`.
2. Connectez-vous.
3. Choisissez « Créer mon projet ».
4. Saisissez le nom et une description non sensible.
5. Collez l’URL HTTPS de staging, ou utilisez l’adresse préremplie par le
   compagnon.
6. Donnez un numéro de version et, si possible, le commit.
7. Écrivez un message clair pour la cliente.
8. Si cela aide la recette, ajoutez un à trois points de vérification concrets.
   Vous pouvez les laisser entièrement vides : l’exploration et les retours
   libres constituent le parcours principal.
9. Choisissez une expiration courte.
10. Publiez.

Exemples de consignes :

- « Créez un compte avec `client.test@example.invalid`. »
- « Ajoutez un article fictif puis annulez la commande. »
- « Vérifiez la compréhension du bouton principal sur téléphone. »

N’écrivez jamais un vrai mot de passe dans les consignes.

## 6. Créer et transmettre l’invitation

1. Cliquez « Créer un lien client ».
2. Indiquez le nom affiché et, si utile, un e-mail de suivi optionnel.
3. Choisissez 1 à 7 jours si possible.
4. Copiez le lien avant de fermer : le secret ne sera pas réaffiché.
5. Transmettez-le sur un canal approprié.

Créer un second lien révoque immédiatement l’ancien lien et sa session.

Le nom et l’éventuel e-mail de suivi sont saisis par le développeur. Revaloop
n’envoie aucun message et ne vérifie pas l’identité de la personne qui ouvre le
lien. Partagez donc l’invitation par un canal qui vous permet d’identifier son
destinataire.

La cliente :

1. ouvre le lien ;
2. voit le fragment disparaître ;
3. rejoint la release sans compte ;
4. dispose d’une session de 24 heures maximum.

## 7. Conduire la boucle

La cliente peut :

- explorer librement le site, sans checklist obligatoire ;
- cocher les éventuelles vérifications suggérées ;
- changer le viewport ;
- annoter ou créer un retour général ;
- poser une question dans la discussion sans créer d’annotation ;
- consulter l’état partagé de chaque retour ;
- confirmer une correction ou rouvrir le point ;
- approuver lorsque tout est résolu ;
- demander des ajustements.

Le développeur peut :

- prendre en charge un retour ;
- le passer à revalider ;
- répondre dans la discussion de la release ;
- signaler que ses correctifs sont disponibles sur la preview ;
- suivre les mises à jour sans rechargement ;
- révoquer l’accès ;
- exporter le compte rendu.

L’approbation est bloquée tant qu’un retour n’est pas résolu.

### Rendre des correctifs visibles dans le même espace

1. corrigez l’application ;
2. déployez vous-même la nouvelle version sur l’URL de staging déjà utilisée ;
3. vérifiez directement cette URL et sa base de test ;
4. dans Revaloop, choisissez l’action qui signale les correctifs ;
5. le client voit qu’une nouvelle `preview_revision` est disponible et recharge
   la preview dans son espace de revue.

Cette action Revaloop ne lance ni build, ni déploiement, ni migration de la base
de la preview. Elle ne sécurise pas davantage son URL et ne constitue pas une
preuve d’immuabilité. Si le staging a besoin d’un déploiement automatisé,
configurez-le dans votre hébergeur ou votre CI.

Le même espace reste utilisable uniquement tant que la session cliente de
24 heures est valide. L’invitation initiale étant à usage unique, créez et
transmettez une nouvelle invitation après expiration de la session.

Revaloop remonte la même URL dans l’iframe lorsqu’un client choisit de voir la
mise à jour. Il ne peut pas forcer un cache HTTP, un CDN ou un Service Worker
de la preview à livrer le nouveau contenu. Configurez le staging pour éviter un
cache persistant et prévoyez un rechargement direct dans un nouvel onglet si
nécessaire.

« Demander des ajustements » n’est pas une clôture. La release passe dans
`changes_requested`, mais le lien, la checklist, les commentaires et les
revalidations restent utilisables jusqu’à expiration ou révocation. Le
développeur corrige la même version de recette, passe les points à revalider,
puis la cliente peut transmettre un nouveau bilan et enfin approuver.

Revaloop bloque la publication d’une nouvelle release tant que la release
courante non expirée est `in_review` ou `changes_requested`. Une nouvelle
version devient possible seulement après approbation ou expiration. La
publication suivante révoque alors toutes les invitations et sessions des
versions antérieures du projet. Une release approuvée reste dans l’historique
développeur ; une release seulement expirée est classée comme remplacée.

## 8. Terminer

À la fin :

1. exportez la recette Markdown ;
2. révoquez l’accès client ;
3. conservez ou signez séparément tout procès-verbal contractuel requis ;
4. supprimez le projet lorsque sa conservation n’est plus justifiée ;
5. supprimez également la preview et sa base de test.

« Approuvé dans Revaloop » est une décision produit traçable, mais ne remplace
pas automatiquement une recette contractuelle.

## Diagnostic

### La preview est vide

- ouvrez-la dans un nouvel onglet ;
- vérifiez `frame-ancestors` ;
- retirez `X-Frame-Options` uniquement sur la preview de test dédiée, jamais
  globalement sur la production ;
- vérifiez que son certificat HTTPS est valide.

### La connexion ou une fonction échoue seulement dans l’iframe

- vérifiez les cookies tiers et `SameSite` ;
- testez OAuth/SSO et les popups dans le navigateur cible ;
- utilisez le nouvel onglet pour téléchargement, paiement, caméra, microphone
  ou géolocalisation ;
- déposez ensuite un retour général dans Revaloop.

### Le lien est déjà utilisé

Une invitation est one-shot. Créez un nouveau lien. Cela révoquera l’ancienne
session.

### La session a expiré

Créez une nouvelle invitation. Une session ne dépasse pas 24 heures.

### La cliente ne voit pas `/join`

Le déploiement Revaloop est probablement globalement privé. Dans ce mode,
l’invitation cliente ne peut pas contourner le contrôle d’accès Sites.

### La copie automatique échoue

Le lien reste sélectionnable dans la boîte de dialogue. Ne la fermez pas avant
de l’avoir copié.

## Checklist avant envoi

- [ ] URL HTTPS sans query ni credentials
- [ ] accès au staging protégé séparément de l’invitation Revaloop
- [ ] DB et services sandbox
- [ ] aucune donnée réelle requise
- [ ] `frame-ancestors` et `X-Frame-Options` compatibles
- [ ] authentification et cookies testés dans Chrome, Safari et Firefox cibles
- [ ] OAuth/SSO, popups et redirections testés ou fallback expliqué
- [ ] téléchargements testés dans un nouvel onglet
- [ ] paiement, caméra, microphone et géolocalisation écartés de l’iframe
- [ ] origine Revaloop accessible à la cliente
- [ ] premier compte propriétaire créé avant ouverture publique
- [ ] inscription bootstrap désormais fermée
- [ ] dashboard inaccessible sans session développeur Revaloop
- [ ] connexion et déconnexion testées ; mot de passe conservé en sécurité
- [ ] expiration courte
- [ ] canal de partage choisi
- [ ] nom client traité comme déclaratif, jamais comme identité vérifiée
- [ ] stratégie d’export et suppression prévue
- [ ] accord client sur l’outil tiers et les données saisies
- [ ] processus de déploiement de la preview testé indépendamment de Revaloop
