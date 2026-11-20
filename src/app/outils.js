// Panneaux Réglages, À propos (version, environnement, rapport) et Mise au
// point (heure simulée, essais techniques : stockage, notification, son, fluidité).

import { DATE_VERSION, VERSION } from '../version.js';
import { $, PROFILS, ecrirePreference, etat, journaliser, maintenant, remplirListe } from './commun.js';
import { affichage, discret } from './discret.js';
import { afficherDonnees, majListeSauvegardes, rechargerTout, stockage } from './donnees.js';
import { api, dansElectron, jouerCarillon } from './plateforme.js';
import { rendre } from './rendu.js';
import { bloque } from './verrou.js';

// --- Outils ---

export function resumeSqlite(r) {
  if (!r) return 'annulé';
  return r.ok
    ? `OK, ${r.lignes} lignes, journal ${r.journal}, ${r.ms} ms (${r.dossier})`
    : `ÉCHEC : ${r.erreur} (${r.dossier ?? ''})`;
}

export function mesurerFluidite(dureeMs = 1000) {
  return new Promise((resolve) => {
    const temps = [];
    const debut = performance.now();
    const image = (t) => {
      temps.push(t);
      if (t - debut < dureeMs) requestAnimationFrame(image);
      else {
        const ecarts = temps.slice(1).map((x, i) => x - temps[i]);
        const ips = Math.round((ecarts.length * 1000) / (temps.at(-1) - temps[0]));
        resolve(`${ips} images/s, pire image ${Math.max(...ecarts).toFixed(1)} ms`);
      }
    };
    requestAnimationFrame(image);
  });
}

export function statistiquesRendu() {
  if (!etat.durees.length) return 'pas encore mesuré';
  const moyenne = etat.durees.reduce((a, b) => a + b, 0) / etat.durees.length;
  return `moyenne ${moyenne.toFixed(2)} ms, max ${Math.max(...etat.durees).toFixed(2)} ms (${etat.durees.length} rendus)`;
}

export async function lignesEnvironnement() {
  const e = await api.environnement();
  const taille = (t) => `${t.width} × ${t.height}`;
  const page = [
    ['Page', `${innerWidth} × ${innerHeight}, devicePixelRatio ${devicePixelRatio}`],
    ['Écran', `${screen.width} × ${screen.height}`],
    ['Temps de rendu', statistiquesRendu()],
  ];
  if (!dansElectron) {
    return [['Navigateur', e.systeme], ...Object.entries(e.navigateur), ...page];
  }
  const lignes = [
    ['Système', [e.systeme, e.nomSysteme].filter(Boolean).join(' – ')],
    ['WSL', e.wsl ? 'oui' : 'non'],
    ['Session graphique', e.sessionGraphique || '–'],
    ['Electron', e.versions.electron],
    ['Chromium', e.versions.chromium],
    ['Node', e.versions.node],
    ['SQLite', e.versions.sqlite],
    ['Écran (logique)', `${taille(e.ecran.taille)}, facteur ${e.ecran.facteur}, ${e.ecran.nombre} écran(s)`],
    ['Zone utile', taille(e.ecran.zoneUtile)],
    ['Fenêtre (contenu)', `${e.fenetre.contenu.join(' × ')}${e.fenetre.pleinEcran ? ', plein écran' : ''}`],
    ...page,
    ['Notifications', e.notifications ? 'prises en charge' : 'non prises en charge'],
    ['Fenêtre prête', e.mesures.fenetrePrete ? `${e.mesures.fenetrePrete} ms après le lancement` : '?'],
    ['Premier affichage', e.mesures.premierRendu ? `${e.mesures.premierRendu} ms après le lancement` : '?'],
    ['Dossier des données', e.dossierDonnees],
  ];
  if (e.mesures.compact) {
    const { demande, obtenu, premierPlan } = e.mesures.compact;
    const respecte = demande.x === obtenu.x && demande.y === obtenu.y
      && demande.width === obtenu.width && demande.height === obtenu.height;
    lignes.push(['Mode compact', `${respecte ? 'position et taille respectées' : `demandé ${JSON.stringify(demande)}, obtenu ${JSON.stringify(obtenu)}`}, premier plan : ${premierPlan ? 'oui' : 'non'}`]);
  }
  return lignes;
}

