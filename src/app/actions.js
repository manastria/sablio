// Actions : boutons [data-action], clics et changements délégués, clavier.

import * as edt from '../emploi-du-temps.js';
import { ouvrirEvenement, supprimerEvenementEdite } from './agenda.js';
import { $, MINUTE, ecrirePreference, etat, horloge, journaliser, maintenant } from './commun.js';
import { afficherDetail, choisirJourSaisie, majMatiere, ouvrirAjout, reporter, saisie, supprimerDevoir } from './devoirs.js';
import { basculerDiscret, changerModeDiscret, discret } from './discret.js';
import { planifierSauvegarde, stockage } from './donnees.js';
import { exporterEmploiDuTemps, importerEmploiDuTemps, nommerEleve, viderEmploiDuTemps } from './echange.js';
import { majChampsSerie, ouvrirCategorie, ouvrirCycle, ouvrirSerie, supprimerCategorieEditee, supprimerSerieEditee } from './emploi-du-temps.js';
import { allerAuJour, ligneSeance } from './jour.js';
import { ouvrirPeriode, ouvrirVacances, supprimerPeriodeEditee } from './jours-sans-cours.js';
import { basculerOutils, basculerPanneau, changerProfil, mesurerFluidite, rapport, resumeSqlite } from './outils.js';
import { activerRappels, api, dansElectron, installer, jouerCarillon } from './plateforme.js';
import { reglerHorloge, rendre } from './rendu.js';
import { cleSac, lireSac } from './sac.js';
import { majChampsSeance, ouvrirSeance, seanceOuverte } from './seance.js';
import { allerALaSemaine, semaineParDefaut } from './semaine.js';
import { adulte, afficherCodeOublie, bloque, ouvrirReglageVerrou, prolongerAdulte, retirerVerrou, verrouiller } from './verrou.js';

export const actions = {
  'plein-ecran': () => api.basculerPleinEcran(),
  compact: () => api.basculerCompact?.(),
  outils: basculerOutils,
  panneau: (bouton) => basculerPanneau(bouton.dataset.panneau),
  installer: installer,
  'activer-rappels': activerRappels,
  discret: basculerDiscret,
  vue: (bouton) => {
    etat.vue = bouton.dataset.vue;
    if (etat.vue === 'jour') etat.jour = edt.debutJour(maintenant());
    if (etat.vue === 'semaine') etat.semaine = semaineParDefaut(maintenant());
    rendre(true);
  },
  'voir-semaine': (bouton) => allerALaSemaine(edt.dateDepuisIso(bouton.dataset.date)),
  'semaine-decaler': (bouton) => allerALaSemaine(edt.ajouterJours(etat.semaine, 7 * Number(bouton.dataset.semaines))),
  'semaine-courante': () => allerALaSemaine(maintenant()),
  'voir-jour': (bouton) => allerAuJour(edt.dateDepuisIso(bouton.dataset.date)),
  'jour-decaler': (bouton) => allerAuJour(edt.ajouterJours(etat.jour, Number(bouton.dataset.jours))),
  'jour-aujourdhui': () => allerAuJour(maintenant()),
  ajouter: () => ouvrirAjout(),
  'fermer-detail': () => $('#detail').close(),
  'serie-nouvelle': (bouton) => ouvrirSerie(null, Number(bouton.dataset.jour)),
  'cycle-modifier': () => ouvrirCycle(),
  'edt-exporter': exporterEmploiDuTemps,
  'edt-importer': importerEmploiDuTemps,
  'edt-vider': () => viderEmploiDuTemps(),
  'eleve-nommer': nommerEleve,
  'vacances-modifier': () => ouvrirVacances(),
  'periode-nouvelle': () => ouvrirPeriode(),
  'periode-supprimer': supprimerPeriodeEditee,
  verrouiller,
  deverrouiller: () => bloque('Mode adulte', () => {}),
  'verrou-definir': ouvrirReglageVerrou,
  'code-oublie': afficherCodeOublie,
  'verrou-retirer': retirerVerrou,
  'serie-supprimer': () => supprimerSerieEditee(),
  'categorie-nouvelle': (bouton) => ouvrirCategorie(null, bouton.dataset.nature),
  'categorie-supprimer': supprimerCategorieEditee,
  'seance-serie': () => {
    $('#seance').close();
    const serie = edt.series().find((x) => x.id === seanceOuverte.serie);
    if (serie?.type === 'evenement') ouvrirEvenement(serie.id);
    else ouvrirSerie(serie.id);
  },
  'evenement-nouveau': (bouton) => ouvrirEvenement(null, bouton.dataset.date),
  'evenement-supprimer': () => supprimerEvenementEdite(),
  'seance-ajouter-devoir': () => {
    $('#seance').close();
    ouvrirAjout(null, seanceOuverte);
  },
  'modifier-devoir': () => {
    const d = etat.devoirs?.find((x) => x.id === etat.detail);
    if (!d) return;
    $('#detail').close();
    ouvrirAjout(d);
  },
  'supprimer-devoir': supprimerDevoir,
  'heure-appliquer': () => {
    const valeur = $('#heure-simulee').value;
    if (valeur) reglerHorloge({ date: new Date(valeur) });
  },
  avancer: (bouton) => reglerHorloge({ date: new Date(maintenant().getTime() + Number(bouton.dataset.minutes) * MINUTE) }),
  'heure-reelle': () => {
    $('#vitesse').value = '1';
    reglerHorloge({ date: new Date(), vitesse: 1, simulee: false });
  },
  'test-notification': async () => {
    // Le clic sur le bouton permet au navigateur de demander l'autorisation.
    if (!dansElectron && window.Notification?.permission === 'default') await activerRappels();
    journaliser(`Notification : ${await api.notifier('Essai de notification', 'Si ce message s’affiche, les rappels fonctionnent.')}`);
  },
  'test-son': () => journaliser(`Son : ${jouerCarillon()}`),
  'test-fluidite': async () => journaliser(`Fluidité : ${await mesurerFluidite()}`),
  'test-sqlite': async () => journaliser(`SQLite : ${resumeSqlite(await api.testerSqlite())}`),
  'test-sqlite-dossier': async () => journaliser(`SQLite : ${resumeSqlite(await api.testerSqliteDossier())}`),
  'copier-rapport': async () => {
    await api.copier(await rapport());
    journaliser('Rapport copié dans le presse-papiers');
  },
};

