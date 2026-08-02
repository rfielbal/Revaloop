# Modèle de notice de confidentialité d’une instance Revaloop

Ce document est un modèle opérationnel. Toutes les valeurs entre crochets
doivent être remplacées et la notice adaptée rendue accessible avant d’inviter
un client. Une notice générique ou incomplète ne suffit pas pour le pilote. Ce
document ne constitue pas un avis juridique.

## Informations à compléter par l’exploitant

- Responsable du traitement : `[nom / organisation]`
- Contact confidentialité : `[adresse e-mail]`
- Hébergeur Revaloop et région : `[prestataire / pays ou région]`
- Fournisseur de preview ou de tunnel et région ou absence de garantie
  régionale : `[prestataire / information applicable]`
- Base juridique : `[contrat, intérêt légitime ou autre fondement validé]`
- Durée de conservation des projets et retours : `[durée]`
- Sous-traitants et accord de traitement : `[liste / lien vers le DPA ou
  justification de son absence]`

## Données traitées par Revaloop

- adresse e-mail et nom affiché du compte développeur ;
- dérivé PBKDF2 du mot de passe, sel, nombre d’itérations et hash des sessions
  développeur ; jamais le mot de passe ni le token de session en clair ;
- nom déclaratif de la session invitée et éventuel e-mail de suivi, saisis par
  le développeur et non vérifiés par Revaloop ;
- vérifications suggérées optionnelles et leur état ;
- commentaires libres, messages de discussion et état des corrections ;
- chemin de page sans query string, contexte d’écran et repère visuel ;
- décisions, changements d’état et numéro de révision de preview ;
- identifiants techniques hachés, dates et journal d’audit minimal.

L’e-mail de suivi est facultatif. Il reste visible uniquement par l’équipe
autorisée du projet dans le dashboard : il n’est pas transmis à la session
invitée, ne vérifie jamais son identité et ne déclenche aucun message. Sa
collecte doit être justifiée et annoncée dans la notice de l’instance.

Revaloop ne collecte pas le contenu des champs, cookies ou identifiants de la
preview. Il ne réalise pas de capture automatique. La preview, son déploiement,
sa base et ses services externes restent sous la responsabilité de leur propre
exploitant. L’invitation Revaloop protège l’espace de revue, pas l’URL de
staging ni les données que la cliente y saisit.

Avec un Quick Tunnel, Cloudflare termine la connexion TLS du navigateur avant
de relayer la requête vers le poste local. Cloudflare peut donc techniquement
voir le contenu HTTP en transit, notamment les headers, cookies et valeurs
envoyées à la preview, ainsi que ses métadonnées de service. L’exploitant doit
l’indiquer, documenter le fournisseur, la région applicable ou son absence de
garantie, les sous-traitants et le DPA, puis interdire toute donnée réelle dans
ce mode de pilote.

## Finalités

Les données servent à authentifier le développeur, organiser une phase de test,
transmettre des retours ou questions libres, suivre les corrections, signaler
une révision de preview, demander une revalidation et documenter le bilan
courant. Une demande d’ajustements laisse la même version ouverte ; seule
l’approbation finale la clôt.

## Destinataires

L’équipe autorisée du projet accède aux retours. Une nouvelle session invitée
sur la même version accède également aux retours et à la discussion partagée de
cette version. Le nom client affiché dans cet historique indique la session
déclarée, pas une identité authentifiée. L’éventuel e-mail de suivi n’est jamais
inclus dans cet espace client et reste visible uniquement par l’équipe.

## Suppression et droits

L’exploitant doit répondre aux demandes d’accès, rectification et suppression,
et supprimer le projet à la fin de la durée annoncée. Les détails techniques du
cycle de vie figurent dans `docs/DATA_LIFECYCLE.md`.
