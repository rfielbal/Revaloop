# Contribuer à Revaloop

Merci de contribuer à Revaloop. Le projet est encore jeune : la meilleure
contribution est souvent celle qui clarifie une frontière, ajoute un test ou
empêche la documentation de promettre plus que le code.

En participant, vous acceptez le [Code de conduite](CODE_OF_CONDUCT.md).

## Avant de commencer

Lisez :

- [README.md](README.md) pour l’état réel du prototype ;
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour les composants ;
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) avant toute modification de
  sécurité ;
- [docs/ROADMAP.md](docs/ROADMAP.md) pour les priorités ;
- [SECURITY.md](SECURITY.md) pour un signalement confidentiel.

N’ouvrez pas d’issue publique pour une vulnérabilité exploitable.

## Environnement

Prérequis :

- Node.js `>= 22.13.0` ;
- npm.

Installation :

```bash
git clone <url-du-depot>
cd revaloop
npm ci
npm run dev
```

Le développement local utilise un binding D1 nommé `DB`. Le repository crée
les tables de démonstration au premier accès si elles n’existent pas.

## Vérifications

Avant une pull request :

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

La suite actuelle couvre des smoke tests de rendu, les principaux en-têtes
HTTP et l’alignement schéma/migration. Elle ne remplace pas les tests métier,
d’autorisation et d’accès croisé attendus pour chaque nouvelle route.

Si vous modifiez le schéma Drizzle :

```bash
npm run db:generate
```

Relisez la migration générée avant de l’inclure.

## Choisir un sujet

Une issue est recommandée avant de commencer :

- une évolution du modèle de données ;
- une route d’API ;
- une authentification ou autorisation ;
- une modification du cycle d’une release ou d’une décision ;
- une nouvelle dépendance ;
- le futur protocole agent/relais ;
- un changement de stockage, d’hébergement ou de chiffrement.

Une correction locale, un test ou une amélioration documentaire évidente peut
être proposée directement.

## Règles de conception

### Distinguer le prototype de la cible

Employez ces statuts :

- **implémenté** : code fusionné et comportement vérifié ;
- **prototype** : démonstration interactive sans garantie de production ;
- **prévu** : périmètre décidé mais absent ;
- **recherche** : faisabilité ou compromis non tranché ;
- **hors périmètre** : explicitement non poursuivi.

Une maquette, une chaîne de caractères ou une interface TypeScript ne rend pas
une fonctionnalité « implémentée ».

### Préserver les frontières

Le plan de revue et le futur transport réseau sont deux systèmes différents.
Le Worker vinext ne doit pas devenir un relais long-lived ou un proxy
générique.

Avant d’ajouter ou de déplacer une frontière de confiance :

1. ouvrez une proposition d’ADR dans `docs/adr/` ;
2. décrivez les actifs et les menaces ;
3. ajoutez les tests d’autorisation ou d’isolation nécessaires ;
4. mettez à jour `docs/THREAT_MODEL.md`.

### Protéger les données

Les tests, captures et exemples doivent être synthétiques :

- pas de base de production ;
- pas de capture client ;
- pas de cookie, token, clé ou mot de passe réel ;
- pas d’adresse personnelle ou d’identité réelle sans consentement ;
- pas de secret dans un nom de branche, un log ou une fixture.

N’ajoutez jamais un mode « développement » qui accepte aveuglément des headers
d’identité sur un déploiement public.

### Accessibilité

Pour toute interface :

- parcours complet au clavier ;
- focus visible ;
- intitulés accessibles pour les boutons icônes ;
- états qui ne reposent pas seulement sur une couleur ;
- utilisabilité à 360 px ;
- respect de `prefers-reduced-motion` pour les mouvements non essentiels ;
- message d’erreur avec une action corrective.

## Pull requests

Une pull request devrait :

- rester concentrée sur un problème ;
- expliquer le résultat utilisateur ;
- distinguer faits, hypothèses et travail futur ;
- lister les commandes de vérification exécutées ;
- inclure des tests proportionnés au risque ;
- contenir des captures pour un changement visuel ;
- mentionner les impacts accessibilité, sécurité et données ;
- mettre à jour les documents concernés.

Pour une mutation d’API, testez au minimum :

- entrée invalide ;
- ressource absente ;
- identité absente ;
- accès à la ressource d’un autre projet ;
- répétition de la requête ;
- transition d’état interdite.

Ne changez un statut documentaire de « prévu » à « implémenté » que dans la
même pull request que le code et les tests correspondants.

## Commits

Préférez des commits petits et cohérents. Le message est une phrase humaine en
français, à l’impératif ou au présent, par exemple :

```text
Ajoute la validation d’origine aux mutations client
```

Les contributions internationales peuvent utiliser l’anglais. Évitez les
messages vagues tels que `fix`, `update` ou `wip`.

Revaloop utilise le
[Developer Certificate of Origin 1.1](https://developercertificate.org/).
Signez chaque commit :

```bash
git commit -s
```

La ligne `Signed-off-by` certifie que vous avez le droit de proposer la
contribution sous la licence du projet. Aucun CLA supplémentaire n’est demandé
à ce stade.

## Documentation et ADR

Les documents canoniques sont en français. Les termes d’API et de protocole
restent en anglais lorsqu’ils constituent des identifiants techniques.

Un ADR suit ce format :

```text
# NNNN — Titre

- Statut
- Date
- Contexte
- Décision
- Conséquences positives
- Coûts et risques
- Alternatives écartées
```

Un ADR accepté n’est pas une preuve d’implémentation. Son statut technique doit
toujours être indiqué séparément.

## Licence des contributions

Sauf mention écrite contraire, toute contribution soumise au projet est
proposée sous les termes de l’[Apache License 2.0](LICENSE), conformément à la
section 5 de cette licence.
