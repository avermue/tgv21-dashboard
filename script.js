// ============================================
// CONFIGURATION
// ============================================

const LIAISONS = {
  besancon: {
    aller:  { depart: "BESANCON FRANCHE COMTE TGV", arrivee: "PARIS LYON", label: "Besançon → Paris" },
    retour: { depart: "PARIS LYON", arrivee: "BESANCON FRANCHE COMTE TGV", label: "Paris → Besançon" }
  },
  mulhouse: {
    aller:  { depart: "MULHOUSE VILLE", arrivee: "PARIS LYON", label: "Mulhouse → Paris" },
    retour: { depart: "PARIS LYON", arrivee: "MULHOUSE VILLE", label: "Paris → Mulhouse" }
  }
};

const etatGraphiques = {
  1: { liaison: "besancon", sens: "aller" },
  2: { liaison: "besancon", sens: "aller" },
  3: { liaison: "besancon", sens: "aller" },
  4: { liaison: "besancon", sens: "aller" }
};

const donnees = {
  "besancon-aller":  null,
  "besancon-retour": null,
  "mulhouse-aller":  null,
  "mulhouse-retour": null
};

// Identifiants des canvas par numéro de graphique
const CANVAS = {
  1: "monGraphique",
  2: "monGraphique2",
  3: "monGraphique3",
  4: "monGraphique4"
};

let graphiques = { 1: null, 2: null, 3: null, 4: null };
let anneeSelectionnee = "toutes";

// Métadonnées extraites de l'API (alimentent le footer)
let metaDonnees = {
  derniereMaj: null,
  derniereDonnee: null
};


// ============================================
// POLYFILL
// ============================================

// roundRect n'est pas supporté sur Safari < 16
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (typeof r === "number") r = [r, r, r, r];
    this.beginPath();
    this.moveTo(x + r[0], y);
    this.lineTo(x + w - r[1], y);
    this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
    this.lineTo(x + w, y + h - r[2]);
    this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
    this.lineTo(x + r[3], y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
    this.lineTo(x, y + r[0]);
    this.quadraticCurveTo(x, y, x + r[0], y);
    this.closePath();
    return this;
  };
}


// ============================================
// UTILITAIRES — FORMATAGE
// ============================================

function formatDuree(minutes) {
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  if (mins === 0) return `${secs} sec`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} sec`;
}

function formatDateFrancaise(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric"
  });
}

function formatMoisFrancais(yyyymm) {
  if (!yyyymm) return "—";
  const [annee, mois] = yyyymm.split("-").map(Number);
  const noms = ["janvier", "février", "mars", "avril", "mai", "juin",
                "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${noms[mois - 1]} ${annee}`;
}


// ============================================
// UTILITAIRES — STATISTIQUES
// ============================================

function calculerRegression(valeurs) {
  const n = valeurs.length;
  if (n < 2) return { r2: 0, droite: valeurs };
  const xs = valeurs.map((_, i) => i);
  const moyX = xs.reduce((a, b) => a + b, 0) / n;
  const moyY = valeurs.reduce((a, b) => a + b, 0) / n;
  const num  = xs.reduce((s, x, i) => s + (x - moyX) * (valeurs[i] - moyY), 0);
  const den  = xs.reduce((s, x) => s + (x - moyX) ** 2, 0);
  const pente     = num / den;
  const intercept = moyY - pente * moyX;
  const ssTot = valeurs.reduce((s, y) => s + (y - moyY) ** 2, 0);
  const ssRes = xs.reduce((s, x, i) => s + (valeurs[i] - (pente * x + intercept)) ** 2, 0);
  const r2    = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const droite = xs.map(x => parseFloat((pente * x + intercept).toFixed(2)));
  return { r2, droite };
}

function construireDroite(valeurs, droiteBrute) {
  let idx = 0;
  return valeurs.map(v => v === null ? null : droiteBrute[idx++]);
}

