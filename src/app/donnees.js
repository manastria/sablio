// Données : base SQLite (worker), chargement de l'emploi du temps et des
// devoirs, démonstration, sauvegardes datées, verrou de fenêtre unique.

import * as edt from '../emploi-du-temps.js';
import * as sauvegarde from '../sauvegarde.js';
import { texteBrut } from '../contenu.js';
import { VACANCES } from '../vacances.js';
import { ouvrirStockage } from '../stockage.js';
import { $, GRIS, dateMoyenne, echapper, ecrirePreference, etat, journaliser, lirePreference, maintenant, pluriel, remplirListe } from './commun.js';
import { rendre } from './rendu.js';

// --- Données : base SQLite et sauvegarde dans un fichier ---

export let stockage = null;
export const sauvegardeEtat = { dossier: null, autorisation: '', derniere: null, minuterie: null, suspendue: false, liste: [] };

// Le bouton du menu : choisir un dossier (aucun n'est choisi) ou reprendre
// la sauvegarde (le navigateur redemande l'autorisation). Signalé par le
// point rouge : c'est la seule vraie protection des données.
export function majBoutonSauvegarde() {
  const bouton = $('[data-action="reprendre-sauvegarde"]');
  if (!sauvegarde.disponible) {
    bouton.hidden = true;
    return;
  }
  bouton.textContent = sauvegardeEtat.dossier ? 'Reprendre la sauvegarde' : 'Choisir un dossier de sauvegarde';
  bouton.hidden = Boolean(sauvegardeEtat.dossier) && sauvegardeEtat.autorisation === 'granted';
}

export async function majListeSauvegardes() {
  if (!sauvegardeEtat.dossier || sauvegardeEtat.autorisation !== 'granted') return;
  try {
    sauvegardeEtat.liste = await sauvegarde.lister(sauvegardeEtat.dossier);
  } catch (e) {
    journaliser(`Liste des sauvegardes : échec (${e.message})`);
  }
}

// Démonstration : exceptions (un cours annulé, un cours déplacé) et devoirs
// rattachés aux prochains cours, calculés à partir d'un jour de référence
// retenu pour que les deux restent cohérents d'une ouverture à l'autre.
export const CLE_REFERENCE = 'sablio-demo-reference';

// Démonstration complète : emploi du temps, exceptions et devoirs.
export function preparerDemo(reference) {
  // Devoirs et exceptions sont calculés sur l'emploi du temps sans exception :
  // un devoir de démonstration peut ainsi tomber sur le cours qui sera annulé.
  const series = [...edt.DEMO_SERIES, ...edt.evenementsDemo(reference)];
  edt.definirEmploiDuTemps({ categories: edt.DEMO_CATEGORIES, series });
  edt.definirExceptions([]);
  const exceptions = edt.exceptionsDemo(reference);
  const devoirs = edt.devoirsDemo(reference).map((d) => ({
    id: crypto.randomUUID(), ...d, texte: d.contenu ? texteBrut(d.contenu) : d.texte,
  }));
  edt.definirExceptions(exceptions);
  return { devoirs, categories: edt.DEMO_CATEGORIES, series, exceptions };
}

// L'emploi du temps enregistré (matières, activités, séries, exceptions).
export async function chargerEmploiDuTemps() {
  const donnees = await stockage.emploiDuTemps();
  edt.definirEmploiDuTemps(donnees);
  edt.definirExceptions(donnees.exceptions);
  etat.verrou = donnees.reglages?.verrou ?? null;
  // Prénom de l'élève : utile au professionnel qui prépare plusieurs élèves.
  etat.eleve = donnees.reglages?.eleve?.nom ?? '';
  // Jours sans cours : vacances de la zone choisie, jours fériés, périodes ajoutées.
  etat.vacances = { zone: '', feries: true, ...donnees.reglages?.vacances };
  etat.periodesSaisies = donnees.periodes ?? [];
  const annee = maintenant().getFullYear();
  edt.definirPeriodes([
    ...VACANCES.filter(([, zone]) => zone === etat.vacances.zone).map(([, , nom, du, au]) => ({ nom, du, au, nature: 'vacances' })),
    ...(etat.vacances.feries ? [annee - 1, annee, annee + 1, annee + 2].flatMap(edt.joursFeries) : []),
    ...etat.periodesSaisies.map((p) => ({ ...p, nature: 'autre' })),
  ]);
  const cycle = donnees.reglages?.cycle;
  edt.definirCycle(cycle ? { ...cycle, reference: edt.dateDepuisIso(cycle.reference) } : undefined);
}