document.addEventListener('click', (e) => {
  prolongerAdulte();
  // Un choix dans le menu le referme (sauf la liste des profils).
  const menu = $('#menu');
  if (e.target.closest('#menu button') && menu.matches(':popover-open')) menu.hidePopover();
  const reporterBouton = e.target.closest('[data-reporter]');
  if (reporterBouton) {
    reporter(reporterBouton.dataset.reporter);
    return;
  }
  const plus = e.target.closest('[data-ajouter-seance]');
  if (plus) {
    const [, serie, dateOrigine] = plus.dataset.ajouterSeance.split('|');
    ouvrirAjout(null, edt.trouverOccurrence(serie, dateOrigine));
    return;
  }
  const ligneSeance = e.target.closest('#jour-edt [data-seance]');
  if (ligneSeance) {
    ouvrirSeance(ligneSeance.dataset.seance);
    return;
  }
  const serie = e.target.closest('[data-serie]');
  if (serie) {
    ouvrirSerie(serie.dataset.serie);
    return;
  }
  const periodeBouton = e.target.closest('[data-periode]');
  if (periodeBouton) {
    ouvrirPeriode(periodeBouton.dataset.periode);
    return;
  }
  const evenementBouton = e.target.closest('[data-evenement]');
  if (evenementBouton) {
    ouvrirEvenement(evenementBouton.dataset.evenement);
    return;
  }
  const categorieBouton = e.target.closest('[data-categorie]');
  if (categorieBouton) {
    ouvrirCategorie(categorieBouton.dataset.categorie);
    return;
  }
  const ouvrir = e.target.closest('[data-ouvrir]');
  if (ouvrir) {
    afficherDetail(ouvrir.dataset.ouvrir);
    return;
  }
  const format = e.target.closest('[data-format]');
  if (format) {
    $('#ajout-texte').focus();
    document.execCommand(format.dataset.format);
    return;
  }
  const bouton = e.target.closest('[data-action]');
  if (bouton) actions[bouton.dataset.action]?.(bouton);
});

document.addEventListener('change', (e) => {
  const cible = e.target;
  if (cible.matches('[data-devoir]')) {
    const id = cible.dataset.devoir;
    const devoir = etat.devoirs?.find((d) => d.id === id);
    if (!devoir) return;
    // L'écran change tout de suite ; l'enregistrement suit.
    devoir.fait = cible.checked;
    etat.versionDevoirs += 1;
    rendre();
    stockage.marquer(id, devoir.fait)
      .then(planifierSauvegarde)
      .catch((erreur) => journaliser(`Enregistrement : échec (${erreur.message})`));
  } else if (cible.matches('[data-sac]')) {
    const jour = edt.dateDepuisIso(cible.dataset.sac);
    const coches = lireSac(jour);
    if (cible.checked) coches.add(cible.value);
    else coches.delete(cible.value);
    ecrirePreference(cleSac(jour), JSON.stringify([...coches]));
  } else if (cible.id === 'profil') {
    changerProfil(cible.value);
  } else if (cible.id === 'vitesse') {
    reglerHorloge({ vitesse: Number(cible.value), simulee: horloge.simulee || cible.value !== '1' });
  } else if (cible.id === 'discret-mode') {
    changerModeDiscret(cible.value);
  } else if (cible.id === 'reglage-sac') {
    etat.reglages.sac = cible.value === 'matin' ? 'matin' : 'veille';
    ecrirePreference('sablio-sac-moment', etat.reglages.sac);
    rendre(true);
  } else if (cible.id === 'reglage-afaire') {
    etat.reglages.aFaireLe = cible.checked;
    ecrirePreference('sablio-a-faire-le', cible.checked ? '1' : '0');
  } else if (cible.name === 'rendu-jour') {
    choisirJourSaisie(edt.dateDepuisIso(cible.value));
  } else if (cible.id === 'ajout-date' && cible.value) {
    choisirJourSaisie(edt.dateDepuisIso(cible.value));
  } else if (cible.id === 'serie-categorie') {
    majChampsSerie();
  } else if (cible.name === 'seance-statut') {
    majChampsSeance();
  } else if (cible.name === 'rendu-seance') {
    saisie.seance = cible.value;
    $('#ajout-erreur-rendu').hidden = true;
    majMatiere();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    api.basculerPleinEcran();
    return;
  }
  // Flèches gauche et droite : jour (vue Jour) ou semaine (vue Semaine) précédent ou suivant.
  const champ = e.target.closest?.('input, select, textarea, dialog, [contenteditable]');
  if (champ || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const sens = e.key === 'ArrowLeft' ? -1 : 1;
  if (etat.vue === 'jour') {
    e.preventDefault();
    allerAuJour(edt.ajouterJours(etat.jour, sens));
  } else if (etat.vue === 'semaine') {
    e.preventDefault();
    allerALaSemaine(edt.ajouterJours(etat.semaine, 7 * sens));
  }
});

api.surFenetre(({ compact }) => {
  if (compact) document.documentElement.dataset.compact = '';
  else delete document.documentElement.dataset.compact;
});
