# CLAUDE.md — Brief projet TGV 21 Dashboard

## Présentation

Tableau de bord de ponctualité des TGV sur deux liaisons personnelles :
- **Besançon Franche-Comté TGV ↔ Paris Lyon**
- **Mulhouse Ville ↔ Paris Lyon**

Projet statique (HTML / CSS / JS vanilla), sans framework, sans backend, sans données codées en dur. Tout est chargé en direct depuis l'API open data SNCF à chaque ouverture de la page.

Dépôt GitHub : https://github.com/avermue/tgv21-dashboard  
Répertoire local : `~/codium/tgv21-dashboard`

---

## Stack technique

- **HTML / CSS / JS vanilla** — aucun framework, aucun bundler
- **Chart.js 4.4.7** (CDN, version pinnée) — seule dépendance externe
- **API SNCF** : `https://data.sncf.com/api/explore/v2.1/catalog/datasets/regularite-mensuelle-tgv-aqst/records`
- Déploiement : fichiers statiques, testable en local avec `python3 -m http.server 8000`

---

## Structure des fichiers

```
tgv21-dashboard/
├── index.html   — structure HTML, boutons, canvas, pied de page
├── script.js    — chargement API, calculs, Chart.js, export JPG
├── style.css    — mise en page, responsive, variables CSS
└── CLAUDE.md    — ce fichier
```

---

## Architecture du code (script.js)

### Données

Quatre jeux de données chargés au démarrage, mis en cache dans l'objet `donnees` :
```
donnees["besancon-aller"]
donnees["besancon-retour"]
donnees["mulhouse-aller"]
donnees["mulhouse-retour"]
```

Champs SNCF utilisés par graphique :
| Graphique | Champ(s) |
|-----------|----------|
| G1 — Retard moyen | `retard_moyen_tous_trains_arrivee`, `nb_train_prevu` |
| G2 — % trains en retard | `nb_train_retard_arrivee`, `nb_train_prevu` |
| G3 — % retards < 15 min | `nb_train_retard_arrivee`, `nb_train_retard_sup_15`, `nb_train_prevu` |
| G4 — % retards > 60 min | `nb_train_retard_sup_60`, `nb_train_prevu` |

### Calculs

**G1 — Retard moyen**
- Liaison unique : valeur brute de `retard_moyen_tous_trains_arrivee`, clampée à 0
- Toutes liaisons : moyenne pondérée par `nb_train_prevu`

**G2 — % trains en retard**
- Liaison unique : `nb_train_retard_arrivee / nb_train_prevu × 100`
- Toutes liaisons : `Σ nb_train_retard_arrivee / Σ nb_train_prevu × 100`

**G3 — % retards légers < 15 min**
- Liaison unique : `(nb_train_retard_arrivee − nb_train_retard_sup_15) / nb_train_prevu × 100`
- Toutes liaisons : `Σ (nb_train_retard_arrivee − nb_train_retard_sup_15) / Σ nb_train_prevu × 100`
- Représente les trains en retard mais de moins de 15 minutes

**G4 — % retards graves > 60 min**
- Liaison unique : `nb_train_retard_sup_60 / nb_train_prevu × 100`
- Toutes liaisons : `Σ nb_train_retard_sup_60 / Σ nb_train_prevu × 100`

**Clamp à 0** : toutes les valeurs négatives (possibles dans les données SNCF brutes) sont ramenées à 0 avant affichage et avant agrégation.

**Régression linéaire** : affichée uniquement si R² ≥ 0,10. Calculée par moindres carrés sur les valeurs non-nulles.

### Fonctions clés

