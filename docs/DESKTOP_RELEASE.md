# Première distribution de l’application desktop

Ce document décrit un chemin de release volontairement prudent pour
l’application Electron Revaloop. Une compilation réussie n’est pas une
autorisation de publication. Tant que les signatures, la notarisation, les
preuves et la validation humaine ne sont pas terminées, les binaires restent
des artefacts privés de test.

La première cible proposée est limitée à :

- macOS arm64, signé avec un certificat Developer ID Application et notarié ;
- Windows x64, signé avec Authenticode et horodaté.

Linux et macOS Intel pourront être ajoutés après validation de cette première
matrice. Ils ne doivent pas apparaître comme pris en charge avant d’avoir leur
propre build, leurs contrôles et leur cycle de test.

## Quatre modes de travail

Depuis la racine du dépôt :

```bash
npm ci
npm run desktop:check
```

Puis choisissez un niveau :

```bash
# Développement Electron avec rechargement automatique
npm run desktop:dev

# Compilation seule du processus principal, du preload et du renderer
npm run desktop:build

# Application empaquetée dans un répertoire, utile pour la QA locale
npm run desktop:pack

# Installateurs destinés au processus de release
npm run desktop:dist
```

`desktop:build` ne crée pas d’application installable. `desktop:pack` et
`desktop:dist` placent leurs sorties dans `desktop/release/`. `desktop:dev` est
le bon mode pour travailler au quotidien : aucune réinstallation n’est
nécessaire après une modification.

Un build local non signé peut servir à la QA du développeur. Il ne doit jamais
être envoyé à un client ni proposé sur le site : Gatekeeper et SmartScreen
peuvent le bloquer et son origine n’est pas vérifiable. Pour forcer un test
macOS sans découverte automatique d’un certificat :

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run desktop:dist
```

## Contrôles continus

`.github/workflows/desktop.yml` exécute `npm run desktop:check` sur Linux x64,
macOS arm64 et Windows x64. Le workflow :

- ne reçoit aucun secret ;
- conserve `contents: read` ;
- désactive la persistance des identifiants Git ;
- installe le lockfile avec `npm ci --ignore-scripts` ;
- utilise uniquement des actions GitHub officielles épinglées à un commit.

Ce workflow valide le TypeScript, les tests Electron et le build, pas la
signature d’un installateur.

## Blocage de sécurité actuel

Au 25 juillet 2026, les deux audits ne racontent pas la même chose :

```bash
# Dépendances incluses dans l’application : succès, aucune vulnérabilité connue
npm audit --omit=dev --audit-level=high

