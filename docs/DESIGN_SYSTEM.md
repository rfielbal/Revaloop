# Système de design Revaloop

## Intention

Revaloop matérialise un fil de validation entre une personne qui teste et une
personne qui construit. L’interface doit être calme, précise et humaine. Elle
évite les codes visuels génériques des outils IA : noir dominant, accent néon,
grille technique, faux scanners, cartes rectangulaires répétées et animations
permanentes.

Les trois surfaces partagent les mêmes fondations, avec des densités distinctes :

- le site général est éditorial et explique le parcours ;
- l’espace développeur est dense, opératoire et centré sur le prochain retour ;
- l’espace client est guidé, tactile et rassurant.

## Architecture des tokens

Les primitives vivent dans `app/product-ui.css` sous le préfixe `--rv-*`.
Les composants consomment des rôles sémantiques et non des couleurs arbitraires.
Les alias `--flow-*` assurent la migration progressive des composants existants.

### Couleurs

| Rôle | Token | Valeur | Usage |
| --- | --- | --- | --- |
| Toile | `--rv-color-canvas` | `#f7f3ed` | Fond général |
| Surface | `--rv-color-surface` | `#fffdf9` | Cartes, panneaux, formulaires |
| Contenu | `--rv-color-content` | `#342a38` | Texte principal |
| Secondaire | `--rv-color-content-secondary` | `#5a4f5e` | Paragraphes secondaires |
| Atténué | `--rv-color-content-muted` | `#625766` | Métadonnées et aides |
| Action | `--rv-color-action` | `#7d435c` | CTA, sélection, focus |
| Action survolée | `--rv-color-action-hover` | `#613246` | Hover et active |
| Retour humain | `--rv-color-feedback` | `#df755d` | Décoration et signal faible |
| Retour fonctionnel | `--rv-color-feedback-strong` | `#ad5442` | Pins portant du texte |
| Information | `--rv-color-info` | `#596895` | Revalidation et information |
| Succès | `--rv-color-success` | `#3f765a` | Validation confirmée |

Le texte courant atteint au minimum 4,5:1 sur les surfaces où il est utilisé.
Le terracotta clair reste décoratif ; les marqueurs numérotés utilisent sa
variante foncée. Le focus est bicolore — papier puis vin — pour rester visible
sur une surface claire comme sur un bouton d’action.

### Typographie

- **Hanken Grotesk** : navigation, contrôles, données et statuts.
- **Instrument Serif** : récit, titres éditoriaux et parole humaine.
- **Geist Mono** : commit, commande et donnée strictement technique.

Échelle de base : `12 / 14 / 16 / 18 px`, complétée par `clamp()` pour les
grands titres. Un texte fonctionnel ne descend jamais sous 12 px. Les champs
restent à 16 px pour éviter le zoom automatique sur mobile.

### Rythme et profondeur

- Espacement : `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px`.
- Contrôle standard : `48 px` minimum.
- Carte opérationnelle : `24 px`.
- Panneau : `36 px`.
- Dialogue : `42 px`.
- Ombre légère : `--rv-shadow-soft`.
- Ombre de premier plan : `--rv-shadow-raised`.

Les rayons asymétriques sont réservés aux annotations, aux messages et aux
moments de passage entre client et développeur. Les contrôles quotidiens restent
simples et prévisibles.

## Composants

### Bouton

Variantes : action, secondaire, fantôme, icône. Tous disposent de `hover`,
`focus-visible`, `active`, `disabled` et `aria-busy`. Une action asynchrone
change aussi son libellé ; l’indicateur visuel ne porte jamais seul le sens.

### Contrôle segmenté

Utilisé pour la perspective, le format d’aperçu et le filtre des retours.
La sélection est exposée avec `aria-pressed`, `aria-selected` ou un rôle de
groupe adapté. La cible tactile mesure au moins 44 px, 48 px par défaut.

### Statut

Le statut associe toujours couleur, libellé et point :

- signalé : rouge terre foncé ;
- en cours : vin ;
- à revalider : bleu ardoise ;
- validé : vert sauge foncé.

La couleur n’est jamais l’unique information.

### Retour

Sur ordinateur, un retour conserve une lecture tabulaire rapide. Sous 820 px,
il devient une carte verticale avec les libellés `Type`, `État` et `Mise à
jour`. La sélection synchronise la ligne, le contexte et le marqueur.

### Panneau et dialogue

Un panneau replié est `inert` et `aria-hidden` : son contenu ne reste pas
atteignable au clavier hors écran. Les dialogues sont modaux, piègent le focus,
se ferment avec `Échap` et restituent le focus à leur déclencheur.

### Formulaire de retour

Les labels restent visibles, les placeholders sont secondaires mais conformes
au contraste AA, les champs mesurent au moins 48 px et le bouton d’envoi reste
accessible sur mobile. Une erreur conserve le texte saisi.

## Responsive

| Seuil | Comportement |
| --- | --- |
| `> 1240 px` | Composition complète et panneaux côte à côte |
| `1020–1240 px` | Grilles resserrées, métriques en deux colonnes |
| `820–1020 px` | Aperçu tablette, détail développeur sous la liste |
| `560–820 px` | Navigation en drawer, retours en cartes, guide en bottom sheet |
| `< 560 px` | Une colonne, actions empilées, métriques sans carrousel |

Les cibles de QA sont `1440`, `1200`, `960`, `390 × 844` et `360 × 800`.

## Mouvement

Les transitions durent 160 à 380 ms avec une courbe de décélération commune.
Le mouvement sert un changement d’état : ouverture d’un guide, placement d’un
pin, changement de format ou validation. Aucun pulse, scanner ou mouvement
permanent. `prefers-reduced-motion` neutralise transitions et animations.

## Thèmes

La version 1 livre un thème clair volontaire, adapté à la confiance et à la
lecture d’une recette. Les composants reposent sur des tokens sémantiques afin
qu’un futur `[data-theme="dark"]` remplace uniquement les rôles de couleur.
Un thème sombre ne sera activé qu’après une QA complète de chaque surface et
ne doit jamais devenir le thème principal implicite.

## Checklist de handoff

- Une seule occurrence logique de `main` et de `h1` par page.
- Navigation clavier complète, focus toujours visible et restitué après modal.
- Contraste AA : 4,5:1 pour le texte courant, 3:1 pour le grand texte.
- Cible tactile de 44 px minimum.
- Pas d’information transmise par la couleur seule.
- États `hover`, `focus`, `active`, `disabled`, `busy`, vide et erreur vérifiés.
- Aucun scroll horizontal imposé par un composant fonctionnel sur mobile.
- Aucun contenu replié encore focusable.
- `prefers-reduced-motion` testé.
- Images sociales optimisées ; icônes Lucide, jamais des caractères décoratifs
  utilisés comme contrôles.
