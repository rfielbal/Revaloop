# Premier pilote réel avec une cliente

Ce parcours valide Revaloop de bout en bout sans utiliser un vrai projet, une
base locale ou des informations personnelles. Il s’appuie sur la fixture
[`examples/pilot-preview`](../examples/pilot-preview/README.md), un faux outil
de gestion d’atelier floral conçu pour être annoté.

## Ce que ce pilote prouve — et ce qu’il ne prouve pas

Le pilote vérifie :

- le lancement d’un projet local par le compagnon Electron ;
- l’exposition temporaire d’une preview HTTPS ;
- la création d’un projet et d’une release Revaloop ;
- l’invitation sans compte de la cliente ;
- les annotations, retours généraux et messages ;
- la boucle correction, revalidation, résolution et approbation ;
- la révocation et le nettoyage de fin de séance.

Il ne valide pas encore le partage sûr d’un vrai projet. La fixture ne contient
aucun secret, aucune dépendance applicative, aucune base, aucun appel réseau
sortant et aucune donnée durable. Son interface se réinitialise au rechargement.
Son serveur écoute `127.0.0.1` par défaut et refuse les méthodes autres que
`GET` et `HEAD`.

## Préconditions bloquantes

Avant de donner un lien à la cliente :

1. le compte propriétaire Revaloop doit déjà être créé ;
2. `/dashboard` doit rediriger vers `/login` sans session ;
3. une nouvelle inscription doit être refusée après le bootstrap ;
4. `/join` et `/review` doivent être joignables par la cliente sans passer par
   l’accès privé global de l’hébergeur ;
5. le dashboard et les API développeur doivent rester protégés par la session
   Revaloop ;
6. une notice adaptée à cette instance doit être accessible et indiquer le
   responsable et son contact, une durée de conservation concrète, les
   fournisseurs d’hébergement et de tunnel, leur région ou l’absence de garantie
   régionale, les sous-traitants et le DPA applicable ;
7. la cliente doit être informée que le Quick Tunnel fait terminer TLS chez
   Cloudflare, qui peut techniquement voir le trafic HTTP relayé, et accepter de
   n’utiliser que des données fictives ;
8. la cliente doit utiliser un navigateur et un appareil de test, sans y saisir
   d’information réelle.

Si le Site Revaloop est encore réservé à son propriétaire, arrêtez ici : une
invitation ne peut pas contourner ce verrou global.

## 1. Lancer la fixture

### Avec le compagnon Electron

Depuis la racine de Revaloop :

```bash
npm run desktop:dev
```

Dans l’application :

1. ouvrez « Projet local » ;
2. choisissez le dossier `examples/pilot-preview` ;
3. vérifiez que la commande annoncée est `npm --ignore-scripts run dev` ;
4. confirmez le lancement dans la boîte de dialogue native ;
5. conservez l’adresse locale `http://127.0.0.1:3000` ;
6. vérifiez que l’aperçu affiche « Atelier Onda » et la mention « Bac à
   sable ».

Le choix du dossier ne téléverse rien. Le compagnon exécute seulement le script
`dev` après confirmation et hérite d’un `HOST=127.0.0.1`.

Ce parcours valide le compagnon et son Quick Tunnel, mais pas la correction à
hostname constant de la section 6 : l’action « Arrêter le projet » arrête aussi
le tunnel. Pour exécuter tout le scénario avec la même URL, choisissez dès
maintenant le parcours terminal ci-dessous.

### Parcours terminal pour conserver la même URL

Cette variante est requise pour la simulation de correction à URL constante :

```bash
cd examples/pilot-preview
npm run dev
```

Le terminal doit afficher :

```text
Preview pilote prête : http://127.0.0.1:3000
```

Le contrôle de santé suivant doit répondre
`{"status":"ok","fixture":"revaloop-pilot-preview"}` :

```bash
curl http://127.0.0.1:3000/health
```

Si Revaloop utilise une autre origine que l’instance configurée par défaut,
autorisez-la explicitement avant le lancement :

```bash
REVALOOP_ORIGIN=https://votre-instance.example npm run dev
```

Seule une origine HTTPS est acceptée, à l’exception d’une origine loopback pour
le développement local. La variable refuse chemins, queries, fragments et
identifiants intégrés.