function ajouterRegression(datasets, valeurs) {
  const valeursFiltrees = valeurs.filter(v => v !== null);
  const { r2, droite: droiteBrute } = calculerRegression(valeursFiltrees);
  if (r2 >= 0.1) {
    datasets.push({
      label: `Tendance (R² = ${r2.toFixed(2)})`,
      data: construireDroite(valeurs, droiteBrute),
      borderColor: "red", borderWidth: 2, borderDash: [6, 4],
      pointRadius: 0, fill: false, tension: 0, spanGaps: true
    });
  }
}


// ============================================
// UTILITAIRES — DATES / MOIS
// ============================================

function calculerPlageCommune(...tousLesResultats) {
  const debuts = tousLesResultats.map(r => r[0].date);
  const fins   = tousLesResultats.map(r => r[r.length - 1].date);
  const debut  = debuts.reduce((a, b) => a > b ? a : b);
  const fin    = fins.reduce((a, b) => a < b ? a : b);
  return { debut, fin };
}

function genererTousMois(debut, fin) {
  const mois = [];
  let [annee, moisNum] = debut.split("-").map(Number);
  const [anneeF, moisF] = fin.split("-").map(Number);
  while (annee < anneeF || (annee === anneeF && moisNum <= moisF)) {
    mois.push(`${annee}-${String(moisNum).padStart(2, "0")}`);
    moisNum++;
    if (moisNum > 12) { moisNum = 1; annee++; }
  }
  return mois;
}

function labelsAvecAnnee(tousLesMois) {
  return tousLesMois.map((mois, i) => {
    if (i === 0) return mois;
    if (mois.endsWith("-01")) return mois;
    return "";
  });
}

function filtrerMoisParAnnee(tousLesMois) {
  if (anneeSelectionnee === "toutes") return tousLesMois;
  return tousLesMois.filter(m => m.startsWith(anneeSelectionnee));
}

function genererLabelsX(moisFiltres) {
  if (anneeSelectionnee !== "toutes") return moisFiltres;
  return labelsAvecAnnee(moisFiltres);
}


// ============================================
// UTILITAIRES — CHART.JS
// ============================================

function legendeAvecLigne(chart) {
  return chart.data.datasets.map((ds, i) => ({
    text:        ds.label,
    strokeStyle: ds.borderColor,
    fillStyle:   i === 0 ? ds.backgroundColor : "transparent",
    lineDash:    ds.borderDash || [],
    lineWidth:   ds.borderWidth,
    hidden:      false,
    datasetIndex: i
  }));
}

// Construit les options Chart.js. moisAffiches est passé explicitement pour le tooltip
// (correction du bug de capture par closure / scope leak)
function optionsCommunes(moisAffiches, yMin, yMax, stepSize, labelY, tooltipLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { generateLabels: legendeAvecLigne } },
      tooltip: {
        callbacks: {
          title: (items) => moisAffiches[items[0].dataIndex],
          label: tooltipLabel
        }
      }
    },
    scales: {
      x: { title: { display: false }, ticks: { autoSkip: false, maxRotation: 90 } },
      y: {
        title: { display: true, text: labelY },
        min: yMin,
        max: yMax,
        ticks: { stepSize }
      }
    }
  };
}

function datasetPrincipal(label, valeurs, couleur = "#003189") {
  return {
    label,
    data: valeurs,
    borderColor: couleur,
    backgroundColor: couleur === "#003189"
      ? "rgba(0, 49, 137, 0.1)"
      : `${couleur}1a`,
    borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3, spanGaps: false
  };
}

function calculerEchelleY(maxValeur) {
  if (!isFinite(maxValeur) || maxValeur <= 0) return { yMax: 10, stepSize: 2 };
  if (maxValeur < 10) {
    return { yMax: Math.ceil(maxValeur / 2) * 2, stepSize: 2 };
  } else if (maxValeur <= 30) {
    return { yMax: Math.ceil(maxValeur / 5) * 5, stepSize: 5 };
  } else {
    return { yMax: Math.ceil(maxValeur / 10) * 10, stepSize: 10 };
  }
}