export async function afficherEnvironnement() {
  remplirListe($('#environnement'), await lignesEnvironnement());
}

export async function rapport() {
  const lignes = await lignesEnvironnement();
  return [
    `Sablio ${VERSION} – rapport`,
    `Date : ${new Date().toLocaleString('fr-FR')}`,
    '',
    ...lignes.map(([cle, valeur]) => `${cle} : ${valeur}`),
    '',
    'Essais :',
    ...(etat.journal.length ? etat.journal : ['(aucun)']),
  ].join('\n');
}

// Aller-retour sans boîte de dialogue : exporter, effacer, réimporter,
// et vérifier qu'un fichier qui n'est pas une base est refusé.
export async function verifierStockage() {
  try {
    const avant = etat.devoirs.length;
    const octets = await stockage.exporter();
    const taille = octets.length;
    await stockage.effacer();
    const apresPerte = (await stockage.devoirs()).length;
    const { nombre } = await stockage.importer(octets);
    let refus = 'accepté à tort';
    try {
      await stockage.importer(new TextEncoder().encode('pas une base de données'));
    } catch (e) {
      refus = `refusé (${e.message})`;
    }
    await rechargerTout();
    return `${avant} devoirs, export ${taille} octets, après perte ${apresPerte}, après import ${nombre} ; faux fichier ${refus}`;
  } catch (e) {
    return `échec : ${e.message}`;
  }
}

export async function lancerTests() {
  journaliser(`Stockage aller-retour : ${await verifierStockage()}`);
  if (dansElectron) journaliser(`SQLite (Node) : ${resumeSqlite(await api.testerSqlite())}`);
  journaliser(`Notification : ${await api.notifier('Essai de notification', 'Si ce message s’affiche, les rappels fonctionnent.')}`);
  journaliser(`Son : ${jouerCarillon()}`);
  journaliser(`Fluidité : ${await mesurerFluidite()}`);
  return etat.journal;
}

// Trois panneaux latéraux : Réglages (verrouillé), À propos (libre) et
// Mise au point (verrouillé, accessible depuis « À propos »). Un seul ouvert.
const PANNEAUX = {
  reglages: 'Ouvrir les réglages',
  apropos: null,
  debug: 'Ouvrir la mise au point',
};

export function basculerPanneau(nom) {
  const panneau = $(`#${nom}`);
  const ouvrir = panneau.hidden;
  if (ouvrir && PANNEAUX[nom] && bloque(PANNEAUX[nom], () => basculerPanneau(nom))) return;
  for (const autre of Object.keys(PANNEAUX)) $(`#${autre}`).hidden = autre === nom ? !ouvrir : true;
  for (const b of document.querySelectorAll('[data-action="panneau"][aria-expanded]')) {
    b.setAttribute('aria-expanded', String(b.dataset.panneau === nom && ouvrir));
  }
  if (!ouvrir) return;
  if (nom === 'reglages') {
    $('#discret-mode').value = etat.reglages.discret;
    $('#reglage-afaire').checked = etat.reglages.aFaireLe;
    $('#reglage-sac').value = etat.reglages.sac;
    majListeSauvegardes().then(afficherDonnees);
  } else if (nom === 'apropos') {
    $('#apropos-version').textContent = `version ${VERSION} (${new Date(DATE_VERSION).toLocaleDateString('fr-FR')})`;
    afficherEnvironnement();
  } else {
    const n = maintenant();
    const p = (x) => String(x).padStart(2, '0');
    $('#heure-simulee').value = `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`;
  }
}

// Ancien nom de l'action (« outils ») : ouvre les réglages.
export const basculerOutils = () => basculerPanneau('reglages');

export function changerProfil(profil) {
  if (!PROFILS[profil]) return;
  etat.profil = profil;
  document.documentElement.dataset.profil = profil;
  $('#profil').value = profil;
  ecrirePreference('sablio-profil', profil);
  rendre(true);
}