## 2. Créer l’URL HTTPS temporaire

La voie principale pour tester le compagnon est son bouton de partage : il
applique la confirmation native, ignore toute configuration Cloudflare du
poste, minimise l’environnement et arrête le tunnel avec le projet.

Pour réaliser ensuite la correction de la section 6 sans changer d’URL, gardez
la preview et `cloudflared` dans deux terminaux séparés. N’utilisez pas le bouton
« Arrêter le projet » du compagnon pendant ce scénario.

Pour vérifier le même parcours manuellement sur macOS ou Linux, utilisez les
mêmes garde-fous :

Dans un second terminal, gardez la preview active puis lancez :

```bash
cloudflared tunnel --config /dev/null --no-autoupdate --loglevel info \
  --url http://127.0.0.1:3000 \
  --http-host-header 127.0.0.1:3000
```

Sous Windows, remplacez `/dev/null` par `NUL`. Ce fallback terminal hérite tout
de même de l’environnement du shell ; fermez les variables sensibles inutiles
avant de le lancer. Le compagnon applique une allowlist plus stricte.

Copiez l’unique URL `https://…trycloudflare.com` affichée. Vérifiez-la depuis un
téléphone en 4G/5G ou un autre réseau, puis gardez les deux processus ouverts.
Chaque redémarrage de `cloudflared` produit une nouvelle URL.

