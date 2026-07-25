# Guide du pilote client

Ce guide prépare une recette réelle, mais non sensible, avec une seule cliente.

## 1. Préparer la preview

Déployez le site client sur une URL HTTPS de staging. Cela peut être un VPS, un
environnement de preview de votre hébergeur ou un serveur dédié à la recette.
Revaloop 0.2 ne partage pas encore `localhost`.

L’invitation Revaloop protège l’espace de revue et ses commentaires. Elle ne
protège pas l’URL de staging, ne la place pas derrière la session reviewer et ne
remplace pas son authentification. Configurez cette protection séparément.

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

## 4. Vérifier le mode d’accès de Revaloop

Un Site globalement privé réserve toutes les routes à son propriétaire. Il est
adapté au développement, mais une cliente extérieure ne pourra pas ouvrir
`/join`.

Pour un pilote distant, le Site doit devenir accessible publiquement tout en
conservant :

- Sign in with ChatGPT sur `/dashboard` et les API développeur ;
- le cookie reviewer sur `/review` ;
- les headers `no-store` et `noindex` ;
- aucune identité locale dans le build de production.

Ne publiez pas l’instance tant que ces quatre contrôles ne sont pas vérifiés.
L’ouverture publique permet aussi l’inscription SIWC libre dans un tenant
isolé ; une alpha fermée doit ajouter une allowlist développeur.

## 5. Créer la recette

1. Ouvrez `/dashboard`.
2. Connectez-vous.
3. Choisissez « Créer mon projet ».
4. Saisissez le nom et une description non sensible.
5. Collez l’URL HTTPS de staging.
6. Donnez un numéro de version et, si possible, le commit.
7. Écrivez un message clair pour la cliente.
8. Ajoutez un à trois points de vérification concrets.
9. Choisissez une expiration courte.
10. Publiez.

Exemples de consignes :

- « Créez un compte avec `claire.test@example.invalid`. »
- « Ajoutez un article fictif puis annulez la commande. »
- « Vérifiez la compréhension du bouton principal sur téléphone. »

N’écrivez jamais un vrai mot de passe dans les consignes.

## 6. Créer et transmettre l’invitation

1. Cliquez « Créer un lien client ».
2. Indiquez le nom affiché.
3. Choisissez 1 à 7 jours si possible.
4. Copiez le lien avant de fermer : le secret ne sera pas réaffiché.
5. Transmettez-le sur un canal approprié.

Créer un second lien révoque immédiatement l’ancien lien et sa session.

L’interface ne demande pas d’adresse e-mail. Le nom affiché est saisi par le
développeur et Revaloop ne vérifie pas l’identité de la personne qui ouvre le
lien. Partagez donc l’invitation par un canal qui vous permet d’identifier son
destinataire.

La cliente :

1. ouvre le lien ;
2. voit le fragment disparaître ;
3. rejoint la release sans compte ;
4. dispose d’une session de 24 heures maximum.

## 7. Conduire la boucle

La cliente peut :

- cocher les consignes ;
- changer le viewport ;
- annoter ou créer un retour général ;
- consulter l’état partagé de chaque retour ;
- confirmer une correction ou rouvrir le point ;
- approuver lorsque tout est résolu ;
- demander des ajustements.

Le développeur peut :

- prendre en charge un retour ;
- le passer à revalider ;
- suivre les mises à jour sans rechargement ;
- révoquer l’accès ;
- exporter le compte rendu.

L’approbation est bloquée tant qu’un retour n’est pas résolu.

« Demander des ajustements » n’est pas une clôture. La release passe dans
`changes_requested`, mais le lien, la checklist, les commentaires et les
revalidations restent utilisables jusqu’à expiration ou révocation. Le
développeur corrige la même version de recette, passe les points à revalider,
puis la cliente peut transmettre un nouveau bilan et enfin approuver.

Revaloop bloque la publication d’une nouvelle release tant que la release
courante non expirée est `in_review` ou `changes_requested`. Une nouvelle
version devient possible seulement après approbation ou expiration. Après
expiration, la publication suivante révoque les anciens accès restants et
classe cette release comme remplacée.

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

Le déploiement Revaloop est probablement globalement privé.

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
- [ ] dashboard inaccessible sans SIWC
- [ ] expiration courte
- [ ] canal de partage choisi
- [ ] nom client traité comme déclaratif, jamais comme identité vérifiée
- [ ] stratégie d’export et suppression prévue
- [ ] accord client sur l’outil tiers et les données saisies
