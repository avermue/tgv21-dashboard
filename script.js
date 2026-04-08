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

let graphiques = { 1: null, 2: null, 3: null, 4: null };
let anneeSelectionnee = "toutes";

// ============================================
// UTILITAIRES
// ============================================

function formatDuree(minutes) {
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  if (mins === 0) return `${secs} sec`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} sec`;
}

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

function exporterGraphique(idCanvas, nomFichier) {
  const numG = { monGraphique: 1, monGraphique2: 2, monGraphique3: 3, monGraphique4: 4 }[idCanvas];
  const etat = etatGraphiques[numG];

  // Construire le label du sens pour l'encart
  let labelSens;
  if (etat.liaison === "toutes") {
    labelSens = "Toutes liaisons";
  } else {
    const villes = { besancon: "Besançon", mulhouse: "Mulhouse" };
    const ville  = villes[etat.liaison];
    labelSens    = etat.sens === "aller" ? `${ville} → Paris` : `Paris → ${ville}`;
  }

  const canvas = document.getElementById(idCanvas);

  // Résolution augmentée : 1600x800
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width  = 1600;
  exportCanvas.height = 800;
  const ctx = exportCanvas.getContext("2d");

  // Fond blanc
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  // Copier le graphique
  ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

  // Encart sens en haut à gauche
  const padding   = 20;
  const fontSize  = 28;
  ctx.font        = `bold ${fontSize}px Arial`;
  const textWidth = ctx.measureText(labelSens).width;
  const boxW      = textWidth + padding * 2;
  const boxH      = fontSize + padding;
  const boxX = exportCanvas.width - boxW - 20;
  const boxY = 20;

  // Fond de l'encart
  ctx.fillStyle = "#003189";
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 6);
  ctx.fill();

  // Texte de l'encart
  ctx.fillStyle = "white";
  ctx.fillText(labelSens, boxX + padding, boxY + boxH - padding / 2);

  // Téléchargement
  const lien     = document.createElement("a");
  lien.href      = exportCanvas.toDataURL("image/jpeg", 0.92);
  lien.download  = `sncf-${nomFichier}.jpg`;
  lien.click();
}

function construireIndex(resultats, champ, traitement = v => v) {
  const index = {};
  resultats.forEach(r => {
    if (r[champ] !== null && r[champ] !== undefined) {
      index[r.date.substring(0, 7)] = traitement(r[champ]);
    }
  });
  return index;
}

function moyennePonderee(tousLesMois, listeResultats, champValeur, champPoids) {
  return tousLesMois.map(mois => {
    let sommeValeurPoids = 0;
    let sommePoids = 0;
    listeResultats.forEach(resultats => {
      const r = resultats.find(r => r.date.substring(0, 7) === mois);
      if (r && r[champPoids] > 0 && r[champValeur] !== null) {
        sommeValeurPoids += Math.max(0, r[champValeur]) * r[champPoids];
        sommePoids += r[champPoids];
      }
    });
    return sommePoids > 0 ? parseFloat((sommeValeurPoids / sommePoids).toFixed(4)) : null;
  });
}

// Calcule le yMax et le stepSize adaptés à la valeur maximale
function calculerEchelleY(maxValeur) {
  if (maxValeur < 10) {
    const yMax = Math.ceil(maxValeur / 2) * 2;
    return { yMax, stepSize: 2 };
  } else if (maxValeur <= 30) {
    const yMax = Math.ceil(maxValeur / 5) * 5;
    return { yMax, stepSize: 5 };
  } else {
    const yMax = Math.ceil(maxValeur / 10) * 10;
    return { yMax, stepSize: 10 };
  }
}

// Filtre les mois selon l'année sélectionnée
function filtrerMoisParAnnee(tousLesMois) {
  if (anneeSelectionnee === "toutes") return tousLesMois;
  return tousLesMois.filter(m => m.startsWith(anneeSelectionnee));
}

// Génère les labels X : tous affichés si une seule année, sinon seulement janvier
function genererLabelsX(moisFiltres) {
  if (anneeSelectionnee !== "toutes") {
    // Mode une seule année : tous les labels affichés
    return moisFiltres;
  }
  return labelsAvecAnnee(moisFiltres);
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

function optionsCommunes(tousLesMois, yMin, yMax, stepSize, labelY, tooltipLabel) {
  return {
    responsive: true,
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

// ============================================
// GESTION DES ANNÉES
// ============================================

const ANNEES_PREVUES = ["toutes", "2022", "2023", "2024", "2025", "2026", "2027"];

function construireBoutonsAnnees() {
  // Détecter les années disponibles dans les données
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
      // Année disponible
      btn.onclick = () => changerAnnee(annee);
      if (annee === anneeSelectionnee) btn.classList.add("actif");
    } else {
      // Année non disponible : grisée et non cliquable
      btn.classList.add("grise");
      btn.disabled = true;
    }

    conteneur.appendChild(btn);
  });
}

function changerAnnee(annee) {
  anneeSelectionnee = annee;

  // Mettre à jour l'apparence des boutons
  ANNEES_PREVUES.forEach(a => {
    const btn = document.getElementById(`btn-annee-${a}`);
    if (btn && !btn.disabled) btn.classList.toggle("actif", a === annee);
  });

  // Redessiner tous les graphiques
  [1, 2, 3, 4].forEach(g => afficherGraphique(g));
}

async function chargerTout() {
  document.getElementById("chargement").style.display = "block";
  document.getElementById("erreur").style.display     = "none";

  try {
    await Promise.all([
      chargerSiNecessaire("besancon", "aller"),
      chargerSiNecessaire("besancon", "retour"),
      chargerSiNecessaire("mulhouse", "aller"),
      chargerSiNecessaire("mulhouse", "retour")
    ]);

    document.getElementById("chargement").style.display = "none";
    construireBoutonsAnnees();
    [1, 2, 3, 4].forEach(g => afficherGraphique(g));

  } catch (erreur) {
    document.getElementById("chargement").style.display = "none";
    document.getElementById("erreur").style.display     = "block";
    console.error("Erreur API :", erreur);
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
    const data    = await reponse.json();

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

// Calcule le yMax global sur tous les sens pour une fonction de calcul donnée
function yMaxGlobal(calculValeur) {
  const toutesValeurs = ["besancon-aller", "besancon-retour", "mulhouse-aller", "mulhouse-retour"]
    .flatMap(cle => donnees[cle].map(r => calculValeur(r)).filter(v => v !== null && !isNaN(v)));
  return Math.max(...toutesValeurs);
}


// ============================================
// GESTION DES BOUTONS
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
  }
}


// ============================================
// DISPATCHER
// ============================================

function afficherGraphique(numG) {
  switch (numG) {
    case 1: afficherG1(); break;
    case 2: afficherG2(); break;
    case 3: afficherG3(); break;
    case 4: afficherG4(); break;
  }
}


// ============================================
// GRAPHIQUE 1 : RETARD MOYEN TOUS TRAINS
// ============================================

function afficherG1() {
  const jeuxDeDonnees  = obtenirJeuxDeDonnees(1);
  const { debut, fin } = calculerPlageCommune(...jeuxDeDonnees);
  const tousLesMois    = genererTousMois(debut, fin);
  const moisAffiches = filtrerMoisParAnnee(tousLesMois);

  let valeurs;
  if (etatGraphiques[1].liaison === "toutes") {
    valeurs = moyennePonderee(moisAffiches, jeuxDeDonnees, "retard_moyen_tous_trains_arrivee", "nb_train_prevu");
  } else {
    const index = construireIndex(jeuxDeDonnees[0], "retard_moyen_tous_trains_arrivee", v => Math.max(0, v));
    valeurs = moisAffiches.map(m => index[m] !== undefined ? index[m] : null);
  }

  const maxBrut = yMaxGlobal(r => r.retard_moyen_tous_trains_arrivee !== null ? Math.max(0, r.retard_moyen_tous_trains_arrivee) : null);
  const { yMax, stepSize } = calculerEchelleY(maxBrut);

  const datasets = [ datasetPrincipal("Retard moyen à l'arrivée (min)", valeurs) ];
  ajouterRegression(datasets, valeurs);

  if (graphiques[1]) graphiques[1].destroy();
  graphiques[1] = new Chart(
    document.getElementById("monGraphique").getContext("2d"), {
      type: "line",
      data: { labels: genererLabelsX(moisAffiches), datasets },
      options: optionsCommunes(moisAffiches, 0, yMax, stepSize, "Retard moyen (min)", (item) => {
        if (item.parsed.y === null) return null;
        if (item.datasetIndex === 0) return `Retard moyen : ${formatDuree(item.parsed.y)}`;
        return `Tendance : ${formatDuree(item.parsed.y)}`;
      })
    }
  );
}


// ============================================
// GRAPHIQUE 2 : % DE TRAINS EN RETARD À L'ARRIVÉE
// ============================================

function afficherG2() {
  const jeuxDeDonnees  = obtenirJeuxDeDonnees(2);
  const { debut, fin } = calculerPlageCommune(...jeuxDeDonnees);
  const tousLesMois    = genererTousMois(debut, fin);
  const moisAffiches = filtrerMoisParAnnee(tousLesMois);

  let valeurs;
  if (etatGraphiques[2].liaison === "toutes") {
    // Moyenne pondérée : somme trains en retard / somme trains prévus
    valeurs = moisAffiches.map(mois => {
      let totalRetard = 0, totalPrevu = 0;
      jeuxDeDonnees.forEach(resultats => {
        const r = resultats.find(r => r.date.substring(0, 7) === mois);
        if (r && r.nb_train_prevu > 0) {
          totalRetard += r.nb_train_retard_arrivee;
          totalPrevu  += r.nb_train_prevu;
        }
      });
      return totalPrevu > 0 ? parseFloat(((totalRetard / totalPrevu) * 100).toFixed(2)) : null;
    });
  } else {
    valeurs = moisAffiches.map(mois => {
      const r = jeuxDeDonnees[0].find(r => r.date.substring(0, 7) === mois);
      if (!r || r.nb_train_prevu === 0) return null;
      return parseFloat(((r.nb_train_retard_arrivee / r.nb_train_prevu) * 100).toFixed(2));
    });
  }

  const maxBrut = yMaxGlobal(r => r.nb_train_prevu > 0
    ? (r.nb_train_retard_arrivee / r.nb_train_prevu) * 100
    : null
  );
  const { yMax, stepSize } = calculerEchelleY(maxBrut);

  const datasets = [ datasetPrincipal("% de trains en retard à l'arrivée", valeurs) ];
  ajouterRegression(datasets, valeurs);

  if (graphiques[2]) graphiques[2].destroy();
  graphiques[2] = new Chart(
    document.getElementById("monGraphique2").getContext("2d"), {
      type: "line",
      data: { labels: genererLabelsX(moisAffiches), datasets },
      options: optionsCommunes(moisAffiches, 0, yMax, stepSize, "% de trains en retard", (item) => {
        if (item.parsed.y === null) return null;
        if (item.datasetIndex === 0) return `Trains en retard : ${item.parsed.y} %`;
        return `Tendance : ${item.parsed.y} %`;
      })
    }
  );
}


// ============================================
// GRAPHIQUE 3 : % RETARDS LEGER (< 15  min)
// ============================================

function afficherG3() {
  const jeuxDeDonnees  = obtenirJeuxDeDonnees(3);
  const { debut, fin } = calculerPlageCommune(...jeuxDeDonnees);
  const tousLesMois    = genererTousMois(debut, fin);
  const moisAffiches   = filtrerMoisParAnnee(tousLesMois);

  // Calcul du % de trains en retard entre 0 et 15 min
  // = (nb_train_retard_arrivee - nb_train_retard_sup_15) / nb_train_prevu * 100
  function calculerPctRetardLeger(r) {
    if (!r || r.nb_train_prevu === 0) return null;
    const retardLeger = r.nb_train_retard_arrivee - r.nb_train_retard_sup_15;
    return Math.max(0, parseFloat(((retardLeger / r.nb_train_prevu) * 100).toFixed(2)));
  }

  let valeurs;
  if (etatGraphiques[3].liaison === "toutes") {
    valeurs = moisAffiches.map(mois => {
      let totalLeger = 0, totalPrevu = 0;
      jeuxDeDonnees.forEach(resultats => {
        const r = resultats.find(r => r.date.substring(0, 7) === mois);
        if (r && r.nb_train_prevu > 0) {
          totalLeger += Math.max(0, r.nb_train_retard_arrivee - r.nb_train_retard_sup_15);
          totalPrevu += r.nb_train_prevu;
        }
      });
      return totalPrevu > 0
        ? Math.max(0, parseFloat(((totalLeger / totalPrevu) * 100).toFixed(2)))
        : null;
    });
  } else {
    valeurs = moisAffiches.map(mois => {
      const r = jeuxDeDonnees[0].find(r => r.date.substring(0, 7) === mois);
      return calculerPctRetardLeger(r);
    });
  }

  const maxBrut = yMaxGlobal(r => {
    if (!r || r.nb_train_prevu === 0) return null;
    const retardLeger = r.nb_train_retard_arrivee - r.nb_train_retard_sup_15;
    return Math.max(0, (retardLeger / r.nb_train_prevu) * 100);
  });
  const { yMax, stepSize } = calculerEchelleY(maxBrut);

  const datasets = [ datasetPrincipal("% trains en retard < 15 min", valeurs) ];
  ajouterRegression(datasets, valeurs);

  if (graphiques[3]) graphiques[3].destroy();
  graphiques[3] = new Chart(
    document.getElementById("monGraphique3").getContext("2d"), {
      type: "line",
      data: { labels: genererLabelsX(moisAffiches), datasets },
      options: optionsCommunes(moisAffiches, 0, yMax, stepSize, "% de trains prévus", (item) => {
        if (item.parsed.y === null) return null;
        if (item.datasetIndex === 0) return `Retard < 15 min : ${item.parsed.y} %`;
        return `Tendance : ${item.parsed.y} %`;
      })
    }
  );
}


// ============================================
// GRAPHIQUE 4 : % RETARDS GRAVES (> 60  min)
// ============================================

function afficherG4() {
  const jeuxDeDonnees  = obtenirJeuxDeDonnees(4);
  const { debut, fin } = calculerPlageCommune(...jeuxDeDonnees);
  const tousLesMois    = genererTousMois(debut, fin);
  const moisAffiches = filtrerMoisParAnnee(tousLesMois);

  let valeurs60;

  if (etatGraphiques[4].liaison === "toutes") {
    valeurs60 = moisAffiches.map(mois => {
      let total60 = 0, totalPrevu = 0;
      jeuxDeDonnees.forEach(resultats => {
        const r = resultats.find(r => r.date.substring(0, 7) === mois);
        if (r && r.nb_train_prevu > 0) {
          total60    += r.nb_train_retard_sup_60;
          totalPrevu += r.nb_train_prevu;
        }
      });
      return totalPrevu > 0
        ? Math.max(0, parseFloat(((total60 / totalPrevu) * 100).toFixed(2)))
        : null;
    });
  } else {
    valeurs60 = moisAffiches.map(mois => {
      const r = jeuxDeDonnees[0].find(r => r.date.substring(0, 7) === mois);
      if (!r || r.nb_train_prevu === 0) return null;
      return Math.max(0, parseFloat(((r.nb_train_retard_sup_60 / r.nb_train_prevu) * 100).toFixed(2)));
    });
  }

  const maxBrut = yMaxGlobal(r => r.nb_train_prevu > 0
    ? Math.max(0, (r.nb_train_retard_sup_60 / r.nb_train_prevu) * 100)
    : null
  );
  const { yMax, stepSize } = calculerEchelleY(maxBrut);

  const datasets = [ datasetPrincipal("% trains en retard > 60 min", valeurs60) ];
  ajouterRegression(datasets, valeurs60);

  if (graphiques[4]) graphiques[4].destroy();
  graphiques[4] = new Chart(
    document.getElementById("monGraphique4").getContext("2d"), {
      type: "line",
      data: { labels: genererLabelsX(moisAffiches), datasets },
      options: optionsCommunes(moisAffiches, 0, yMax, stepSize, "% de trains prévus", (item) => {
        if (item.parsed.y === null) return null;
        if (item.datasetIndex === 0) return `Retard > 60 min : ${item.parsed.y} %`;
        return `Tendance : ${item.parsed.y} %`;
      })
    }
  );
}


// ============================================
// LANCEMENT
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  chargerTout();
});