export async function rechargerTout() {
  await chargerEmploiDuTemps();
  await chargerDevoirs();
}

export async function chargerDevoirs() {
  const lignes = await stockage.devoirs();
  etat.devoirs = lignes.map((l) => {
    const d = {
      id: l.id,
      texte: l.texte,
      fait: Boolean(l.fait),
      pour: edt.dateDepuisIso(l.pour),
      serie: l.serie ?? null,
      dateOrigine: l.dateOrigine ?? null,
      aFaireLe: l.aFaireLe ? edt.dateDepuisIso(l.aFaireLe) : null,
      contenu: l.contenu ?? null,
      matiere: edt.categorie(l.matiere) ?? { cle: l.matiere, nom: l.matiere, court: '?', picto: '❔', couleur: GRIS },
    };
    // Le devoir suit son cours ; sans cours retrouvé, il garde sa date.
    d.seance = d.serie ? edt.trouverOccurrence(d.serie, d.dateOrigine) : null;
    d.rendu = d.seance ? edt.debutJour(d.seance.debut) : d.pour;
    return d;
  });
  etat.versionDevoirs += 1;
  rendre(true);
}

// Sauvegarde automatique 2 s après la dernière modification.
export function planifierSauvegarde() {
  if (sauvegardeEtat.suspendue) return;
  clearTimeout(sauvegardeEtat.minuterie);
  sauvegardeEtat.minuterie = setTimeout(() => sauvegarder(false), 2000);
}

// `interactif` : appelé depuis un clic, le navigateur peut donc demander l'autorisation.
export async function sauvegarder(interactif) {
  const dossier = sauvegardeEtat.dossier;
  if (!dossier) {
    if (interactif) journaliser('Sauvegarde : choisissez d’abord un dossier');
    majBoutonSauvegarde();
    return;
  }
  try {
    sauvegardeEtat.autorisation = await sauvegarde.autorisation(dossier, interactif);
    majBoutonSauvegarde();
    if (sauvegardeEtat.autorisation !== 'granted') {
      journaliser(`Sauvegarde en attente : autorisation « ${sauvegardeEtat.autorisation} »`);
      return;
    }
    // Une base vide ne remplace pas une sauvegarde : c'est sans doute une perte.
    if (!etat.devoirs?.length && !edt.matieres().length) {
      journaliser('Sauvegarde ignorée : la base est vide');
      return;
    }
    const octets = await stockage.exporter();
    // Le nom suit la vraie date (pas l'heure simulée du prototype).
    const { nom, supprimees } = await sauvegarde.ecrireDuJour(dossier, octets, edt.isoLocal(new Date()));
    sauvegardeEtat.derniere = new Date();
    sauvegardeEtat.suspendue = false;
    await majListeSauvegardes();
    journaliser(`Sauvegarde : ${Math.ceil(octets.length / 1024)} Ko dans ${dossier.name}/${nom}${supprimees ? ` (${pluriel(supprimees, 'ancienne')} supprimée${supprimees > 1 ? 's' : ''})` : ''}`);
  } catch (e) {
    journaliser(`Sauvegarde : échec (${e.message})`);
  } finally {
    afficherDonnees();
  }
}

