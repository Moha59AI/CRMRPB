# DESIGN.md — Langage visuel

Relevé du design d'Onify (concurrent direct : ils vendent **Onify Glass**, « le
logiciel pare-brise des centres bris de glace »), et ce qu'on en a retenu.

Relevé fait le 3 septembre 2026 sur `onify.fr` et `app.onify.fr`.

---

## Ce qu'on a trouvé

Onify a **deux designs sans rapport l'un avec l'autre**, et la distinction
commande tout le reste.

| | Vitrine `onify.fr` | Produit `app.onify.fr` |
|---|---|---|
| Socle | Next.js + Tailwind 4 | jQuery + Bootstrap 5.3 |
| Police | GeistSans, Inter Tight, Caveat | Inter |
| Icônes | SVG | FontAwesome 6 |
| Divers | — | Quill, Firebase, Capacitor |

Le produit est une application PHP classique emballée en natif par Capacitor.
Techniquement, le CRM Relais Pare-Brise (React + Tailwind + shadcn/ui) est
**déjà en avance dessus** : copier son CSS serait une régression.

C'est donc la vitrine qui a été relevée.

---

## Le relevé

### Couleurs propres à Onify

Le reste de leurs 317 variables est la palette Tailwind 4 par défaut, sans
intérêt. Ce qui leur appartient tient en deux rampes.

**Marque** — un indigo, là où Relais Pare-Brise est vert.

```
--color-brand-50   #f0f1ff
--color-brand-100  #d6d9ff
--color-brand-200  #b1b6fc
--color-brand-500  #3b82f6
--color-brand-600  #3f36e2
--color-brand-700  #3123cd
--color-brand-800  #2c21a6
```

**Neutres** — gris purs, sans la moindre teinte.

```
--color-neutral-0    #fff      --color-neutral-50   #8f8f8f
--color-neutral-5    #f9f9f9   --color-neutral-60   #707070
--color-neutral-10   #f2f2f2   --color-neutral-70   #525252
--color-neutral-20   #e6e6e6   --color-neutral-80   #333333
--color-neutral-30   #cccccc   --color-neutral-90   #1f1f1f
--color-neutral-40   #adadad   --color-neutral-100  #101318
```

Sémantique : texte `#101318`, atténué `#707070`, effacé `#adadad`,
bordure `#ebebeb`, bordure marquée `#d9d9d9`.

### Typographie

Corps 16 px / 400, interlettrage **−0,176 px** (−0,011 em).
H1 72 px / 700 à **−1,8 px** (−0,025 em). H2 40 px / 700 à −1 px (−0,025 em).

Le resserrement est appliqué **partout**, y compris au texte courant — pas
seulement aux titres.

### Boutons

Tous en pilule (`border-radius` infini). Trois variantes :

- **Principal** — fond `#101318` (l'encre, pas la marque), blanc, 600, 44-48 px
- **Secondaire** — blanc translucide, bordure `rgba(0,0,0,.08)`,
  ombre `0 6px 20px -10px rgba(15,23,42,.18)`
- **Nu** — texte seul

À noter : **la couleur de marque ne sert jamais de fond de bouton.** L'appel à
l'action est noir ; l'indigo est réservé aux accents.

### Cartes

Rayon 12 px, padding 16 px, bordure `rgba(0,0,0,.06)`, et surtout une ombre
en quatre temps :

```css
inset 0 1px 0 rgba(255,255,255,.85),   /* arête supérieure éclairée */
0  2px  6px  -2px rgba(15,23,42,.06),  /* contact */
0 12px 24px -12px rgba(15,23,42,.12),  /* diffusion */
0 30px 55px -26px rgba(15,23,42,.16);  /* halo */
```

C'est là que se joue l'essentiel de l'impression de qualité.

### Espacement fluide

```css
--compact-px:     clamp(1rem,   .5rem  + 1.5vw, 2rem);
--compact-py:     clamp(1rem,   .75rem + .75vw, 1.5rem);
--compact-gap:    clamp(.75rem, .5rem  + .5vw,  1.5rem);
--compact-radius: clamp(.75rem, .5rem  + .5vw,  1.25rem);
```

Pas de point de rupture : l'espacement interpole du téléphone au grand écran.

---

## Ce qu'on a repris

Dans `src/index.css` et `tailwind.config.js`.

**La rampe de gris purs.** Les neutres du CRM étaient teintés de bleu
(`hsl(226 17% 92%)` pour les bordures, `hsl(228 15% 16%)` pour l'encre).
Neutralisés, ils cessent de concurrencer le vert de la marque.

**L'encre plus sombre.** `#202331` → `#101318`. Contraste plus franc, texte
plus net à petit corps.

**L'interlettrage sur le corps de texte.** −0,011 em. Inter est dessinée large
pour tenir en petit corps sur un mauvais écran ; aux tailles d'interface, ce
même dessin paraît lâche.

**L'ombre en couches**, sous trois portées `--shadow-1/2/3`, avec une recette
distincte en thème sombre — où c'est un liseré clair en haut qui détache une
surface, pas un halo noir sur du noir. Les utilitaires existants
`shadow-sm` / `shadow-md` / `shadow-lg` pointent dessus : les 48 usages déjà
en place en profitent sans être touchés.

**Les gouttières fluides**, en `--gutter-x/y/gap` et en utilitaires
`.gutter-x` / `.gutter-y` / `.gutter-gap`. Le CRM se consulte au téléphone
pendant l'appel et sur grand écran au bureau ; un padding fixe ne peut pas
servir les deux.

**Deux niveaux qui manquaient** : `surface` (fond en retrait, pour poser une
zone sans la border) et `faint` (troisième niveau de texte, sous `muted`).

## Ce qu'on n'a pas repris, et pourquoi

**L'indigo.** Le vert `#16A34A` est la marque de Relais Pare-Brise. Prendre la
couleur d'un concurrent qui vend le même logiciel au même métier serait
échanger son identité contre la sienne.

**Le rayon de 12 px.** `CLAUDE.md` fixe 14-18 px, et rien ne justifie d'en
changer.

**Le bouton principal noir.** Défendable, mais c'est un choix d'identité à
faire à froid, pas un effet de bord d'un relevé technique. Le vert reste.

**Le CSS du produit.** Bootstrap 5.3 et FontAwesome : voir plus haut.

**La vitrine comme telle** — dégradés aurora, Caveat manuscrite, serif
Instrument. C'est du vocabulaire de page d'accueil. Dans un outil qu'on tient
à la main devant un client, ça n'a pas d'emploi.

---

## Une note sur la propriété

Reprendre un **langage** visuel — une échelle de gris, un interlettrage, une
recette d'ombre — est courant et sans risque : ce sont des paramètres, pas des
œuvres. Recopier une feuille de style ou reproduire l'habillage d'un
concurrent au point qu'on confonde les deux produits est autre chose. La
frontière tenue ici : on prend les réglages, on garde notre marque.
