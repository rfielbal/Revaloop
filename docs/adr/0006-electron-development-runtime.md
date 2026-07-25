# ADR-0006 — Utiliser Electron pour la boucle de développement desktop

- **Statut :** accepté, décision opérationnelle temporaire
- **Date :** 25 juillet 2026
- **Complète :** [ADR-0005](0005-desktop-companion.md)

## Contexte

L’ADR-0005 a fixé une séparation durable : le site reste le review plane, le
compagnon agit sur le poste du développeur et le futur tunnel forme un data
plane distinct. Il a aussi retenu Tauri 2 pour la première implémentation locale.
Ce document reste l’historique de cette décision et de ses motivations.

Pendant la construction du produit, la contrainte immédiate est différente :
lancer et modifier fréquemment le compagnon depuis le dépôt, sans installer puis
réinstaller une application à chaque itération. L’interface est déjà une SPA
React/Vite et l’essentiel de la logique de contrôle possède un équivalent
TypeScript testé.

Electron raccourcit cette boucle et simplifie le diagnostic du renderer, du
preload et du processus principal. En contrepartie, il embarque Chromium et Node,
augmente la taille des artefacts et élargit la surface de dépendances par rapport
à Tauri.

## Décision

`npm run desktop:dev` utilise Electron comme runtime principal de développement.
Le renderer Vite est limité à `http://127.0.0.1:1420/` et peut évoluer sans
installation de binaire. Une modification du processus principal ou du preload
demande seulement de relancer la commande de développement.

Tauri 2 reste un fallback explicite via les commandes `desktop:tauri:*`. Sa
présence permet de comparer les runtimes et de revenir à une empreinte native
plus petite si les coûts d’Electron dépassent le bénéfice de la boucle actuelle.
Ce backend historique ne possède toutefois pas encore l’autorité du chemin dans
le processus principal ni la confirmation native à usage unique imposées à
Electron. Il est réservé à la compatibilité et aux projets fiables tant que
cette parité n’est pas implémentée. Le choix d’Electron ne remet pas en cause la
séparation du site, du compagnon et du tunnel décidée par l’ADR-0005.

### Frontières obligatoires du runtime Electron

- le build empaqueté sert uniquement les assets locaux par le scheme sécurisé
  `revaloop://app` ; le handler contrôle le host, la méthode et le confinement du
  chemin dans le bundle ;
- la fenêtre active la sandbox et `contextIsolation`, désactive toutes les
  variantes de `nodeIntegration`, les WebViews et le contenu mixte ;
- le preload expose un objet gelé de fonctions sémantiques, jamais
  `ipcRenderer`, Node, shell, filesystem ou client HTTP générique ;
- chaque appel IPC vérifie la `webContents` de la fenêtre principale, sa
  `mainFrame` et l’URL locale exacte ;
- nouvelles fenêtres, navigation hors origine, WebViews, permissions et
  téléchargements sont refusés ;
- le dialogue natif sélectionne le dossier dans le processus principal ; ce
  processus conserve le chemin canonique autoritaire et le handler de lancement
  n’accepte aucun chemin venant du renderer ;
- le main relit `package.json`, compare le script présenté puis exécute
  exactement `npm --ignore-scripts run dev` avec `shell: false` ;
- les cibles de preview restent loopback, sans credentials, query string ou
  fragment ;
- les logs restent en mémoire, sont bornés et les lignes portant des marqueurs
  sensibles connus sont remplacées ;
- l’app ouvre le dashboard, le login et la preview dans le navigateur système ;
  elle n’appelle pas l’API Revaloop et ne conserve aucun token ou cookie web ;
- les artefacts empaquetés désactivent par fuses RunAsNode, `NODE_OPTIONS`,
  l’inspection CLI et le chargement hors ASAR, et activent l’intégrité ASAR.

Ces contrôles réduisent l’impact d’un renderer compromis, mais n’isolent pas le
script `dev`. Le projet confirmé s’exécute toujours avec les droits du compte
système et peut ignorer `HOST=127.0.0.1`.

## Distribution

Electron est pour l’instant un runtime lancé depuis le dépôt. Aucun binaire
public ne doit être présenté comme sûr ou téléchargeable avant :

1. signature des artefacts pour chaque système ciblé ;
2. notarisation macOS et hardened runtime validé ;
3. provenance du build et contrôles d’intégrité publiés ;
4. analyse des dépendances et procédure de mise à jour de sécurité ;
5. validation des fuses dans l’artefact final ;
6. tests d’installation, de désinstallation et de mise à jour.

L’updater automatique reste hors périmètre tant qu’un canal signé et une
politique de rollback ne sont pas définis.

## Conséquences

- la contribution desktop ne demande plus une compilation Rust au démarrage du
  chemin principal ;
- les changements de renderer sont testables directement depuis le dépôt ;
- les frontières Electron deviennent des invariants testés et documentés ;
- le dépôt conserve deux runtimes à maintenir tant que le fallback Tauri existe ;
- la taille du bundle et la fréquence de mise à jour des dépendances augmentent ;
- aucune promesse de distribution n’est faite avant la porte de sécurité
  décrite ci-dessus.

## Réévaluation

Le choix sera réévalué avant une première release publique, puis si l’un des
événements suivants survient :

- ajout d’une authentification native ou d’un token appareil ;
- intégration de l’agent de tunnel au processus desktop ;
- besoin d’un updater automatique ;
- coût de maintenance ou taille Electron incompatible avec les objectifs ;
- parité Tauri suffisante pour retrouver une boucle de développement comparable.

## Options non retenues maintenant

### Conserver Tauri comme runtime principal

Tauri conserve une empreinte plus petite et des capabilities natives explicites,
mais impose aujourd’hui une boucle Rust et des prérequis natifs plus lourds pour
les itérations courantes. Il reste disponible comme fallback plutôt que d’être
supprimé.

### Charger le site distant dans Electron

Ce serait un wrapper réseau donnant à du contenu distant une proximité inutile
avec le processus natif. Le renderer privilégié reste local et le site s’ouvre
dans le navigateur système.

### Distribuer immédiatement les artefacts non signés

Cette option transfèrerait au client le risque d’un binaire non authentifié et
rendrait les mises à jour difficiles à vérifier. Elle est rejetée jusqu’à la
mise en place des contrôles de distribution.