export function afficherDonnees() {
  const info = stockage?.info;
  const f = sauvegardeEtat;
  remplirListe($('#donnees'), [
    ['Base', info?.mode ?? 'ouverture…'],
    ['SQLite', info?.sqlite ?? '–'],
    ['Devoirs', etat.devoirs ? String(etat.devoirs.length) : '–'],
    ['Dossier de sauvegarde', !sauvegarde.disponible ? 'impossible dans ce navigateur' : f.dossier?.name ?? 'aucun'],
    ['Autorisation d’écrire', f.dossier ? f.autorisation || '?' : '–'],
    ['Dernière sauvegarde', f.derniere ? f.derniere.toLocaleTimeString('fr-FR') : 'aucune pendant cette session'],
    ['Sauvegardes gardées', f.dossier ? `${f.liste.length} (une par jour, ${sauvegarde.GARDER} au plus)` : '–'],
    ['Sauvegarde automatique', f.suspendue ? 'suspendue (après la perte simulée)' : 'après chaque modification'],
  ]);
  $('#sauvegardes-liste').innerHTML = f.liste.length
    ? f.liste.map((x) => `<option value="${echapper(x.nom)}">${echapper(dateMoyenne(edt.dateDepuisIso(x.date)))} · ${x.modifie.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${Math.ceil(x.taille / 1024)} Ko</option>`).join('')
    : '<option value="">aucune</option>';
}

export const actionsDonnees = {
  'choisir-sauvegarde': async () => {
    try {
      sauvegardeEtat.dossier = await sauvegarde.choisirDossier();
      journaliser(`Dossier de sauvegarde choisi : ${sauvegardeEtat.dossier.name}`);
      await sauvegarder(true);
    } catch (e) {
      if (e.name !== 'AbortError') journaliser(`Choix du dossier : échec (${e.message})`);
    }
  },
  sauvegarder: () => sauvegarder(true),
  'reprendre-sauvegarde': () => (sauvegardeEtat.dossier ? sauvegarder(true) : actionsDonnees['choisir-sauvegarde']()),
  'restaurer-datee': async () => {
    const nom = $('#sauvegardes-liste').value;
    if (!nom || !sauvegardeEtat.dossier) return;
    if (!confirm(`Remplacer les données actuelles par la sauvegarde « ${nom} » ?`)) return;
    try {
      const { nombre } = await stockage.importer(await sauvegarde.lire(sauvegardeEtat.dossier, nom));
      await rechargerTout();
      sauvegardeEtat.suspendue = false;
      journaliser(`Restauration : ${nombre} devoirs repris de ${nom}`);
    } catch (e) {
      journaliser(`Restauration : échec (${e.message})`);
    }
    afficherDonnees();
  },
  restaurer: async () => {
    try {
      const { nom, octets } = await sauvegarde.lireFichierChoisi();
      if (!confirm(`Remplacer les données actuelles par celles de « ${nom} » ?`)) return;
      const { nombre } = await stockage.importer(octets);
      await rechargerTout();
      sauvegardeEtat.suspendue = false;
      journaliser(`Restauration : ${nombre} devoirs repris de ${nom}`);
    } catch (e) {
      if (e.name !== 'AbortError') journaliser(`Restauration : échec (${e.message})`);
    }
    afficherDonnees();
  },
  perte: async () => {
    if (!confirm('Essai : effacer toutes les données enregistrées dans le navigateur ?\nLe fichier de sauvegarde n’est pas touché.')) return;
    // Sinon, la prochaine sauvegarde automatique écraserait le fichier avec une base vide.
    clearTimeout(sauvegardeEtat.minuterie);
    sauvegardeEtat.suspendue = true;
    await stockage.effacer();
    await rechargerTout();
    journaliser('Perte simulée : la base est vide, la sauvegarde automatique est suspendue');
    afficherDonnees();
  },
  // Passer de la démonstration à un usage réel : base vidée, matières de base
  // gardées (à modifier), et plus jamais de démonstration.
  'repartir-zero': async () => {
    if (!confirm('Repartir de zéro ?\n\nTout est effacé : devoirs, cours, activités, événements, vacances, réglages et code du verrou. Seule la liste des matières est gardée, à modifier ensuite.\n\nLes sauvegardes des jours précédents restent dans le dossier de sauvegarde.')) return;
    try {
      await stockage.repartirDeZero(edt.DEMO_CATEGORIES.filter((c) => c.nature === 'ecole'));
      try {
        for (const cle of Object.keys(localStorage)) {
          if (cle === CLE_REFERENCE || cle.startsWith('sablio-sac-')) localStorage.removeItem(cle);
        }
      } catch { /* préférences non effacées */ }
      etat.adulteJusqua = 0;
      await rechargerTout();
      sauvegardeEtat.suspendue = false;
      planifierSauvegarde();
      journaliser('Base remise à zéro pour un usage réel (matières gardées)');
    } catch (e) {
      journaliser(`Remise à zéro : échec (${e.message})`);
    }
    afficherDonnees();
  },
  reinitialiser: async () => {
    if (!confirm('Remplacer tous les devoirs et l’emploi du temps par ceux de la démonstration, recalculés à partir d’aujourd’hui ?')) return;
    try {
      const reference = edt.debutJour(maintenant());
      const graine = preparerDemo(reference);
      await stockage.reinitialiser(graine);
      ecrirePreference(CLE_REFERENCE, edt.isoLocal(reference));
      await rechargerTout();
      planifierSauvegarde();
      journaliser(`Démonstration réinitialisée : ${graine.devoirs.length} devoirs, ${graine.series.length} séances par semaine`);
    } catch (e) {
      journaliser(`Réinitialisation : échec (${e.message})`);
    }
    afficherDonnees();
  },
};