// ============================================
// EXPORT JPG (haute résolution propre)
// ============================================

// Re-rend le graphique à la résolution cible au lieu de copier le canvas DOM
// (ce qui produisait une image floue/étirée)
async function exporterGraphique(numG, nomFichier) {
  const etat = etatGraphiques[numG];

  // Label du sens pour l'encart
  let labelSens;
  if (etat.liaison === "toutes") {
    labelSens = "Toutes liaisons";
  } else {
    const villes = { besancon: "Besançon", mulhouse: "Mulhouse" };
    const ville  = villes[etat.liaison];
    labelSens    = etat.sens === "aller" ? `${ville} → Paris` : `Paris → ${ville}`;
  }

  // Récupère la config Chart.js actuelle
  const chartActuel = graphiques[numG];
  if (!chartActuel) return;

  // Dimensions cibles (paysage haute résolution)
  const W = 1600;
  const H = 800;

  // Canvas hors-écran pour le rendu haute résolution
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width  = W;
  exportCanvas.height = H;
  exportCanvas.style.width  = `${W}px`;
  exportCanvas.style.height = `${H}px`;

  // Conteneur invisible (Chart.js a besoin que le canvas soit dans le DOM
  // pour mesurer correctement)
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:fixed; left:-99999px; top:0; width:${W}px; height:${H}px; background:white;`;
  wrapper.appendChild(exportCanvas);
  document.body.appendChild(wrapper);

  try {
    // Clone profond de la config (data + options) pour ne pas perturber le graphique original
    const configExport = {
      type: chartActuel.config.type,
      data: JSON.parse(JSON.stringify(chartActuel.config.data)),
      options: JSON.parse(JSON.stringify(chartActuel.options))
    };

    // Restaurer la fonction generateLabels (perdue au JSON.stringify)
    if (configExport.options?.plugins?.legend?.labels) {
      configExport.options.plugins.legend.labels.generateLabels = legendeAvecLigne;
    }
    // Tooltip n'a pas d'effet en image exportée, on peut le laisser tel quel
    // mais on supprime les callbacks (non-sérialisables) pour éviter tout bruit
    if (configExport.options?.plugins?.tooltip) {
      delete configExport.options.plugins.tooltip.callbacks;
    }

    // Désactiver l'aspect ratio adaptatif et figer responsive pour le canvas hors-écran
    configExport.options.responsive = false;
    configExport.options.maintainAspectRatio = false;
    // Désactiver les animations pour rendu immédiat
    configExport.options.animation = false;
    // Police plus grande pour la haute résolution
    configExport.options.font = { size: 16 };
    if (configExport.options.scales?.x?.ticks) {
      configExport.options.scales.x.ticks.font = { size: 13 };
    }
    if (configExport.options.scales?.y?.ticks) {
      configExport.options.scales.y.ticks.font = { size: 13 };
    }
    if (configExport.options.scales?.y?.title) {
      configExport.options.scales.y.title.font = { size: 15, weight: "bold" };
    }
    if (configExport.options.plugins?.legend?.labels) {
      configExport.options.plugins.legend.labels.font = { size: 14 };
    }

    // Rendre le graphique sur le canvas haute résolution
    const chartExport = new Chart(exportCanvas.getContext("2d"), configExport);

    // Laisser un tick pour que le rendu soit complet
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Composer l'image finale avec encart
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width  = W;
    finalCanvas.height = H;
    const ctx = finalCanvas.getContext("2d");

    // Fond blanc
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, W, H);

    // Dessiner le graphique haute résolution (1:1, plus aucun étirement)
    ctx.drawImage(exportCanvas, 0, 0, W, H);

    // Encart sens (haut droit)
    const padding   = 20;
    const fontSize  = 28;
    ctx.font        = `bold ${fontSize}px Arial, sans-serif`;
    const textWidth = ctx.measureText(labelSens).width;
    const boxW      = textWidth + padding * 2;
    const boxH      = fontSize + padding;
    const boxX = W - boxW - 20;
    const boxY = 20;

    ctx.fillStyle = "#003189";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.fillText(labelSens, boxX + padding, boxY + boxH - padding / 2);

    // Téléchargement
    const lien = document.createElement("a");
    lien.href = finalCanvas.toDataURL("image/jpeg", 0.92);
    lien.download = `sncf-${nomFichier}.jpg`;
    lien.click();

    // Nettoyage
    chartExport.destroy();

  } finally {
    document.body.removeChild(wrapper);
  }
}


// ============================================
// CHARGEMENT DES DONNÉES
// ============================================

async function chargerToutesDonnees(liaison, sens) {
  const config    = LIAISONS[liaison][sens];
  const dateDebut = "2022-01";
  const limite    = 100;
  let offset      = 0;
  let resultats   = [];

  while (true) {
    const url = `https://data.sncf.com/api/explore/v2.1/catalog/datasets/regularite-mensuelle-tgv-aqst/records`
      + `?where=gare_depart="${config.depart}" AND gare_arrivee="${config.arrivee}"`
      + `&order_by=date asc&limit=${limite}&offset=${offset}`;

    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const data = await reponse.json();

    resultats = resultats.concat(
      data.results.filter(r => r.date >= dateDebut)
    );

    if (data.results.length < limite) break;
    offset += limite;
  }

  return resultats;
}