# Chaîne complète, y compris les outils qui fabriquent les binaires : échec
npm audit --audit-level=high
```

Le second audit signale actuellement 16 vulnérabilités élevées dans la chaîne
transitive d’`electron-builder`, autour de `brace-expansion`, `minimatch` et
`glob` ([GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)).
Même si ces paquets ne sont pas embarqués dans l’application finale, ils
s’exécutent pendant la fabrication : ils appartiennent donc à la chaîne
d’approvisionnement.

Le workflow de release exécute les deux audits et reste volontairement bloqué
sur l’audit complet. Ne lancez pas `npm audit fix --force` : la correction
proposée actuellement rétrograde `electron-builder` vers une version majeure
incompatible et ne constitue pas une résolution vérifiée.

Une release publique ne peut reprendre qu’après l’une de ces deux décisions :

1. mettre à jour la chaîne, régénérer le lockfile puis obtenir un audit complet
   sans vulnérabilité élevée ;
2. faire auditer formellement une exception documentant propriétaire, portée,
   exploitabilité pendant le build, contrôles compensatoires et date
   d’expiration, puis la faire approuver par les reviewers de l’environnement.

Le succès de l’audit `--omit=dev` ne suffit pas, à lui seul, à autoriser une
release.

## Préparer GitHub avant le premier brouillon

Créez un environnement GitHub nommé `desktop-release`, puis configurez :

1. des reviewers obligatoires ;
2. les branches et tags autorisés ;
3. une variable d’environnement `DESKTOP_RELEASE_ENV_READY=true` ;
4. les secrets ci-dessous ;
5. une règle de protection empêchant la réécriture des tags de release.

N’activez la variable qu’une fois les protections réellement en place.

Le workflow manuel `.github/workflows/desktop-release.yml` offre deux modes :

- `unsigned-artifacts` fabrique des installateurs privés, conservés sept jours
  dans le run Actions, sans release GitHub ;
- `signed-draft` exige le tag exact déjà poussé, les secrets de signature et
  une approbation de l’environnement. Il crée uniquement une **release
  brouillon**. Aucun chemin automatique ne publie la release.

Le tag doit correspondre exactement à la version de `desktop/package.json`,
par exemple `v0.1.0-alpha.1`. Pour le mode signé, lancez manuellement le
workflow depuis ce tag, jamais depuis une branche.

## Signature et notarisation macOS

Prérequis :

- abonnement Apple Developer actif ;
- certificat `Developer ID Application` exporté en `.p12` ;
- hardened runtime et entitlements minimaux ;
- clé API App Store Connect dédiée à la notarisation.

Secrets de l’environnement GitHub :

| Secret | Contenu |
| --- | --- |
| `MAC_CSC_LINK` | certificat `.p12` encodé selon le format accepté par electron-builder |
| `MAC_CSC_KEY_PASSWORD` | mot de passe du certificat |
| `APPLE_API_KEY` | clé privée App Store Connect dédiée |
| `APPLE_API_KEY_ID` | identifiant de la clé |
| `APPLE_API_ISSUER` | identifiant de l’émetteur |

Utilisez une clé de rôle minimal, révocable et réservée au projet. Ne stockez
jamais un certificat, une clé `.p8` ou son mot de passe dans Git, dans un
artefact Actions ou dans une variable non secrète.

Le workflow refuse le brouillon si un secret manque, puis vérifie :

```bash
codesign --verify --deep --strict --verbose=2 Revaloop.app
spctl --assess --type execute --verbose=4 Revaloop.app
xcrun stapler validate Revaloop.app
```

La signature et la notarisation sont deux preuves distinctes. La documentation
[Electron sur la signature](https://www.electronjs.org/docs/latest/tutorial/code-signing)
et celle
[d’electron-builder sur la notarisation](https://www.electron.build/docs/notarization/)
restent les références opérationnelles.

Pour reproduire le build signé sur une machine macOS isolée, chargez d’abord
les secrets depuis un gestionnaire de secrets, en donnant à `APPLE_API_KEY` le
chemin local vers la clé `.p8`, puis lancez depuis la racine du dépôt :

```bash
npm run desktop:build
node desktop/electron/scripts/package.mjs \
  --mac \
  --arm64 \
  --force-code-signing \
  --notarize
```

N’inscrivez pas les valeurs secrètes directement dans la commande ou
l’historique du shell. Le workflow matérialise la clé `.p8` dans le répertoire
temporaire du runner avec des permissions restrictives, puis la supprime.
Le script de packaging copie uniquement `desktop/out/` dans un répertoire de
staging temporaire et transmet à `electron-builder` une configuration dont les
chemins de ressources et de sortie sont résolus explicitement. Le build signé
utilise ainsi exactement le même contenu applicatif minimal que
`npm run desktop:pack` et `npm run desktop:dist` ; il ne prend jamais
`desktop/node_modules/` ni les sources du monorepo comme application à signer.

## Signature Windows

Pour une première release, utilisez un certificat Authenticode d’une autorité
reconnue, avec horodatage. Secrets :

| Secret | Contenu |
| --- | --- |
| `WIN_CSC_LINK` | certificat `.pfx` ou valeur sécurisée acceptée par electron-builder |
| `WIN_CSC_KEY_PASSWORD` | mot de passe du certificat |

Le workflow exige que chaque installateur ait un statut Authenticode `Valid`
et un certificat d’horodatage. Un certificat OV peut encore rencontrer la
réputation SmartScreen ; une signature valide ne promet pas sa disparition
immédiate.

Si la clé privée est matérielle ou si Azure Trusted Signing est retenu,
n’exportez pas artificiellement la clé dans GitHub Secrets. Utilisez un runner
ou une intégration OIDC dédiée, avec validation séparée, avant d’adapter le
workflow. La documentation
[electron-builder sur la signature](https://www.electron.build/docs/features/code-signing/)
et [SignTool de Microsoft](https://learn.microsoft.com/windows/win32/seccrypto/signtool)
doit guider cette variante.

Sur une machine Windows isolée, après chargement de `WIN_CSC_LINK` et
`WIN_CSC_KEY_PASSWORD` depuis un gestionnaire de secrets, lancez depuis la
racine du dépôt :

```powershell
npm run desktop:build
node desktop/electron/scripts/package.mjs `
  --win `
  --x64 `
  --force-code-signing
```