Un Quick Tunnel rend la fixture publiquement accessible à toute personne qui
connaît l’URL. Il est prévu pour le développement, sans garantie de disponibilité,
avec une limite de requêtes concurrentes et sans Server-Sent Events. Il ne faut
jamais le pointer vers une application contenant une vraie base, des secrets ou
un panneau d’administration. Cloudflare termine le TLS présenté au navigateur
et peut techniquement voir les requêtes et réponses HTTP relayées, notamment
leurs headers, cookies et corps. Voir la
[documentation officielle des Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

Pour un projet réel, utilisez plutôt une preview de staging isolée ou un tunnel
nommé protégé par des règles d’accès. Cloudflare documente la protection des
[applications privées](https://developers.cloudflare.com/cloudflare-one/setup/secure-private-apps/).
Cette protection doit être testée avec l’iframe Revaloop : une page de connexion
intermédiaire, certains cookies ou certains headers peuvent bloquer l’affichage.

## 3. Créer le projet et la release

Dans `/dashboard`, utilisez des données non sensibles :

- **Nom** : `DÉMO — Fixture Atelier Onda` ;
- **Description** : `Validation du premier parcours Revaloop sur fixture fictive` ;
- **URL de preview** : l’URL HTTPS du tunnel, sans query ni fragment ;
- **Version** : `pilot-001` ;
- **Référence** : `fixture-initiale` ;
- **Message cliente** : `Explorez librement cette démonstration. Toutes les données sont fictives.` ;
- **Expiration** : la durée la plus courte disponible, soit 7 jours actuellement.

Les vérifications sont facultatives. Pour observer également ce parcours, vous
pouvez proposer :

1. naviguer entre « Vue d’ensemble », « Commandes » et « Clients » ;
2. ajouter une commande fictive puis modifier son statut ;
3. rechercher une organisation et vérifier la vue sur téléphone.

Publiez la release, puis contrôlez vous-même la preview dans l’espace de revue
avant de créer une invitation.

## 4. Inviter la cliente

1. créez un lien client avec un nom d’affichage générique si son identité n’est
   pas nécessaire au test ;
2. choisissez une expiration courte ;
3. copiez immédiatement le lien, car son secret ne sera pas réaffiché ;
4. transmettez-le sur le canal convenu ;
5. rappelez par un second message de ne saisir aucune donnée réelle.

Le lien est à usage unique : son ouverture l’échange contre une session puis le
secret disparaît de l’URL. Ne publiez pas ce lien dans une issue, un commit, une
capture d’écran ou un canal collectif.

## 5. Parcours demandé à la cliente

La cliente n’a pas besoin de compte Revaloop. Demandez-lui de :

1. ouvrir l’invitation et vérifier qu’elle arrive dans l’espace de revue ;
2. explorer librement les trois sections ;
3. ajouter une annotation sur un indicateur ou sur le graphique ;
4. créer un retour sur le bouton « Préparer la sélection », par exemple :
   `Je ne comprends pas si cette action prépare les fleurs ou la livraison.` ;
5. poser une question dans la discussion générale, sans créer de nouveau
   retour ;
6. ajouter une commande fictive et changer son statut ;
7. tester la largeur mobile ;
8. transmettre un bilan avec une demande d’ajustement.

Les noms d’organisations présents dans la fixture sont inventés. La cliente doit
également utiliser un nom inventé dans le formulaire.

## 6. Simuler une correction sur la même URL

Dans Revaloop, passez le retour en cours de traitement et répondez dans la
discussion. Cette section doit être réalisée entièrement avec les deux
terminaux ouverts aux sections 1 et 2. Gardez le terminal `cloudflared` intact
afin de conserver son URL.

Arrêtez uniquement le serveur de preview avec `Ctrl+C`, puis relancez sa variante
corrigée :

```bash
npm run dev:corrected
```

Cette variante affiche une note de mise à jour et remplace « Préparer la
sélection » par « Préparer la livraison ». Comme le tunnel est resté actif,
l’URL de preview ne change pas. L’interruption temporaire peut produire une
erreur pendant quelques secondes ; attendez le retour du healthcheck avant de
prévenir la cliente.

Dans Revaloop :

1. signalez que les correctifs sont disponibles ;
2. passez le retour à revalider ;
3. envoyez un message expliquant précisément le changement ;
4. demandez à la cliente de recharger la preview ;
5. laissez-la confirmer la correction ou rouvrir le point.

Si le compagnon Electron possède le processus initial, n’utilisez pas son bouton
« Arrêter le projet » pour ce scénario : il révoquerait aussi le Quick Tunnel et
son hostname. Arrêtez cette tentative, puis recommencez le pilote depuis le
parcours terminal ; un seul serveur peut écouter le port 3000.

## 7. Résoudre et approuver

Le parcours est réussi lorsque :

- le retour annoté est visible des deux côtés au bon emplacement et sur le bon
  chemin ;
- les messages développeur et cliente apparaissent dans le même fil ;
- la cliente voit la variante corrigée sans recevoir une nouvelle URL de
  preview ;
- le retour peut être confirmé comme résolu ;
- l’approbation est impossible tant qu’un retour reste ouvert ;
- la cliente peut finalement approuver la release ;
- l’historique développeur conserve la décision et ses échanges.

Exportez le compte rendu Markdown si cette fonction est disponible, puis notez
séparément les anomalies du pilote. Une approbation Revaloop n’est pas, à elle
seule, une recette contractuelle signée.

## 8. Nettoyer immédiatement

À la fin de la séance :

1. révoquez l’invitation et la session cliente dans Revaloop ;
2. arrêtez `cloudflared` avec `Ctrl+C` ;
3. vérifiez que l’URL `trycloudflare.com` ne répond plus ;
4. arrêtez la preview ou le processus lancé par Electron ;
5. supprimez le projet pilote de Revaloop si son historique n’est plus utile ;
6. supprimez les captures ou exports contenant le lien d’invitation ;
7. consignez uniquement les enseignements non sensibles.

La fixture ne crée ni cookie applicatif, ni fichier de données, ni compte. Un
rechargement suffit à effacer les commandes ajoutées dans l’interface.

## Fiche de contrôle

- [ ] compte propriétaire initialisé et inscription refermée
- [ ] routes clientes accessibles sans verrou global de l’hébergeur
- [ ] dashboard inaccessible sans session développeur
- [ ] notice adaptée publiée avec responsable, contact et rétention
- [ ] fournisseur, région, sous-traitants et DPA documentés
- [ ] terminaison TLS Cloudflare et absence de données réelles expliquées
- [ ] fixture « Atelier Onda » lancée sur `127.0.0.1`
- [ ] healthcheck valide
- [ ] tunnel pointé uniquement vers la fixture
- [ ] URL HTTPS testée depuis un autre réseau
- [ ] release `pilot-001` publiée avec expiration courte
- [ ] invitation transmise sans fuite du secret
- [ ] annotation, retour général et discussion testés
- [ ] preview et tunnel conservés dans deux terminaux pour la correction
- [ ] variante corrigée visible sur la même URL
- [ ] résolution et approbation testées
- [ ] invitation révoquée, tunnel et preview arrêtés