async function chargerSiNecessaire(liaison, sens) {
  const cle = `${liaison}-${sens}`;
  if (!donnees[cle]) {
    donnees[cle] = await chargerToutesDonnees(liaison, sens);
  }
}

// Récupère les métadonnées du dataset (date de dernière modification API)
async function chargerMetadonnees() {
  try {
    const url = "https://data.sncf.com/api/explore/v2.1/catalog/datasets/regularite-mensuelle-tgv-aqst";
    const reponse = await fetch(url);
    if (!reponse.ok) return;
    const data = await reponse.json();
    // Le champ peut s'appeler data_processed, modified, ou se trouver dans metas.default
    metaDonnees.derniereMaj = data?.data_processed
                            || data?.metas?.default?.modified
                            || data?.metas?.default?.data_processed
                            || null;
  } catch (e) {
    console.warn("Impossible de récupérer les métadonnées :", e);
  }
}

function calculerDerniereDonnee() {
  // Le mois le plus récent disponible parmi tous les jeux de données
  const dates = [];
  Object.values(donnees).forEach(serie => {
    if (serie && serie.length > 0) {
      dates.push(serie[serie.length - 1].date);
    }
  });
  if (dates.length === 0) return null;
  // Format YYYY-MM-DD ou YYYY-MM, on extrait juste le YYYY-MM
  const max = dates.reduce((a, b) => a > b ? a : b);
  return max.substring(0, 7);
}

function mettreAJourFooterMetadata() {
  const elMaj = document.getElementById("info-derniere-maj");
  const elDonnee = document.getElementById("info-derniere-donnee");

  if (elMaj) elMaj.textContent = formatDateFrancaise(metaDonnees.derniereMaj);
  if (elDonnee) elDonnee.textContent = formatMoisFrancais(calculerDerniereDonnee());
}


// ============================================
// LANCEMENT GLOBAL
// ============================================

async function chargerTout() {
  document.getElementById("chargement").style.display = "block";
  document.getElementById("erreur").style.display     = "none";

  try {
    await Promise.all([
      chargerSiNecessaire("besancon", "aller"),
      chargerSiNecessaire("besancon", "retour"),
      chargerSiNecessaire("mulhouse", "aller"),
      chargerSiNecessaire("mulhouse", "retour"),
      chargerMetadonnees()
    ]);

    document.getElementById("chargement").style.display = "none";
    construireBoutonsAnnees();
    mettreAJourFooterMetadata();
    [1, 2, 3, 4].forEach(g => afficherGraphique(g));

  } catch (erreur) {
    document.getElementById("chargement").style.display = "none";
    document.getElementById("erreur").style.display     = "block";
    console.error("Erreur API :", erreur);
  }
}