Le drapeau `forceCodeSigning` empêche qu’un problème de certificat produise
silencieusement un installateur non signé.

## Checksums, SBOM et provenance

Chaque job de fabrication produit :

- `SHA256SUMS-<plateforme>.txt` pour les installateurs ;
- `revaloop-sbom-<plateforme>.spdx.json`, généré par `npm sbom` ;
- `SBOM-SHA256-<plateforme>.txt` pour l’intégrité du SBOM.

Avant une publication, vérifiez localement :

```bash
sha256sum --check SHA256SUMS-windows.txt
sha256sum --check SBOM-SHA256-windows.txt
```

Sur macOS :

```bash
shasum -a 256 -c SHA256SUMS-macos.txt
shasum -a 256 -c SBOM-SHA256-macos.txt
```

Le mode `signed-draft` ajoute deux attestations GitHub pour chaque plateforme :
provenance de build et association du SBOM aux installateurs. Après
téléchargement :

```bash
gh attestation verify Revaloop-0.1.0-alpha.1-mac-arm64.dmg \
  --repo rfielbal/Revaloop
```

Les attestations GitHub sont disponibles pour les dépôts publics. Pour un
dépôt privé, vérifiez que le plan GitHub prend en charge cette fonction avant
le premier run. Consultez la documentation
[GitHub sur les attestations](https://docs.github.com/actions/concepts/security/artifact-attestations)
et [npm sur le SBOM](https://docs.npmjs.com/cli/v11/commands/npm-sbom/).

## Checklist humaine avant publication

Le brouillon doit rester privé jusqu’à ce qu’une personne distincte du build
confirme :

1. le commit et le tag attendus ;
2. la correspondance entre tag et version de l’application ;
3. le succès de `desktop:check` sur les trois systèmes ;
4. l’absence de vulnérabilité élevée non acceptée et documentée ;
5. la signature et l’horodatage Windows ;
6. la signature, le hardened runtime, la notarisation et le ticket agrafé
   à l’application macOS ;
7. les checksums et les attestations sur une copie fraîchement téléchargée ;
8. l’ouverture, le premier lancement, le choix d’un projet et l’arrêt du
   serveur local sur une machine propre de chaque système ;
9. l’absence de secret, chemin local ou donnée cliente dans les logs et
   artefacts ;
10. les notes de version, limites connues, systèmes pris en charge et procédure
    de retour arrière.

La publication reste une action humaine dans l’interface GitHub. N’ajoutez pas
de déclencheur sur `push` ou sur tag au workflow de release tant que ce contrôle
n’est pas formalisé.

## Ajouter le téléchargement au site

Avant publication, le site doit afficher « Application desktop bientôt
disponible » et ne pointer ni vers un fichier local, ni vers un artefact
Actions temporaire, ni vers une release brouillon.

Après publication et nouvelle vérification depuis un navigateur non connecté :

1. liez le bouton général à
   `https://github.com/rfielbal/Revaloop/releases/latest` pour une release
   stable ;
2. pour des boutons par système, utilisez les URL immuables
   `https://github.com/rfielbal/Revaloop/releases/download/<tag>/<fichier>` ;
3. affichez l’architecture, la version, la taille, le SHA-256 et un lien vers
   les notes de version ;
4. conservez un accès visible aux anciennes releases et à leurs checksums ;
5. ne remplacez jamais silencieusement un fichier déjà publié.

Une prerelease alpha n’est pas la release `latest`. Le site doit donc utiliser
son tag exact jusqu’au passage à une version stable.
