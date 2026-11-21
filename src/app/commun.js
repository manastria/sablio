// Socle partagé par tous les modules : constantes, état de l'interface,
// horloge (réelle ou simulée), préférences, petits utilitaires d'affichage.
// Ne dépend d'aucun autre module de l'interface : il est évalué en premier.

import * as edt from '../emploi-du-temps.js';

export const MINUTE = 60_000;
export const RAPPEL_AVANT = 5 * MINUTE;
export const DISCRET_PAUSE = 30 * MINUTE; // mode « toujours » : durée d'une désactivation manuelle
export const LIBELLE_NEUTRE = 'Rendez-vous';
export const PICTO_NEUTRE = '📍';
export const GRIS = '#8a8a8a';
export const PROFILS = {
  primaire: { devoirs: 2, motsLongs: true, nuits: true },
  college: { devoirs: 4, motsLongs: false, nuits: false },
  superieur: { devoirs: 8, motsLongs: false, nuits: false },
};

export const $ = (selecteur) => document.querySelector(selecteur);
export const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function lirePreference(cle, defaut) {
  try { return localStorage.getItem(cle) ?? defaut; } catch { return defaut; }
}
export function ecrirePreference(cle, valeur) {
  try { localStorage.setItem(cle, valeur); } catch { /* préférence non retenue */ }
}
// --- Horloge réelle ou simulée ---

export const horloge = { reelBase: Date.now(), simBase: Date.now(), vitesse: 1, simulee: false };
export const maintenant = () => new Date(horloge.simBase + (Date.now() - horloge.reelBase) * horloge.vitesse);
// --- État de l'interface ---

export const MODES_DISCRET = ['manuel', 'automatique', 'toujours'];

export const etat = {
  profil: PROFILS[lirePreference('sablio-profil', '')] ? lirePreference('sablio-profil', '') : 'college',
  vue: 'maintenant', // l'accueil est toujours « Maintenant / Ensuite »
  jour: null, // jour affiché par la vue Jour
  devoirs: null, // chargés depuis la base (null tant qu'elle n'est pas ouverte)
  versionDevoirs: 0,
  discret: false, // mode discret actif à cet instant (recalculé à chaque rendu)
  reglages: {
    discret: MODES_DISCRET.includes(lirePreference('sablio-discret', '')) ? lirePreference('sablio-discret', '') : 'automatique',
    aFaireLe: lirePreference('sablio-a-faire-le', '1') === '1',
    // Le sac se prépare la veille au soir, ou le matin même.
    sac: lirePreference('sablio-sac-moment', 'veille') === 'matin' ? 'matin' : 'veille',
  },
  rappels: new Set(),
  journal: [],
  durees: [],
};
// Applique les attributs data-css="--a:1;--b:#fff" via le CSSOM
// (la politique de sécurité interdit les attributs style dans le HTML).
export function appliquerStyles(racine) {
  for (const el of racine.querySelectorAll('[data-css]')) {
    for (const regle of el.dataset.css.split(';')) {
      const i = regle.indexOf(':');
      if (i > 0) el.style.setProperty(regle.slice(0, i).trim(), regle.slice(i + 1).trim());
    }
  }
}

export const couleurs = (a) => `--couleur:${a.couleur};--sur-couleur:${edt.texteSur(a.couleur)}`;
export const pastille = (a) => `<span class="pastille" data-css="${couleurs(a)}" title="${echapper(a.nom)}" aria-hidden="true">${a.picto}</span>`;
export const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];
// Couleurs nettement distinctes ; le texte posé dessus est choisi par texteSur().
export const PALETTE = [
  '#c8553d', '#2f6fbf', '#8a6d3b', '#7b4fa0', '#3c8d40', '#0f7f81', '#e0a100', '#c2457a', '#6d6aa8',
  '#5f7380', '#2e7d32', '#c62828', '#d9822b', '#3949ab', '#00838f', '#6d4c41', '#ad1457', '#558b2f',
];
export const PICTOS = [
  '📖', '📐', '➗', '🌍', '🗺️', '📜', '💬', '🇬🇧', '🇪🇸', '🇩🇪', '🇮🇹', '🏛️', '🌱', '🧪', '🔬', '🏃', '⚽', '🎨', '🎵', '🎹', '🎸',
  '⚙️', '💻', '✏️', '📚', '🎭', '🧠', '💭', '🗣️', '🩺', '🏊', '🏀', '🥋', '🐴', '📝', '⭐', '🏫',
];
export const heureCourte = (hm) => `${Number(hm.slice(0, 2))} h ${hm.slice(3, 5)}`;
export const dateCourte = (iso) => edt.dateDepuisIso(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateMoyenne = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
// « demain », « aujourd’hui », sinon « vendredi 27 ».
export function jourCourt(d, n) {
  const ecart = edt.ecartJours(n, d);
  if (ecart === 0) return 'aujourd’hui';
  if (ecart === 1) return 'demain';
  // Au-delà d'une semaine, le mois lève l'ambiguïté (« lundi 4 janvier »).
  return d.toLocaleDateString('fr-FR', ecart > 6 || ecart < 0
    ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric' });
}
export function journaliser(texte) {
  const heure = new Date().toLocaleTimeString('fr-FR');
  etat.journal.push(`${heure} ${texte}`);
  const li = document.createElement('li');
  li.textContent = `${heure} ${texte}`;
  $('#journal').append(li);
}
export function remplirListe(dl, lignes) {
  dl.replaceChildren();
  for (const [cle, valeur] of lignes) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = cle;
    dd.textContent = valeur;
    dl.append(dt, dd);
  }
}