// ============================================
// GESTION DES ANNÉES
// ============================================

const ANNEES_PREVUES = ["toutes", "2022", "2023", "2024", "2025", "2026", "2027"];

function construireBoutonsAnnees() {
  const anneesDisponibles = new Set();
  Object.values(donnees).forEach(serie => {
    if (serie) serie.forEach(r => anneesDisponibles.add(r.date.substring(0, 4)));
  });

  const conteneur = document.getElementById("boutons-annees");
  conteneur.innerHTML = "";

  ANNEES_PREVUES.forEach(annee => {
    const btn = document.createElement("button");
    btn.textContent = annee === "toutes" ? "Toutes" : annee;
    btn.id = `btn-annee-${annee}`;

    if (annee === "toutes" || anneesDisponibles.has(annee)) {
      btn.onclick = () => changerAnnee(annee);
      if (annee === anneeSelectionnee) btn.classList.add("actif");
    } else {
      btn.classList.add("grise");
      btn.disabled = true;
    }

    conteneur.appendChild(btn);
  });
}

function changerAnnee(annee) {
  anneeSelectionnee = annee;

  ANNEES_PREVUES.forEach(a => {
    const btn = document.getElementById(`btn-annee-${a}`);
    if (btn && !btn.disabled) btn.classList.toggle("actif", a === annee);
  });

  [1, 2, 3, 4].forEach(g => afficherGraphique(g));
}


// ============================================
// DONNÉES SELON L'ÉTAT DU GRAPHIQUE
// ============================================

function obtenirJeuxDeDonnees(numG) {
  const { liaison, sens } = etatGraphiques[numG];
  if (liaison === "toutes") {
    return [
      donnees["besancon-aller"],
      donnees["besancon-retour"],
      donnees["mulhouse-aller"],
      donnees["mulhouse-retour"]
    ];
  }
  return [ donnees[`${liaison}-${sens}`] ];
}

// yMax global sur toutes les liaisons pour figer l'échelle Y
// (évite les sauts visuels quand on change de liaison)
function yMaxGlobal(calculValeur) {
  const toutesValeurs = ["besancon-aller", "besancon-retour", "mulhouse-aller", "mulhouse-retour"]
    .flatMap(cle => donnees[cle].map(r => calculValeur(r)).filter(v => v !== null && !isNaN(v)));
  return Math.max(...toutesValeurs);
}


// ============================================
// GESTION DES BOUTONS LIAISON
// ============================================

function changerLiaison(numG, liaison) {
  const etat = etatGraphiques[numG];

  if (liaison === "toutes") {
    etat.liaison = "toutes";
    mettreAJourBoutonsLiaison(numG);
    afficherGraphique(numG);
    return;
  }

  if (etat.liaison === liaison) {
    etat.sens = etat.sens === "aller" ? "retour" : "aller";
  } else {
    etat.liaison = liaison;
    etat.sens    = "aller";
  }

  mettreAJourBoutonsLiaison(numG);
  afficherGraphique(numG);
}

function mettreAJourBoutonsLiaison(numG) {
  const { liaison, sens } = etatGraphiques[numG];
  const villes = { besancon: "Besançon", mulhouse: "Mulhouse" };

  ["besancon", "mulhouse", "toutes"].forEach(l => {
    const btn = document.getElementById(`g${numG}-${l}`);
    btn.classList.remove("actif-aller", "actif-retour", "actif-toutes");
  });

  if (liaison === "toutes") {
    document.getElementById(`g${numG}-toutes`).classList.add("actif-toutes");
    // Réinitialise les libellés des autres boutons (sinon "Paris → X" peut rester affiché)
    ["besancon", "mulhouse"].forEach(l => {
      const btn = document.getElementById(`g${numG}-${l}`);
      btn.textContent = `${villes[l]} → Paris`;
    });
  } else {
    const btn   = document.getElementById(`g${numG}-${liaison}`);
    const ville = villes[liaison];
    if (sens === "aller") {
      btn.classList.add("actif-aller");
      btn.textContent = `${ville} → Paris`;
    } else {
      btn.classList.add("actif-retour");
      btn.textContent = `Paris → ${ville}`;
    }
    // L'autre liaison non sélectionnée revient à son libellé "aller" par défaut
    const autre = liaison === "besancon" ? "mulhouse" : "besancon";
    document.getElementById(`g${numG}-${autre}`).textContent = `${villes[autre]} → Paris`;
  }
}


