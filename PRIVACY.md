# Modèle de notice de confidentialité d’une instance Revaloop

Ce document est un modèle opérationnel à adapter avant d’inviter un client. Il
ne constitue pas un avis juridique.

## Informations à compléter par l’exploitant

- Responsable du traitement : `[nom / organisation]`
- Contact confidentialité : `[adresse e-mail]`
- Hébergeur et région : `[prestataire / pays ou région]`
- Base juridique : `[contrat, intérêt légitime ou autre fondement validé]`
- Durée de conservation des projets et retours : `[durée]`
- Sous-traitants et accord de traitement : `[liste / lien vers le DPA]`

## Données traitées par Revaloop

- nom déclaratif de la session invitée, saisi par le développeur et non vérifié
  par Revaloop ;
- cases de vérification, commentaires, catégorie et importance ;
- chemin de page sans query string, contexte d’écran et repère visuel ;
- décisions et changements d’état ;
- identifiants techniques hachés, dates et journal d’audit minimal.

L’interface fournie ne demande aucune adresse e-mail cliente. Le schéma et
l’API conservent un champ e-mail nullable pour compatibilité avec des clients
API personnalisés ; si un exploitant choisit de l’alimenter, il doit l’ajouter à
sa notice et justifier sa collecte. Cette valeur ne vérifie jamais l’identité.

Revaloop ne collecte pas le contenu des champs, cookies ou identifiants de la
preview. La preview, sa base et ses services externes restent sous la
responsabilité de leur propre exploitant. L’invitation Revaloop protège
l’espace de revue, pas l’URL de staging ni les données que la cliente y saisit.

## Finalités

Les données servent à organiser une phase de test, transmettre les retours,
suivre les corrections, demander une revalidation et documenter le bilan
courant. Une demande d’ajustements laisse la même version ouverte ; seule
l’approbation finale la clôt.

## Destinataires

L’équipe autorisée du projet accède aux retours. Une nouvelle session invitée
sur la même version accède également à l’historique partagé de cette version.
Le nom affiché dans cet historique indique la session déclarée, pas une identité
authentifiée.

## Suppression et droits

L’exploitant doit répondre aux demandes d’accès, rectification et suppression,
et supprimer le projet à la fin de la durée annoncée. Les détails techniques du
cycle de vie figurent dans `docs/DATA_LIFECYCLE.md`.
