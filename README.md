# Aniidex — base de données Aniimo

Site statique + données du projet. Généré le 22 août 2026.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Le site complet, autonome. Ouvre-le dans un navigateur, aucune installation. Données, icônes, CSS et JS sont embarqués. |
| `state.json` | Toutes les données : 94 Aniimo (stats, éléments, rôles, métiers, spécialités, compétences, traits, icônes), métiers du Foyer, spécialités de production, table des types. |
| `app.js` / `app.css` | Sources non minifiées, si tu veux modifier le site à la main. |
| `Aniimo_Tableau_Complet.xlsx` | Le classeur Excel : Tous les Aniimos, Métiers, Puissance des compétences, Team, et un onglet par rôle. |
| `icons-specialites/` | Les 8 icônes de spécialité en SVG et PNG. |

## Pages du site

- **Tous les Aniimos** — les 94, triables sur chaque colonne, filtres élément / rôle / métier / type.
- **Puissance des compétences** — classement par puissance des 3 meilleures compétences, avec le type de dégâts et les dégâts du meilleur coup.
- **Métiers du Foyer** — les 4 métiers (Loisir, Artisanat, Parfumerie, Portage), l'échelle de rendement, les spécialités de production et le roster groupé.
- **Team** — deux modes : automatique (tu choisis 1 Aniimo, les 3 autres sont calculés) ou manuel (tu composes les 4). Dans les deux cas : points forts, points faibles, rotation conseillée et couverture élémentaire.
- **Tiers list** — un classement numéroté par rôle (DPS, Break, Support, Regen, Soin), calculé sur les critères propres à chaque rôle.
- **Panneau admin** — édition des fiches, des icônes, des spécialités, des métiers et de l'équipe par défaut.

## Comment l'admin enregistre

Deux niveaux :

1. **Enregistrer** garde un brouillon dans le navigateur (`localStorage`), visible de toi seul.
2. **Publier** (dans la version hébergée sur claude.ai) remplace la page pour tous ceux qui ont le lien.
3. **Exporter le JSON** te rend un `state.json` à jour — c'est celui-là qu'il faut recommiter ici pour garder le dépôt synchronisé.

## Ce qui reste à remplir

Les **spécialités de production** (Minage, Extraction, Cuisine, Forge, Cueillette, Pêche, Exploitation du bois, Parfumerie) ne sont publiées par aucune source consultable. Le champ existe partout et s'édite dans le panneau admin, mais il est vide au départ — à renseigner depuis le jeu.

Deux Aniimo n'ont pas d'illustration dans `icon/` : **Infergon** et **Fennelun**. Ils affichent une pastille générée en attendant.

## Sources

- wiki.aniimo.com — wiki officiel (statistiques de base)
- aniimowiki.com — index complet (éléments et rôles)
- aniimotools.dev — compétences, métiers du Foyer, table des types