// ============================================
// CALCUL DES VALEURS — PAR TYPE DE GRAPHIQUE
// ============================================

// G1 : retard moyen (champ direct, en minutes)
function calculerValeursRetardMoyen(numG, moisAffiches, jeuxDeDonnees) {
  if (etatGraphiques[numG].liaison === "toutes") {
    return moyennePondereeRetard(moisAffiches, jeuxDeDonnees);
  }
  // Liaison unique : valeur du champ, clampée à 0
  const index = {};
  jeuxDeDonnees[0].forEach(r => {
    if (r.retard_moyen_tous_trains_arrivee !== null && r.retard_moyen_tous_trains_arrivee !== undefined) {
      index[r.date.substring(0, 7)] = Math.max(0, r.retard_moyen_tous_trains_arrivee);
    }
  });
  return moisAffiches.map(m => index[m] !== undefined ? index[m] : null);
}

// Moyenne pondérée du retard moyen par le nombre de trains prévus
function moyennePondereeRetard(moisAffiches, jeuxDeDonnees) {
  return moisAffiches.map(mois => {
    let sommeValeurPoids = 0;
    let sommePoids = 0;
    jeuxDeDonnees.forEach(resultats => {
      const r = resultats.find(r => r.date.substring(0, 7) === mois);
      if (r && r.nb_train_prevu > 0 && r.retard_moyen_tous_trains_arrivee !== null) {
        sommeValeurPoids += Math.max(0, r.retard_moyen_tous_trains_arrivee) * r.nb_train_prevu;
        sommePoids += r.nb_train_prevu;
      }
    });
    return sommePoids > 0 ? parseFloat((sommeValeurPoids / sommePoids).toFixed(4)) : null;
  });
}

// G2/G3/G4 : pourcentage à partir d'un compteur / nb_train_prevu
function calculerValeursPourcentage(numG, moisAffiches, jeuxDeDonnees, champCompteur) {
  if (etatGraphiques[numG].liaison === "toutes") {
    // Σ compteur / Σ trains prévus × 100
    return moisAffiches.map(mois => {
      let totalCompteur = 0, totalPrevu = 0;
      jeuxDeDonnees.forEach(resultats => {
        const r = resultats.find(r => r.date.substring(0, 7) === mois);
        if (r && r.nb_train_prevu > 0) {
          totalCompteur += (r[champCompteur] || 0);
          totalPrevu    += r.nb_train_prevu;
        }
      });
      return totalPrevu > 0
        ? Math.max(0, parseFloat(((totalCompteur / totalPrevu) * 100).toFixed(2)))
        : null;
    });
  }
  // Liaison unique
  return moisAffiches.map(mois => {
    const r = jeuxDeDonnees[0].find(r => r.date.substring(0, 7) === mois);
    if (!r || r.nb_train_prevu === 0) return null;
    return Math.max(0, parseFloat(((r[champCompteur] / r.nb_train_prevu) * 100).toFixed(2)));
  });
}


// ============================================
// AFFICHAGE GÉNÉRIQUE
// ============================================