// Une seule fenêtre peut ouvrir la base. Le verrou (Web Locks) est gardé tant
// que la page est ouverte et libéré automatiquement à sa fermeture.
export function prendreVerrou() {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request('mydevoirs-base', { ifAvailable: true }, (verrou) => {
      resolve(Boolean(verrou));
      return verrou ? new Promise(() => {}) : undefined;
    });
  });
}

export function alerter(texte, avecBouton = false) {
  const zone = $('#alerte');
  zone.replaceChildren(texte);
  if (avecBouton) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.dataset.action = 'recharger';
    bouton.textContent = 'Réessayer';
    zone.append(' ', bouton);
  }
  zone.hidden = false;
}

export async function demarrerStockage() {
  const enregistree = lirePreference(CLE_REFERENCE, '');
  const reference = enregistree ? edt.dateDepuisIso(enregistree) : edt.debutJour(maintenant());
  const graine = preparerDemo(reference);
  if (!(await prendreVerrou())) {
    etat.messageDevoirs = 'Les devoirs sont ouverts dans une autre fenêtre.';
    rendre(true);
    alerter('Sablio est déjà ouvert dans une autre fenêtre. Fermez-la, puis cliquez sur « Réessayer ».', true);
    journaliser('Base : déjà ouverte dans une autre fenêtre');
    return;
  }
  stockage = await ouvrirStockage(graine);
  const { info } = stockage;
  if (info.creee && info.persistant) ecrirePreference(CLE_REFERENCE, edt.isoLocal(reference));
  journaliser(`Base : ${info.mode}${info.creee && info.persistant ? ', créée avec les devoirs de démonstration' : `, ${info.nombre} devoirs`}`);
  if (!info.persistant) alerter(`Attention : rien de ce que vous saisissez ne sera enregistré (${info.mode}).`);
  await rechargerTout();
  if (sauvegarde.disponible) {
    sauvegardeEtat.dossier = (await sauvegarde.dossierEnregistre()) ?? null;
    if (sauvegardeEtat.dossier) {
      // La question clé : le navigateur se souvient-il de l'autorisation ?
      sauvegardeEtat.autorisation = await sauvegarde.autorisation(sauvegardeEtat.dossier);
      journaliser(`Au démarrage : dossier ${sauvegardeEtat.dossier.name}, autorisation « ${sauvegardeEtat.autorisation} »`);
      await majListeSauvegardes();
    }
  }
  majBoutonSauvegarde();
  afficherDonnees();
}