| Fonction | Rôle |
|----------|------|
| `chargerTout()` | Point d'entrée — charge les 4 jeux + métadonnées, puis lance les graphiques |
| `chargerToutesDonnees(liaison, sens)` | Pagination automatique de l'API (par tranches de 100) |
| `dessinerGraphique(numG, config)` | Fonction générique qui dessine n'importe lequel des 4 graphiques |
| `calculerValeursRetardMoyen(numG, mois, jeux)` | Calcul spécifique G1 |
| `calculerValeursPourcentage(numG, mois, jeux, extracteur)` | Calcul générique G2/G3/G4 — accepte un nom de champ (string) ou une fonction |
| `exporterGraphique(numG, nomFichier)` | Re-rend le graphique dans un canvas hors-écran 1600×800 pour export JPG propre |
| `mettreAJourFooterMetadata()` | Alimente les champs "dernière MAJ" et "dernière donnée" dans le footer |
| `yMaxGlobal(calculValeur)` | Calcule le yMax sur toutes les liaisons pour figer l'échelle Y |

---

## Comportement des boutons liaison

Chaque graphique a trois boutons : **Besançon**, **Mulhouse**, **Toutes liaisons**.

- Premier clic sur une ville → sens **aller** (ville → Paris), bouton bleu foncé `#003189`
- Deuxième clic sur la même ville → sens **retour** (Paris → ville), bouton bleu clair `#5a7fc1`
- Clic sur **Toutes liaisons** → agrégation des 4 séries, bouton bleu foncé

L'état de chaque graphique est stocké dans `etatGraphiques[numG] = { liaison, sens }`.

---

## Palette de couleurs (à conserver absolument)

```css
--bleu-principal: #003189;   /* SNCF bleu — boutons actifs, titres, header */
--bleu-clair:     #5a7fc1;   /* Bouton sens retour actif */
--gris-fond:      #f4f4f4;
--gris-discret:   #888;      /* Bouton export */
```

Toutes les couleurs sont déclarées en variables CSS dans `:root` dans `style.css`. Ne pas les modifier sans raison.

---

## Responsive

- **Desktop** : mise en page deux colonnes (colonne années à gauche, graphiques 2×2 à droite)
- **Mobile (≤ 768px)** : colonne années en barre horizontale en haut, graphiques empilés en 1 colonne, ratio canvas 4/3
- **Tablette (≤ 1100px)** : footer passe en colonnes simples
- Breakpoints dans `style.css`, section `RESPONSIVE`

---

## Export JPG

L'export re-rend le graphique dans un canvas hors-écran à **1600×800 px** (plus d'étirement/flou). Un encart coloré `#003189` avec le nom de la liaison est ajouté en haut à droite. Format paysage fixe, même sur mobile.

Polyfill `roundRect` inclus pour Safari < 16.

---

## Pied de page

Le footer contient des informations statiques (sources, méthodes de calcul, limites connues) et deux champs dynamiques remplis au chargement :
- `#info-derniere-maj` — date de dernière mise à jour de l'API SNCF
- `#info-derniere-donnee` — mois de la donnée la plus récente disponible

---

## Limites connues du dataset (important pour la lecture)

Le dataset SNCF `regularite-mensuelle-tgv-aqst` ne mesure **pas l'expérience voyageur** mais la ponctualité des sillons ferroviaires. Deux biais structurels connus :

1. **Trains supprimés non comptabilisés** : un train annulé n'apparaît ni dans les retards ni dans `nb_train_prevu`. Les pires incidents (suppressions massives) sont donc invisibles dans les statistiques.

2. **Trains remorqués non comptabilisés** : quand deux trains sont couplés (l'un remorquant l'autre en panne), seul le train remorqueur est enregistré à l'arrivée. Le train remorqué disparaît du comptage, même si tous les voyageurs à bord ont subi le retard. Exemple vécu : retard de 2h en mars 2026 sur Besançon → Paris, absent des statistiques (`nb_train_retard_sup_60 = 0` pour ce mois).

---

## Ce qui a déjà été fait (ne pas réintroduire)

- ✅ Aucune donnée fallback — tout vient de l'API en direct
- ✅ Correction du bug de scope sur `moisAffiches` dans les tooltips
- ✅ Export JPG haute résolution (re-render hors-écran, polices agrandies)
- ✅ Chart.js pinné en 4.4.7
- ✅ Polyfill `roundRect` pour vieux Safari
- ✅ Factorisation des 4 graphiques en un dispatcher générique
- ✅ Responsive mobile complet
- ✅ Footer avec sources, calculs détaillés, dates dynamiques