function dessinerGraphique(numG, config) {
  const jeuxDeDonnees  = obtenirJeuxDeDonnees(numG);
  const { debut, fin } = calculerPlageCommune(...jeuxDeDonnees);
  const tousLesMois    = genererTousMois(debut, fin);
  const moisAffiches   = filtrerMoisParAnnee(tousLesMois);

  const valeurs = config.calculerValeurs(moisAffiches, jeuxDeDonnees);
  const maxBrut = yMaxGlobal(config.calculBrutPourMax);
  const { yMax, stepSize } = calculerEchelleY(maxBrut);

  const datasets = [ datasetPrincipal(config.labelDataset, valeurs) ];
  ajouterRegression(datasets, valeurs);

  if (graphiques[numG]) graphiques[numG].destroy();

  graphiques[numG] = new Chart(
    document.getElementById(CANVAS[numG]).getContext("2d"), {
      type: "line",
      data: { labels: genererLabelsX(moisAffiches), datasets },
      options: optionsCommunes(moisAffiches, 0, yMax, stepSize, config.labelY, config.tooltip)
    }
  );
}


// ============================================
// DISPATCHER + CONFIGURATIONS DES 4 GRAPHIQUES
// ============================================

function afficherGraphique(numG) {
  switch (numG) {

    case 1:
      dessinerGraphique(1, {
        calculerValeurs: (mois, jeux) => calculerValeursRetardMoyen(1, mois, jeux),
        calculBrutPourMax: r => r.retard_moyen_tous_trains_arrivee !== null
          ? Math.max(0, r.retard_moyen_tous_trains_arrivee)
          : null,
        labelDataset: "Retard moyen à l'arrivée (min)",
        labelY: "Retard moyen (min)",
        tooltip: (item) => {
          if (item.parsed.y === null) return null;
          if (item.datasetIndex === 0) return `Retard moyen : ${formatDuree(item.parsed.y)}`;
          return `Tendance : ${formatDuree(item.parsed.y)}`;
        }
      });
      break;

    case 2:
      dessinerGraphique(2, {
        calculerValeurs: (mois, jeux) => calculerValeursPourcentage(2, mois, jeux, "nb_train_retard_arrivee"),
        calculBrutPourMax: r => r.nb_train_prevu > 0
          ? (r.nb_train_retard_arrivee / r.nb_train_prevu) * 100
          : null,
        labelDataset: "% de trains en retard à l'arrivée",
        labelY: "% de trains en retard",
        tooltip: (item) => {
          if (item.parsed.y === null) return null;
          if (item.datasetIndex === 0) return `Trains en retard : ${item.parsed.y} %`;
          return `Tendance : ${item.parsed.y} %`;
        }
      });
      break;

    case 3:
      dessinerGraphique(3, {
        calculerValeurs: (mois, jeux) => calculerValeursPourcentage(3, mois, jeux, "nb_train_retard_sup_30"),
        calculBrutPourMax: r => r.nb_train_prevu > 0
          ? Math.max(0, (r.nb_train_retard_sup_30 / r.nb_train_prevu) * 100)
          : null,
        labelDataset: "% trains en retard > 30 min",
        labelY: "% de trains prévus",
        tooltip: (item) => {
          if (item.parsed.y === null) return null;
          if (item.datasetIndex === 0) return `Retard > 30 min : ${item.parsed.y} %`;
          return `Tendance : ${item.parsed.y} %`;
        }
      });
      break;

    case 4:
      dessinerGraphique(4, {
        calculerValeurs: (mois, jeux) => calculerValeursPourcentage(4, mois, jeux, "nb_train_retard_sup_60"),
        calculBrutPourMax: r => r.nb_train_prevu > 0
          ? Math.max(0, (r.nb_train_retard_sup_60 / r.nb_train_prevu) * 100)
          : null,
        labelDataset: "% trains en retard > 60 min",
        labelY: "% de trains prévus",
        tooltip: (item) => {
          if (item.parsed.y === null) return null;
          if (item.datasetIndex === 0) return `Retard > 60 min : ${item.parsed.y} %`;
          return `Tendance : ${item.parsed.y} %`;
        }
      });
      break;
  }
}


// ============================================
// LANCEMENT
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  chargerTout();
});
