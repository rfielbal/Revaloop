# ADR-0001 — Construire le review plane avant le tunnel

- **Statut de la décision :** accepté
- **Statut d’implémentation :** review plane externe implémenté, data plane absent
- **Date :** 24 juillet 2026

## Contexte

La vision de Revaloop inclut un agent et un relais capables d’exposer une
application locale. Ce data plane apporte immédiatement des risques réseau,
des connexions long-lived, du routage, des certificats, de l’abus et de
l’isolation.

Le starter actuel est une application vinext sur Cloudflare Worker avec D1.
Il convient bien à l’interface et aux opérations métier, mais pas à un relais
HTTP/WebSocket longue durée.

La valeur utilisateur ne se limite pas au transport. Le client a aussi besoin
de savoir quoi tester, de laisser un retour contextualisé et de prendre une
décision sur la bonne version.

## Décision

Construire et éprouver d’abord le **review plane** :

- projets et releases ;
- consignes ;
- espace client ;
- retours ;
- discussion de release ;
- signal de mise à jour de preview ;
- décisions ;
- historique et cycle de vie des données.

Le futur transport est un composant séparé. Le review plane l’utilisera à
travers un `PreviewTargetDriver` :

```text
external | snapshot | tunnel | hosted
```

Le Worker vinext ne doit pas devenir un proxy générique ou un relais réseau.

## Conséquences positives

- valeur produit testable avant d’exposer un poste local ;
- modèle de données et vocabulaire stabilisés ;
- sécurité du portail traitée indépendamment du protocole de tunnel ;
- possibilité d’utiliser des URLs externes ou captures ;
- réutilisation du même espace client pour plusieurs types de preview ;
- data plane libre de choisir un runtime adapté.

## Coûts et risques

- le premier prototype ne résout pas le partage de `localhost` ;
- la promesse « en une commande » doit rester une vision ;
- une URL externe peut changer sans preuve ;
- deux composants devront plus tard être déployés et observés ;
- une abstraction prématurée peut devenir trop large.

## Alternatives écartées

### Implémenter le relais dans le Worker

Écarté : responsabilités, contraintes runtime et surface de risque mal
alignées.

### Construire uniquement un tunnel

Écarté : produit indifférencié et absence de boucle de validation client.

### Construire immédiatement des previews hébergées

Écarté : exécution de code non fiable et isolation de runners beaucoup trop
coûteuses pour le premier incrément.

## Critère de réévaluation

Réévaluer l’interface `PreviewTargetDriver` avant le premier prototype
agent/relais. Ne pas remettre en cause la séparation control/data plane sans
nouvel ADR et modèle de menace.
