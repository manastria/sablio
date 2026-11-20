// Interface : vue « Maintenant / Ensuite » (accueil), vue Jour, mode discret,
// saisie des devoirs, panneau d'outils.

import * as edt from './emploi-du-temps.js';
import { htmlDepuisTexte, nettoyerHtml, texteBrut } from './contenu.js';
import * as sauvegarde from './sauvegarde.js';
import { ouvrirStockage } from './stockage.js';

const MINUTE = 60_000;
const RAPPEL_AVANT = 5 * MINUTE;
const DISCRET_PAUSE = 30 * MINUTE; // mode « toujours » : durée d'une désactivation manuelle
const LIBELLE_NEUTRE = 'Rendez-vous';
const PICTO_NEUTRE = '📍';
const GRIS = '#8a8a8a';

// Couche « plateforme » : Electron fournit window.mydevoirs (voir preload.js) ;
// dans un navigateur ou une fois installée en PWA, on utilise les API du web.
const dansElectron = Boolean(window.mydevoirs);
const enPWA = !dansElectron && 'serviceWorker' in navigator && location.protocol.startsWith('http');

async function notifierNavigateur(titre, texte) {
  if (!('Notification' in window)) return 'non prise en charge';
  if (Notification.permission !== 'granted') {
    return Notification.permission === 'denied' ? 'refusée par l’utilisateur' : 'pas encore autorisée';
  }
  const options = { body: texte, icon: 'icones/icone-192.png', tag: titre };
  // Passer par le service worker permet de revenir à l'application d'un clic.
  const enregistrement = enPWA ? await navigator.serviceWorker.getRegistration() : null;
  if (enregistrement) {
    await enregistrement.showNotification(titre, options);
    return 'affichée (service worker)';
  }
  new Notification(titre, options);
  return 'affichée (page)';
}

async function environnementNavigateur() {
  const stockage = navigator.storage;
  const estimation = await stockage?.estimate?.();
  const mo = (octets) => `${(octets / 1e6).toFixed(1)} Mo`;
  return {
    systeme: navigator.userAgent,
    versions: {},
    mesures: {},
    navigateur: {
      'Mode d’affichage': matchMedia('(display-mode: standalone)').matches
        ? 'application installée (fenêtre dédiée)' : 'onglet du navigateur',
      'Service worker': navigator.serviceWorker?.controller ? 'actif (hors ligne possible)' : 'inactif',
      'Réseau': navigator.onLine ? 'en ligne' : 'hors ligne',
      'Stockage persistant': (await stockage?.persisted?.()) ? 'oui' : 'non (le navigateur peut effacer les données)',
      'Stockage utilisé': estimation ? `${mo(estimation.usage)} sur ${mo(estimation.quota)} autorisés` : '?',
      'Notifications': 'Notification' in window ? `autorisation : ${Notification.permission}` : 'non prises en charge',
      'Incrustation (compact)': 'documentPictureInPicture' in window ? 'disponible' : 'indisponible',
    },
  };
}

const api = window.mydevoirs ?? {
  environnement: environnementNavigateur,
  notifier: notifierNavigateur,
  testerSqlite: async () => ({ ok: false, erreur: 'pas encore dans la version navigateur' }),
  testerSqliteDossier: async () => ({ ok: false, erreur: 'pas encore dans la version navigateur' }),
  basculerPleinEcran: async () => (document.fullscreenElement
    ? document.exitFullscreen() : document.documentElement.requestFullscreen()),
  basculerCompact: null, // à faire : incrustation de document (Document Picture-in-Picture)
  copier: (texte) => navigator.clipboard.writeText(texte),
  premierRendu: () => {},
  surFenetre: () => {},
};

const PROFILS = {
  primaire: { devoirs: 2, motsLongs: true, nuits: true },
  college: { devoirs: 4, motsLongs: false, nuits: false },
  superieur: { devoirs: 8, motsLongs: false, nuits: false },
};

const $ = (selecteur) => document.querySelector(selecteur);
const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function lirePreference(cle, defaut) {
  try { return localStorage.getItem(cle) ?? defaut; } catch { return defaut; }
}
function ecrirePreference(cle, valeur) {
  try { localStorage.setItem(cle, valeur); } catch { /* préférence non retenue */ }
}

// --- Horloge réelle ou simulée ---

const horloge = { reelBase: Date.now(), simBase: Date.now(), vitesse: 1, simulee: false };
const maintenant = () => new Date(horloge.simBase + (Date.now() - horloge.reelBase) * horloge.vitesse);

function reglerHorloge({ date = maintenant(), vitesse = horloge.vitesse, simulee = true } = {}) {
  Object.assign(horloge, { reelBase: Date.now(), simBase: date.getTime(), vitesse, simulee });
  planifier();
  rendre(true);
}

// --- État de l'interface ---

const MODES_DISCRET = ['manuel', 'automatique', 'toujours'];

const etat = {
  profil: PROFILS[lirePreference('profil', '')] ? lirePreference('profil', '') : 'college',
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

let cleStructure = '';
let minuteur = null;

function planifier() {
  clearInterval(minuteur);
  const pas = horloge.vitesse > 1 ? 200 : 1000;
  document.documentElement.style.setProperty('--tick', `${horloge.vitesse === 0 ? 0 : pas}ms`);
  if (horloge.vitesse !== 0) minuteur = setInterval(() => rendre(), pas);
}

// --- Mode discret ---
// manuel : inactif sauf si on l'active ; automatique : actif pendant les heures
// de classe, le bouton force l'inverse jusqu'au prochain basculement ;
// toujours : actif, le bouton le suspend 30 minutes (ou jusqu'à la réouverture).

const discret = {
  // Le choix manuel est retenu : un élève qui l'a activé en classe ne doit
  // pas le voir disparaître parce que l'application a redémarré.
  manuel: lirePreference('sablio-discret-manuel', '0') === '1',
  forcage: null, // { valeur, base } (automatique) ou { jusqua } (toujours)
};

function discretDeBase(n) {
  if (etat.reglages.discret === 'toujours') return true;
  if (etat.reglages.discret === 'manuel') return discret.manuel;
  const classe = edt.heuresDeClasse(n);
  return Boolean(classe) && classe.debut <= n && n < classe.fin;
}

function discretActif(n) {
  const base = discretDeBase(n);
  const f = discret.forcage;
  if (f && etat.reglages.discret === 'automatique') {
    if (f.base === base) return f.valeur;
    discret.forcage = null; // basculement automatique : le forçage s'arrête
  }
  if (f && etat.reglages.discret === 'toujours') {
    if (n < f.jusqua) return false;
    discret.forcage = null;
  }
  return base;
}

function basculerDiscret() {
  const n = maintenant();
  const actif = discretActif(n);
  if (etat.reglages.discret === 'manuel') {
    discret.manuel = !actif;
    ecrirePreference('sablio-discret-manuel', discret.manuel ? '1' : '0');
  } else if (etat.reglages.discret === 'automatique') {
    discret.forcage = { valeur: !actif, base: discretDeBase(n) };
  } else {
    discret.forcage = actif ? { jusqua: new Date(n.getTime() + DISCRET_PAUSE) } : null;
  }
  rendre(true);
}

function changerModeDiscret(mode) {
  if (!MODES_DISCRET.includes(mode)) return;
  etat.reglages.discret = mode;
  discret.forcage = null;
  ecrirePreference('sablio-discret', mode);
  rendre(true);
}

// Une activité masquée n'apparaît pas du tout en mode discret.
const visible = (o) => !(etat.discret && o.nature === 'perso' && o.categorie.confidentialite === 'masque');

// --- Affichage d'une séance : nom, pictogramme, couleur ---

const devoirsDe = (o) => (etat.devoirs ?? []).filter((d) => d.serie === o.serie && d.dateOrigine === o.dateOrigine);

// `prudent` : pour les notifications, qui s'affichent par-dessus tout, même en
// classe : une activité non « visible » y est toujours neutre.
function affichage(o, { prudent = false } = {}) {
  const lieu = o.salle ? `Salle ${o.salle}` : '';
  if (o.nature === 'ecole') {
    const m = o.categorie;
    return { nom: m.nom, court: m.court, picto: m.picto, couleur: m.couleur, lieu };
  }
  if (o.nature === 'creneau') {
    // Un créneau à matière variable (DS) prend la matière du devoir qui lui est rattaché.
    const m = devoirsDe(o)[0]?.matiere;
    if (m) return { nom: `${o.titre} · ${m.nom}`, court: `${o.titre} ${m.court}`, picto: m.picto, couleur: m.couleur, lieu };
    return { nom: o.titre, court: o.titre, picto: o.picto, couleur: GRIS, lieu };
  }
  const a = o.categorie;
  const neutre = a.confidentialite !== 'visible' && (prudent || etat.discret);
  if (!neutre) return { nom: a.nom, court: a.court, picto: a.picto, couleur: a.couleur, lieu: o.salle ?? '', perso: true };
  return {
    nom: LIBELLE_NEUTRE, court: LIBELLE_NEUTRE, picto: PICTO_NEUTRE,
    couleur: a.garderCouleur ? a.couleur : GRIS, lieu: '', perso: true,
  };
}

// Applique les attributs data-css="--a:1;--b:#fff" via le CSSOM
// (la politique de sécurité interdit les attributs style dans le HTML).
function appliquerStyles(racine) {
  for (const el of racine.querySelectorAll('[data-css]')) {
    for (const regle of el.dataset.css.split(';')) {
      const i = regle.indexOf(':');
      if (i > 0) el.style.setProperty(regle.slice(0, i).trim(), regle.slice(i + 1).trim());
    }
  }
}

const couleurs = (a) => `--couleur:${a.couleur};--sur-couleur:${edt.texteSur(a.couleur)}`;
const pastille = (a) => `<span class="pastille" data-css="${couleurs(a)}" title="${echapper(a.nom)}" aria-hidden="true">${a.picto}</span>`;

// --- Rendu ---

// Reconstruit le HTML quand la situation change de nature ; sinon, ne met à
// jour que les textes et les barres (pour garder les transitions fluides).
function rendre(forcer = false) {
  const debut = performance.now();
  const n = maintenant();
  etat.discret = discretActif(n);
  const s = edt.situation(n, visible);
  const profil = PROFILS[etat.profil];
  const cle = [
    etat.vue, s.etat, s.actuel?.id, s.suivant?.id, s.demain?.jour?.getTime(),
    edt.debutJour(n).getTime(), etat.profil, etat.versionDevoirs, etat.discret,
    etat.vue === 'jour' ? cleJour(n) : '',
    // Vue Semaine : reconstruite toutes les 5 minutes (cours passés grisés).
    etat.vue === 'semaine' ? `${etat.semaine?.getTime()}:${Math.floor(n / (5 * MINUTE))}` : '',
  ].join('|');
  if (forcer || cle !== cleStructure) {
    cleStructure = cle;
    afficherVue();
    if (etat.vue === 'jour') construireJour(n, profil);
    else if (etat.vue === 'semaine') construireSemaine(n);
    else if (etat.vue === 'afaire') construireAFaire(n, profil);
    else if (etat.vue === 'edt') construireEdt(n);
    else construire(s, n, profil);
  }
  mettreAJour(s, n, profil);
  verifierRappels(edt.situation(n), n, profil);
  etat.durees.push(performance.now() - debut);
  if (etat.durees.length > 300) etat.durees.shift();
}

// Point rouge sur l'icône du menu : une action y attend (installer,
// activer les rappels, reprendre la sauvegarde).
function majPointMenu() {
  const attente = [...document.querySelectorAll('#menu .mise-en-avant')].some((b) => !b.hidden);
  $('[data-champ="point-menu"]').hidden = !attente;
  $('.bouton-menu').setAttribute('aria-label', attente ? 'Menu (une action vous attend)' : 'Menu');
}

function afficherVue() {
  majPointMenu();
  $('#vue-maintenant').hidden = etat.vue !== 'maintenant';
  $('#vue-jour').hidden = etat.vue !== 'jour';
  $('#vue-semaine').hidden = etat.vue !== 'semaine';
  $('#vue-afaire').hidden = etat.vue !== 'afaire';
  $('#vue-edt').hidden = etat.vue !== 'edt';
  for (const b of document.querySelectorAll('[data-action="vue"]')) {
    if (b.dataset.vue === etat.vue) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  const bouton = $('[data-action="discret"]');
  bouton.setAttribute('aria-pressed', String(etat.discret));
  bouton.title = {
    manuel: 'Masquer les activités personnelles',
    automatique: 'Automatique pendant les cours ; cliquer pour forcer',
    toujours: `Toujours actif ; cliquer pour le suspendre ${DISCRET_PAUSE / MINUTE} minutes`,
  }[etat.reglages.discret];
}

function construire(s, n, profil) {
  const carteMaintenant = $('#maintenant');
  const carteEnsuite = $('#ensuite');
  const enCours = s.actuel ?? s.suivant;
  carteMaintenant.style.setProperty('--couleur', enCours ? affichage(enCours).couleur : 'var(--accent)');
  carteMaintenant.innerHTML = htmlMaintenant(s, n, profil);
  carteEnsuite.innerHTML = htmlEnsuite(s, n);
  const prochain = prochainCours(s);
  carteEnsuite.style.setProperty('--couleur', prochain ? affichage(prochain).couleur : 'var(--accent)');
  // La frise laisse la place au sac quand c'est le moment de le préparer :
  // le soir, après les cours, pour le prochain jour de classe (réglage
  // « la veille ») ; le matin, avant les cours, pour la journée (« le matin »).
  const aujourdhui = edt.debutJour(n);
  const auMoment = etat.reglages.sac === 'matin'
    ? (s.etat === 'avant' && s.cours.some(edt.estEcole) ? aujourdhui : null)
    : (s.etat === 'fini' ? s.demain?.jour : null);
  $('#frise').innerHTML = auMoment ? htmlSac(auMoment, n, { lien: true }) : htmlFrise(s);
  $('#devoirs').innerHTML = htmlDevoirs(n, profil);
  appliquerStyles($('#vue-maintenant'));
}

const prochainCours = (s) => (s.etat === 'fini' ? s.demain?.cours[0] : s.suivant) ?? null;

function htmlMaintenant(s, n, profil) {
  const barre = '<div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="barre-reste"></div></div>';
  if (s.etat === 'cours') {
    const c = s.actuel;
    const a = affichage(c);
    return `
      <p class="etiquette">${profil.motsLongs ? 'En ce moment' : 'Maintenant'}</p>
      <div class="titre-cours">${pastille(a)}<h2>${echapper(a.nom)}</h2></div>
      <p class="lieu">${echapper(a.lieu)}</p>
      <p class="grand" data-champ="restant"></p>
      ${barre}
      <p class="bornes"><span>Début ${edt.heureTexte(c.debut)}</span><span>Fin ${edt.heureTexte(c.fin)}</span></p>`;
  }
  if (s.etat === 'pause' || s.etat === 'avant') {
    const perso = s.suivant.nature === 'perso';
    const etiquette = s.etat === 'avant' ? (perso ? 'Avant' : 'Avant les cours') : perso ? 'Temps libre' : 'Pause';
    const texte = perso
      ? `${affichage(s.suivant).nom} à ${edt.heureTexte(s.suivant.debut)}`
      : `${s.etat === 'avant' ? 'Premier cours' : 'Reprise'} à ${edt.heureTexte(s.suivant.debut)}`;
    return `
      <p class="etiquette">${etiquette}</p>
      <div class="titre-cours"><p>${echapper(texte)}</p></div>
      <p class="grand" data-champ="restant"></p>
      ${barre}
      <p class="bornes"><span>${s.precedent ? `Depuis ${edt.heureTexte(s.precedent.fin)}` : ''}</span><span>${edt.heureTexte(s.suivant.debut)}</span></p>`;
  }
  const lendemain = s.demain?.jour;
  const aRendre = lendemain
    ? (etat.devoirs ?? []).filter((d) => !d.fait && edt.memeJour(d.rendu, lendemain)).length : 0;
  const quand = lendemain ? edt.jourRelatif(lendemain, n) : 'demain';
  const texteDevoirs = aRendre === 0
    ? `Rien à rendre pour ${quand}.`
    : `${pluriel(aRendre, 'devoir')} à rendre pour ${quand}.`;
  return `
    <p class="etiquette">Journée terminée</p>
    <div class="titre-cours"><p>Plus de cours aujourd’hui</p></div>
    <p class="grand grand-texte">${echapper(texteDevoirs)}</p>
    ${lendemain ? `<button type="button" data-action="voir-jour" data-date="${edt.isoLocal(lendemain)}">Voir la journée de ${echapper(quand)}</button>` : ''}`;
}

function htmlEnsuite(s, n) {
  const prochain = prochainCours(s);
  if (s.etat === 'cours' && !prochain) {
    return `
      <p class="etiquette">Ensuite</p>
      <div class="titre-cours"><h2>Plus rien après</h2></div>
      <p class="detail">Fin à ${edt.heureTexte(s.actuel.fin)}.</p>`;
  }
  if (!prochain) {
    return '<p class="etiquette">Ensuite</p><p class="vide">Pas de cours dans les deux semaines.</p>';
  }
  const a = affichage(prochain);
  const etiquette = s.etat === 'fini'
    ? edt.majuscule(edt.jourRelatif(prochain.debut, n))
    : s.etat === 'cours' ? 'Ensuite' : 'Prochain';
  // Pendant un cours, on dit quand vient le suivant ; en pause, la carte
  // « Maintenant » montre déjà le temps d'attente, on donne donc l'heure.
  const enchaine = s.etat === 'cours' && prochain.debut.getTime() === s.actuel.fin.getTime();
  const quand = s.etat === 'cours'
    ? `<p class="moyen"${enchaine ? '>juste après' : ' data-champ="avant-suivant">'}</p>`
    : `<p class="moyen">${edt.heureTexte(prochain.debut)}</p>`;
  const detail = [
    s.etat === 'cours' ? `À ${edt.heureTexte(prochain.debut)}` : s.etat === 'fini' ? 'Premier cours' : '',
    a.lieu,
  ].filter(Boolean).join(' · ');
  return `
    <p class="etiquette">${etiquette}</p>
    <div class="titre-cours">${pastille(a)}<h2>${echapper(a.nom)}</h2></div>
    ${quand}
    <p class="detail">${echapper(detail)}</p>`;
}

function bornesFrise(cours) {
  const debut = cours[0].debut.getTime() - 15 * MINUTE;
  const fin = cours.at(-1).fin.getTime() + 15 * MINUTE;
  return { debut, fin, pct: (t) => ((t - debut) / (fin - debut)) * 100 };
}

function htmlFrise(s) {
  const entete = `<div class="entete-carte"><p class="etiquette">Aujourd’hui</p>
    <button type="button" class="lien" data-action="vue" data-vue="jour">Voir la journée</button></div>`;
  if (!s.cours.length) return `${entete}<p class="vide">Pas de cours aujourd’hui.</p>`;
  const { debut, fin, pct } = bornesFrise(s.cours);
  const blocs = s.cours.map((c) => {
    const a = affichage(c);
    const titre = [a.nom, `${edt.heureTexte(c.debut)} – ${edt.heureTexte(c.fin)}`, a.lieu].filter(Boolean).join(', ');
    return `<div class="bloc" data-id="${c.id}" title="${echapper(titre)}"
      data-css="${couleurs(a)};--debut:${pct(c.debut).toFixed(3)};--largeur:${(pct(c.fin) - pct(c.debut)).toFixed(3)}">${a.picto} ${echapper(a.court)}</div>`;
  }).join('');
  const heures = [];
  const h = new Date(debut);
  h.setMinutes(0, 0, 0);
  for (h.setHours(h.getHours() + 1); h.getTime() < fin; h.setHours(h.getHours() + 1)) {
    heures.push(`<span data-css="--position:${pct(h.getTime()).toFixed(3)}">${h.getHours()} h</span>`);
  }
  return `
    ${entete}
    <div class="frise-piste">${blocs}<div class="repere" data-champ="repere"></div></div>
    <div class="graduations">${heures.join('')}</div>`;
}

// --- Devoirs ---

// Une ligne de devoir. `precision` : sous le texte ; `droite` : l'échéance.
function ligneDevoir(d, { precision = '', droite = '', proche = false }) {
  const o = d.seance;
  let alerte = '';
  if (o?.statut === 'annule' && !d.fait) {
    const nom = o.nature === 'creneau' ? o.titre : o.categorie.nom;
    alerte = `<p class="avertissement">⚠ Le cours de ${echapper(nom)} du ${echapper(edt.dateLongue(o.debut))} est annulé${o.motif ? ` (${echapper(o.motif)})` : ''} : à rendre quand ?
      <button type="button" data-reporter="${d.id}">Reporter au prochain cours de ${echapper(nom)}</button></p>`;
  }
  // La case marque le devoir fait ; le reste de la ligne ouvre le devoir.
  return `<li class="devoir${d.fait ? ' fait' : ''}"><div class="devoir-ligne" data-css="${couleurs(d.matiere)}">
      <label class="case" title="Marquer comme fait">
        <input type="checkbox" data-devoir="${d.id}" ${d.fait ? 'checked' : ''} aria-label="Fait : ${echapper(d.texte.split('\n')[0])}">
      </label>
      <button type="button" class="devoir-ouvrir" data-ouvrir="${d.id}" title="Afficher le devoir">
        ${pastille(d.matiere)}
        <span class="texte"><span class="resume">${echapper(d.texte)}</span>${precision ? `<span class="precision">${echapper(precision)}</span>` : ''}</span>
        ${droite ? `<span class="echeance${proche && !d.fait ? ' proche' : ''}">${echapper(droite)}</span>` : ''}
      </button>
    </div>${alerte}</li>`;
}

// --- Détail d'un devoir ---

function afficherDetail(id) {
  const d = etat.devoirs?.find((x) => x.id === id);
  if (!d) return;
  etat.detail = id;
  const n = maintenant();
  const profil = PROFILS[etat.profil];
  $('#detail-pastille').innerHTML = pastille(d.matiere);
  appliquerStyles($('#detail-pastille'));
  $('#detail-titre').textContent = d.matiere.nom;
  const soirs = d.fait ? '' : edt.soirsTexte(d.rendu, n);
  $('#detail-echeance').textContent = [edt.majuscule(edt.echeanceTexte(d.rendu, n, profil)), soirs].filter(Boolean).join(' · ');
  $('#detail-contenu').innerHTML = nettoyerHtml(d.contenu ?? htmlDepuisTexte(d.texte));
  const o = d.seance;
  const infos = [['À rendre', [edt.majuscule(edt.dateLongue(d.rendu)), precisionRendu(d, n)].filter(Boolean).join(', ')]];
  if (o?.statut === 'annule') infos.push(['Attention', `cours annulé${o.motif ? ` (${o.motif})` : ''}`]);
  if (o?.statut === 'deplace') infos.push(['Cours déplacé', `prévu ${edt.dateLongue(o.origine.debut)} à ${edt.heureTexte(o.origine.debut)}`]);
  if (!o) infos.push(['Rattaché', 'à une date (pas à un cours)']);
  if (d.aFaireLe) infos.push(['À faire', edt.quandTexte(d.aFaireLe, n, profil)]);
  remplirListe($('#detail-infos'), infos);
  const fait = $('#detail-fait');
  fait.checked = d.fait;
  fait.dataset.devoir = d.id;
  if (!$('#detail').open) $('#detail').showModal();
}

async function supprimerDevoir() {
  const d = etat.devoirs?.find((x) => x.id === etat.detail);
  if (!d || !confirm(`Supprimer ce devoir ?\n\n${d.matiere.nom} : ${d.texte.split('\n')[0]}`)) return;
  $('#detail').close();
  try {
    await stockage.supprimer(d.id);
    await chargerDevoirs();
    planifierSauvegarde();
    journaliser(`Devoir supprimé : ${d.texte.split('\n')[0]}`);
  } catch (e) {
    journaliser(`Suppression : échec (${e.message})`);
  }
}

// Échéance relative et soirs restants, pour les listes de devoirs à faire.
function ligneAFaire(d, n, profil) {
  const ecart = edt.ecartJours(n, d.rendu);
  const precision = [
    d.aFaireLe && ecart > 0
      ? `${edt.ecartJours(n, d.aFaireLe) < 0 ? 'prévu' : 'à faire'} ${edt.quandTexte(d.aFaireLe, n, profil)}` : '',
    !d.fait && !d.aFaireLe ? edt.soirsTexte(d.rendu, n) : '',
  ].filter(Boolean).join(' · ');
  return ligneDevoir(d, { precision, droite: edt.echeanceTexte(d.rendu, n, profil), proche: ecart <= 1 });
}

function htmlDevoirs(n, profil) {
  if (!etat.devoirs) return `<p class="etiquette">Devoirs à faire</p><p class="vide">${echapper(etat.messageDevoirs ?? 'Chargement…')}</p>`;
  const tous = [...etat.devoirs].sort((a, b) => a.rendu - b.rendu);
  const aFaire = tous.filter((d) => !d.fait);
  const faits = tous.filter((d) => d.fait);
  const visibles = aFaire.slice(0, profil.devoirs);
  const caches = aFaire.length - visibles.length;
  return `
    <div class="entete-carte"><p class="etiquette">Devoirs à faire</p>
      <button type="button" class="lien" data-action="ajouter">+ Ajouter un devoir</button></div>
    ${visibles.length ? `<ul class="liste-devoirs">${visibles.map((d) => ligneAFaire(d, n, profil)).join('')}</ul>` : '<p class="vide">Tout est fait. Bravo !</p>'}
    ${caches > 0 ? `<p class="vide">Et ${caches} autre${caches > 1 ? 's' : ''} plus tard. <button type="button" class="lien" data-action="vue" data-vue="afaire">Tout voir</button></p>` : ''}
    ${faits.length ? `<details class="faits"><summary>${pluriel(faits.length, 'devoir')} fait${faits.length > 1 ? 's' : ''}</summary>
      <ul class="liste-devoirs">${faits.map((d) => ligneDevoir(d, { droite: edt.echeanceTexte(d.rendu, n, profil) })).join('')}</ul></details>` : ''}`;
}

// --- Écran « À faire » ---
// Tous les devoirs non faits, groupés par échéance (comme la liste « À faire »
// de MyDevoirs, mais en temps relatif) ; les devoirs faits sont repliés.

const GROUPES = [
  ['retard', 'En retard'],
  ['aujourdhui', 'Pour aujourd’hui'],
  ['demain', 'Pour demain'],
  ['semaine', 'Cette semaine'],
  ['prochaine', 'La semaine prochaine'],
  ['plus-tard', 'Plus tard'],
];

function groupeEcheance(rendu, n) {
  const ecart = edt.ecartJours(n, rendu);
  if (ecart < 0) return 'retard';
  if (ecart === 0) return 'aujourdhui';
  if (ecart === 1) return 'demain';
  const semaines = Math.round(edt.ecartJours(edt.lundi(n), edt.lundi(rendu)) / 7);
  return semaines === 0 ? 'semaine' : semaines === 1 ? 'prochaine' : 'plus-tard';
}

function construireAFaire(n, profil) {
  const zone = $('#vue-afaire');
  if (!etat.devoirs) {
    zone.innerHTML = `<p class="vide">${echapper(etat.messageDevoirs ?? 'Chargement…')}</p>`;
    return;
  }
  const tri = (a, b) => quandRendre(a) - quandRendre(b);
  const aFaire = etat.devoirs.filter((d) => !d.fait).sort(tri);
  const faits = etat.devoirs.filter((d) => d.fait).sort((a, b) => b.rendu - a.rendu);
  const parGroupe = new Map(GROUPES.map(([cle]) => [cle, []]));
  for (const d of aFaire) parGroupe.get(groupeEcheance(d.rendu, n)).push(d);
  const pourDemain = parGroupe.get('demain').length + parGroupe.get('aujourdhui').length;
  const resume = aFaire.length
    ? `${pluriel(aFaire.length, 'devoir')} à faire${pourDemain ? `, dont ${pourDemain} pour ${parGroupe.get('aujourdhui').length ? 'aujourd’hui ou demain' : 'demain'}` : ''}${parGroupe.get('retard').length ? `, ${parGroupe.get('retard').length} en retard` : ''}.`
    : 'Tout est fait. Bravo !';
  const groupes = GROUPES.filter(([cle]) => parGroupe.get(cle).length).map(([cle, titre]) => `
    <section class="carte groupe-afaire groupe-${cle}" aria-label="${echapper(titre)}">
      <div class="entete-carte"><p class="etiquette">${echapper(titre)}</p><span class="compte">${parGroupe.get(cle).length}</span></div>
      <ul class="liste-devoirs">${parGroupe.get(cle).map((d) => ligneAFaire(d, n, profil)).join('')}</ul>
    </section>`).join('');
  zone.innerHTML = `
    <div class="afaire-entete">
      <h2>À faire</h2>
      <p class="afaire-resume">${echapper(resume)}</p>
      <button type="button" class="mise-en-avant" data-action="ajouter">+ Devoir</button>
    </div>
    ${groupes}
    ${faits.length ? `<details class="carte faits"><summary>${pluriel(faits.length, 'devoir')} fait${faits.length > 1 ? 's' : ''}</summary>
      <ul class="liste-devoirs">${faits.map((d) => ligneDevoir(d, { droite: edt.echeanceTexte(d.rendu, n, profil) })).join('')}</ul></details>` : ''}`;
  appliquerStyles(zone);
}

// --- Écran « Emploi du temps » ---
// Saisie de la semaine type (séries), des matières et des activités. Surtout
// pour l'adulte : il est dans l'en-tête, pas dans les onglets de l'élève.

const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];
// Couleurs nettement distinctes ; le texte posé dessus est choisi par texteSur().
const PALETTE = [
  '#c8553d', '#2f6fbf', '#8a6d3b', '#7b4fa0', '#3c8d40', '#0f7f81', '#e0a100', '#c2457a', '#6d6aa8',
  '#5f7380', '#2e7d32', '#c62828', '#d9822b', '#3949ab', '#00838f', '#6d4c41', '#ad1457', '#558b2f',
];
const PICTOS = [
  '📖', '📐', '➗', '🌍', '🗺️', '📜', '💬', '🌱', '🧪', '🔬', '🏃', '⚽', '🎨', '🎵', '🎹', '🎸',
  '⚙️', '💻', '✏️', '📚', '🎭', '🧠', '💭', '🗣️', '🩺', '🏊', '🏀', '🥋', '🐴', '📝', '⭐', '🏫',
];
const heureCourte = (hm) => `${Number(hm.slice(0, 2))} h ${hm.slice(3, 5)}`;
const dateCourte = (iso) => edt.dateDepuisIso(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

// Une activité non « visible » reste neutre en mode discret, ici aussi.
function affichageCategorie(c, serie = null) {
  if (!c) return { nom: serie?.titre || 'Créneau', picto: serie?.picto || '📝', couleur: GRIS };
  if (c.nature === 'perso' && etat.discret && c.confidentialite !== 'visible') {
    return { nom: LIBELLE_NEUTRE, picto: PICTO_NEUTRE, couleur: c.garderCouleur ? c.couleur : GRIS, cache: true, masque: c.confidentialite === 'masque' };
  }
  return { nom: c.nom, picto: c.picto, couleur: c.couleur };
}

function construireEdt(n) {
  const zone = $('#vue-edt');
  const series = edt.semaineType();
  const verrou = 'disabled title="Désactivez le mode discret pour modifier"';
  const cartes = ORDRE_JOURS.map((j) => {
    const lignes = series.filter((x) => x.jour === j).sort((a, b) => a.debut.localeCompare(b.debut)).map((x) => {
      const a = affichageCategorie(edt.categorie(x.cle), x);
      if (a.masque) return '';
      const details = [
        a.cache ? '' : x.salle, x.semaine ? `semaine ${x.semaine}` : '',
        x.valideDu ? `dès le ${dateCourte(x.valideDu)}` : '', x.valideAu ? `jusqu’au ${dateCourte(x.valideAu)}` : '',
      ].filter(Boolean).join(' · ');
      return `<li><button type="button" class="ligne-edt" data-serie="${x.id}" data-css="${couleurs(a)}" ${a.cache ? verrou : ''}>
        <span class="horaire">${heureCourte(x.debut)}<br>${heureCourte(x.fin)}</span>${pastille(a)}
        <span><strong>${echapper(a.nom)}</strong>${details ? `<span class="precision">${echapper(details)}</span>` : ''}</span></button></li>`;
    }).join('');
    return `<section class="carte" aria-label="${NOMS_JOURS[j]}">
      <div class="entete-carte"><p class="etiquette">${edt.majuscule(NOMS_JOURS[j])}</p>
        <button type="button" class="lien" data-action="serie-nouvelle" data-jour="${j}">+ Ajouter</button></div>
      ${lignes ? `<ul class="liste-edt">${lignes}</ul>` : '<p class="vide">Rien.</p>'}</section>`;
  }).join('');
  const ligneCategorie = (c) => {
    const a = affichageCategorie(c);
    if (a.masque) return '';
    const nb = series.filter((x) => x.cle === c.cle).length;
    const conf = { visible: 'visible en mode discret', discret: `« ${LIBELLE_NEUTRE} » en mode discret`, masque: 'masqué en mode discret' };
    const details = [
      `${pluriel(nb, 'séance')} par semaine`,
      c.nature === 'ecole' && c.materiel ? `+ ${c.materiel}` : '',
      c.nature === 'perso' && !a.cache ? conf[c.confidentialite ?? 'discret'] : '',
    ].filter(Boolean).join(' · ');
    return `<li><button type="button" class="ligne-edt" data-categorie="${c.cle}" data-css="${couleurs(a)}" ${a.cache ? verrou : ''}>
      ${pastille(a)}<span><strong>${echapper(a.nom)}</strong><span class="precision">${echapper(details)}</span></span></button></li>`;
  };
  zone.innerHTML = `
    <div class="afaire-entete">
      <h2>Emploi du temps</h2>
      <p class="afaire-resume">Semaine type. Cette semaine est une semaine ${edt.lettreSemaine(n)}. Pour une seule séance (annulée, déplacée), passez par la vue Jour.</p>
    </div>
    ${etat.discret ? '<p class="avertissement">Mode discret actif : les activités personnelles ne sont pas modifiables.</p>' : ''}
    <div class="grille-edt">${cartes}</div>
    <div class="grille-edt">
      <section class="carte">
        <div class="entete-carte"><p class="etiquette">Matières</p>
          <button type="button" class="lien" data-action="categorie-nouvelle" data-nature="ecole">+ Matière</button></div>
        <ul class="liste-edt">${edt.matieres().map(ligneCategorie).join('')}</ul>
      </section>
      <section class="carte">
        <div class="entete-carte"><p class="etiquette">Agenda</p>
          <button type="button" class="lien" data-action="evenement-nouveau" data-date="${edt.isoLocal(n)}">+ Événement</button></div>
        ${htmlAgenda(n)}
      </section>
      <section class="carte">
        <div class="entete-carte"><p class="etiquette">Activités personnelles</p>
          <button type="button" class="lien" data-action="categorie-nouvelle" data-nature="perso">+ Activité</button></div>
        <ul class="liste-edt">${edt.activites().map(ligneCategorie).join('') || '<li class="vide">Aucune.</li>'}</ul>
      </section>
    </div>`;
  appliquerStyles(zone);
}

// Un cours de la semaine type.
let serieEditee = null;

function ouvrirSerie(id = null, jour = 1) {
  const x = id ? edt.series().find((s) => s.id === id) : null;
  serieEditee = x;
  const option = (c) => `<option value="${c.cle}">${c.picto} ${echapper(c.nom)}</option>`;
  const choix = $('#serie-categorie');
  choix.innerHTML = `<optgroup label="Matières">${edt.matieres().map(option).join('')}</optgroup>
    <optgroup label="Activités personnelles">${edt.activites().map(option).join('')}</optgroup>
    <option value="">📝 Créneau sans matière fixe (DS…)</option>`;
  choix.value = x ? x.cle : edt.matieres()[0]?.cle ?? '';
  $('#serie-titre').value = x?.titre ?? 'DS';
  $('#serie-jour').innerHTML = ORDRE_JOURS.map((j) => `<option value="${j}">${edt.majuscule(NOMS_JOURS[j])}</option>`).join('');
  $('#serie-jour').value = String(x?.jour ?? jour);
  // Nouveau cours : il commence à la fin du dernier cours de ce jour.
  const dernier = edt.semaineType().filter((s) => s.jour === Number(jour)).sort((a, b) => b.fin.localeCompare(a.fin))[0];
  const debut = x?.debut ?? dernier?.fin ?? '08:00';
  const [h, m] = debut.split(':').map(Number);
  const finDefaut = `${String(Math.min(23, h + Math.floor((m + 55) / 60))).padStart(2, '0')}:${String((m + 55) % 60).padStart(2, '0')}`;
  $('#serie-debut').value = debut;
  $('#serie-fin').value = x?.fin ?? finDefaut;
  $('#serie-salle').value = x?.salle ?? '';
  document.querySelector(`input[name="serie-semaine"][value="${x?.semaine ?? ''}"]`).checked = true;
  $('#serie-du').value = x?.valideDu ?? '';
  $('#serie-au').value = x?.valideAu ?? '';
  $('#serie-supprimer').hidden = !x;
  $('#serie-titre-dialogue').textContent = x ? 'Modifier le cours' : 'Nouveau cours';
  $('#serie-erreur').hidden = true;
  majChampsSerie();
  $('#edt-serie').showModal();
}

function majChampsSerie() {
  const creneau = $('#serie-categorie').value === '';
  $('#serie-champ-titre').hidden = !creneau;
  $('#serie-titre').required = creneau;
}

async function enregistrerSerieFormulaire() {
  const cle = $('#serie-categorie').value;
  const serie = {
    id: serieEditee?.id ?? crypto.randomUUID(),
    cle,
    titre: cle ? null : $('#serie-titre').value.trim(),
    picto: cle ? null : serieEditee?.picto ?? '📝',
    salle: $('#serie-salle').value.trim() || null,
    jour: Number($('#serie-jour').value),
    debut: $('#serie-debut').value,
    fin: $('#serie-fin').value,
    semaine: document.querySelector('input[name="serie-semaine"]:checked').value || null,
    valideDu: $('#serie-du').value || null,
    valideAu: $('#serie-au').value || null,
  };
  try {
    await stockage.enregistrerSerie(serie);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`Cours ${serieEditee ? 'modifié' : 'ajouté'} : ${edt.categorie(cle)?.nom ?? serie.titre}, ${NOMS_JOURS[serie.jour]} ${serie.debut}`);
  } catch (e) {
    journaliser(`Cours : échec (${e.message})`);
  }
}

let serieEnCours = Promise.resolve();
$('#edt-serie form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  const erreur = (texte) => {
    e.preventDefault();
    $('#serie-erreur').textContent = texte;
    $('#serie-erreur').hidden = false;
  };
  if ($('#serie-fin').value <= $('#serie-debut').value) return erreur('L’heure de fin doit être après l’heure de début.');
  if ($('#serie-du').value && $('#serie-au').value && $('#serie-au').value < $('#serie-du').value) {
    return erreur('La date de fin doit être après la date de début.');
  }
  serieEnCours = enregistrerSerieFormulaire();
});

async function supprimerSerieEditee() {
  const x = serieEditee;
  if (!x) return;
  const occurrences = (etat.devoirs ?? []).filter((d) => d.serie === x.id && !d.fait).length;
  const message = `Supprimer ce cours de la semaine type ?${occurrences ? `\n\n${pluriel(occurrences, 'devoir')} à lui rendre ${occurrences > 1 ? 'resteront rattachés' : 'restera rattaché'} à ${occurrences > 1 ? 'leur' : 'sa'} date.` : ''}`;
  if (!confirm(message)) return;
  $('#edt-serie').close();
  await stockage.supprimerSerie(x.id);
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Cours supprimé : ${edt.categorie(x.cle)?.nom ?? x.titre}, ${NOMS_JOURS[x.jour]} ${x.debut}`);
}

// --- Agenda : événements datés ---
// « RDV psy le mercredi 25/11 à 17 h 30, pendant 3 semaines » : une série
// de type « événement », de valideDu à valideAu, toutes les 1 ou 2 semaines.

const dateMoyenne = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

// « mer. 25 nov. », « mer. 25 nov., 2 déc. et 9 déc. », « chaque semaine du … au … ».
function resumeDates(dates) {
  if (!dates.length) return '';
  if (dates.length === 1) return dateMoyenne(dates[0]);
  if (dates.length <= 4) {
    const autres = dates.slice(1).map((d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
    return `${dateMoyenne(dates[0])}, ${autres.slice(0, -1).join(', ')}${autres.length > 1 ? ' et ' : ''}${autres.at(-1)}`;
  }
  return `du ${dateMoyenne(dates[0])} au ${dateMoyenne(dates.at(-1))}`;
}

function htmlAgenda(n) {
  const aujourdhui = edt.isoLocal(n);
  const liste = edt.evenements().slice().sort((a, b) => (a.valideDu ?? '').localeCompare(b.valideDu ?? ''));
  const aVenir = liste.filter((x) => (x.valideAu ?? x.valideDu ?? '') >= aujourdhui);
  const passes = liste.filter((x) => (x.valideAu ?? x.valideDu ?? '') < aujourdhui);
  const ligne = (x) => {
    const a = affichageCategorie(edt.categorie(x.cle) ?? { nature: 'perso', nom: x.titre, picto: x.picto, couleur: x.couleur, confidentialite: x.confidentialite, garderCouleur: true }, x);
    if (a.masque) return '';
    const dates = edt.datesEvenement(x);
    const rythme = dates.length > 1 ? `, ${x.intervalle === 2 ? 'une semaine sur deux' : 'chaque semaine'}` : '';
    const details = `${resumeDates(dates)}${rythme} · ${heureCourte(x.debut)} – ${heureCourte(x.fin)}`;
    return `<li><button type="button" class="ligne-edt" data-evenement="${x.id}" data-css="${couleurs(a)}" ${a.cache ? 'disabled title="Désactivez le mode discret pour modifier"' : ''}>
      ${pastille(a)}<span><strong>${echapper(a.nom)}</strong><span class="precision">${echapper(details)}</span></span></button></li>`;
  };
  return `${aVenir.length ? `<ul class="liste-edt">${aVenir.map(ligne).join('')}</ul>` : '<p class="vide">Aucun événement à venir.</p>'}
    ${passes.length ? `<details class="faits"><summary>${pluriel(passes.length, 'événement')} passé${passes.length > 1 ? 's' : ''}</summary>
      <ul class="liste-edt">${passes.map(ligne).join('')}</ul></details>` : ''}`;
}

let evenementEdite = null;

function htmlChoixPictos(nom, choisi) {
  const liste = choisi && !PICTOS.includes(choisi) ? [choisi, ...PICTOS] : PICTOS;
  return liste.map((p) => `<label class="puce-picto"><input type="radio" name="${nom}" value="${p}" ${p === choisi ? 'checked' : ''}><span>${p}</span></label>`).join('');
}

function htmlChoixCouleurs(nom, choisie) {
  const liste = PALETTE.includes(choisie) ? PALETTE : [choisie, ...PALETTE];
  return liste.map((x) => `<label class="puce-couleur" data-css="--couleur:${x}">
    <input type="radio" name="${nom}" value="${x}" ${x === choisie ? 'checked' : ''} aria-label="Couleur ${x}"><span></span></label>`).join('');
}

function ouvrirEvenement(id = null, date = null) {
  const x = id ? edt.evenements().find((e) => e.id === id) : null;
  evenementEdite = x;
  const n = maintenant();
  const option = (c) => `<option value="${c.cle}">${c.picto} ${echapper(c.nom)}</option>`;
  const choix = $('#evt-categorie');
  choix.innerHTML = `<optgroup label="Activités personnelles">${edt.activites().map(option).join('')}</optgroup>
    <option value="">📌 Autre (titre libre)</option>
    <optgroup label="École">${edt.matieres().map(option).join('')}</optgroup>`;
  choix.value = x ? x.cle : '';
  $('#evt-titre').value = x?.titre ?? '';
  $('#evt-pictos').innerHTML = htmlChoixPictos('evt-picto', x?.picto ?? '📌');
  $('#evt-couleurs').innerHTML = htmlChoixCouleurs('evt-couleur', x?.couleur ?? '#00838f');
  appliquerStyles($('#evt-couleurs'));
  document.querySelector(`input[name="evt-confidentialite"][value="${x?.confidentialite ?? 'visible'}"]`).checked = true;
  $('#evt-date').value = x?.valideDu ?? date ?? edt.isoLocal(n);
  $('#evt-debut').value = x?.debut ?? '17:00';
  $('#evt-fin').value = x?.fin ?? '18:00';
  $('#evt-lieu').value = x?.salle ?? '';
  const nombre = x ? edt.datesEvenement(x).length : 1;
  const rythme = nombre > 1 ? String(x.intervalle || 1) : '0';
  document.querySelector(`input[name="evt-repetition"][value="${rythme}"]`).checked = true;
  $('#evt-fois').value = nombre > 1 ? nombre : 3;
  $('#evt-supprimer').hidden = !x;
  $('#evenement-titre-dialogue').textContent = x ? 'Modifier l’événement' : 'Nouvel événement';
  $('#evt-erreur').hidden = true;
  majChampsEvenement();
  $('#evenement').showModal();
}

// Le formulaire décrit l'événement ; on en déduit la série.
function serieDuFormulaire() {
  const cle = $('#evt-categorie').value;
  const date = $('#evt-date').value;
  const rythme = Number(document.querySelector('input[name="evt-repetition"]:checked').value);
  const fois = rythme ? Math.max(2, Math.min(52, Number($('#evt-fois').value) || 2)) : 1;
  const debut = date ? edt.dateDepuisIso(date) : null;
  return {
    id: evenementEdite?.id ?? crypto.randomUUID(),
    type: 'evenement',
    cle,
    titre: cle ? null : $('#evt-titre').value.trim(),
    picto: cle ? null : document.querySelector('input[name="evt-picto"]:checked')?.value ?? '📌',
    couleur: cle ? null : document.querySelector('input[name="evt-couleur"]:checked')?.value ?? '#00838f',
    confidentialite: cle ? null : document.querySelector('input[name="evt-confidentialite"]:checked').value,
    salle: $('#evt-lieu').value.trim() || null,
    jour: debut ? debut.getDay() : 0,
    debut: $('#evt-debut').value,
    fin: $('#evt-fin').value,
    semaine: null,
    valideDu: date || null,
    valideAu: debut ? edt.isoLocal(edt.ajouterJours(debut, 7 * (rythme || 1) * (fois - 1))) : null,
    intervalle: rythme > 1 ? rythme : null,
  };
}

function majChampsEvenement() {
  const libre = $('#evt-categorie').value === '';
  $('#evt-libre').hidden = !libre;
  $('#evt-titre').required = libre;
  const repete = document.querySelector('input[name="evt-repetition"]:checked').value !== '0';
  $('#evt-champ-fois').hidden = !repete;
  const serie = serieDuFormulaire();
  const dates = edt.datesEvenement(serie);
  $('#evt-resume').textContent = dates.length
    ? `${dates.length === 1 ? 'Une fois' : `${dates.length} fois`} : ${resumeDates(dates)}, de ${heureCourte(serie.debut || '00:00')} à ${heureCourte(serie.fin || '00:00')}.`
    : '';
}

async function enregistrerEvenementFormulaire() {
  const serie = serieDuFormulaire();
  try {
    await stockage.enregistrerSerie(serie);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`Événement ${evenementEdite ? 'modifié' : 'ajouté'} : ${edt.categorie(serie.cle)?.nom ?? serie.titre}, ${resumeDates(edt.datesEvenement(serie))} à ${serie.debut}`);
  } catch (e) {
    journaliser(`Événement : échec (${e.message})`);
  }
}

let evenementEnCours = Promise.resolve();
$('#evenement form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  if ($('#evt-fin').value <= $('#evt-debut').value) {
    e.preventDefault();
    $('#evt-erreur').textContent = 'L’heure de fin doit être après l’heure de début.';
    $('#evt-erreur').hidden = false;
    return;
  }
  evenementEnCours = enregistrerEvenementFormulaire();
});
for (const evenement of ['input', 'change']) {
  $('#evenement').addEventListener(evenement, (e) => {
    if (!e.target.matches('#evt-titre')) majChampsEvenement();
  });
}

async function supprimerEvenementEdite() {
  const x = evenementEdite;
  if (!x || !confirm(`Supprimer cet événement${edt.datesEvenement(x).length > 1 ? ' et toutes ses dates' : ''} ?`)) return;
  $('#evenement').close();
  await stockage.supprimerSerie(x.id);
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Événement supprimé : ${edt.categorie(x.cle)?.nom ?? x.titre}`);
}

// Une matière ou une activité.
let categorieEditee = null;
let natureEditee = 'ecole';

function ouvrirCategorie(cle = null, nature = 'ecole') {
  const c = cle ? edt.categorie(cle) : null;
  categorieEditee = c;
  natureEditee = c?.nature ?? nature;
  const perso = natureEditee === 'perso';
  $('#categorie-titre-dialogue').textContent = c
    ? (perso ? 'Modifier l’activité' : 'Modifier la matière') : (perso ? 'Nouvelle activité' : 'Nouvelle matière');
  $('#cat-nom').value = c?.nom ?? '';
  $('#cat-court').value = c?.court ?? '';
  const pictos = c?.picto && !PICTOS.includes(c.picto) ? [c.picto, ...PICTOS] : PICTOS;
  const picto = c?.picto ?? pictos[0];
  $('#cat-pictos').innerHTML = pictos.map((p) => `<label class="puce-picto"><input type="radio" name="cat-picto" value="${p}" ${p === picto ? 'checked' : ''}><span>${p}</span></label>`).join('');
  // Nouvelle catégorie : la première couleur encore libre.
  const prises = new Set([...edt.matieres(), ...edt.activites()].map((x) => x.couleur));
  const couleur = c?.couleur ?? PALETTE.find((x) => !prises.has(x)) ?? PALETTE[0];
  const palette = PALETTE.includes(couleur) ? PALETTE : [couleur, ...PALETTE];
  $('#cat-couleurs').innerHTML = palette.map((x) => `<label class="puce-couleur" title="${prises.has(x) && x !== c?.couleur ? 'Déjà utilisée' : 'Libre'}" data-css="--couleur:${x}">
    <input type="radio" name="cat-couleur" value="${x}" ${x === couleur ? 'checked' : ''} aria-label="Couleur ${x}${prises.has(x) && x !== c?.couleur ? ', déjà utilisée' : ''}">
    <span>${prises.has(x) && x !== c?.couleur ? '•' : ''}</span></label>`).join('');
  appliquerStyles($('#cat-couleurs'));
  $('#cat-champ-materiel').hidden = perso;
  $('#cat-materiel').value = c?.materiel ?? '';
  $('#cat-champ-confidentialite').hidden = !perso;
  document.querySelector(`input[name="cat-confidentialite"][value="${c?.confidentialite ?? 'discret'}"]`).checked = true;
  $('#cat-garder').checked = c?.garderCouleur ?? true;
  $('#cat-supprimer').hidden = !c;
  $('#cat-erreur').hidden = true;
  $('#edt-categorie').showModal();
}

async function enregistrerCategorieFormulaire() {
  const perso = natureEditee === 'perso';
  const nom = $('#cat-nom').value.trim();
  const toutes = [...edt.matieres(), ...edt.activites()];
  const categorie = {
    cle: categorieEditee?.cle ?? crypto.randomUUID(),
    nature: natureEditee,
    nom,
    court: $('#cat-court').value.trim() || nom.slice(0, 4),
    picto: document.querySelector('input[name="cat-picto"]:checked').value,
    couleur: document.querySelector('input[name="cat-couleur"]:checked').value,
    materiel: perso ? null : $('#cat-materiel').value.trim() || null,
    confidentialite: perso ? document.querySelector('input[name="cat-confidentialite"]:checked').value : null,
    garderCouleur: perso && $('#cat-garder').checked,
    ordre: categorieEditee?.ordre ?? Math.max(-1, ...toutes.map((x) => x.ordre ?? 0)) + 1,
  };
  try {
    await stockage.enregistrerCategorie(categorie);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`${perso ? 'Activité' : 'Matière'} ${categorieEditee ? 'modifiée' : 'ajoutée'} : ${nom}`);
  } catch (e) {
    journaliser(`${perso ? 'Activité' : 'Matière'} : échec (${e.message})`);
  }
}

let categorieEnCours = Promise.resolve();
$('#edt-categorie form').addEventListener('submit', (e) => {
  if (e.submitter?.value === 'ok') categorieEnCours = enregistrerCategorieFormulaire();
});

// On ne supprime pas une matière encore utilisée : ses cours et ses devoirs
// n'auraient plus ni nom ni couleur.
async function supprimerCategorieEditee() {
  const c = categorieEditee;
  if (!c) return;
  const cours = edt.series().filter((x) => x.cle === c.cle).length; // cours et événements
  const devoirs = (etat.devoirs ?? []).filter((d) => d.matiere.cle === c.cle).length;
  if (cours || devoirs) {
    $('#cat-erreur').textContent = `Impossible : ${[cours ? pluriel(cours, 'cours') : '', devoirs ? pluriel(devoirs, 'devoir') : ''].filter(Boolean).join(' et ')} ${cours + devoirs > 1 ? 'l’utilisent' : 'l’utilise'}. Supprimez-les ou changez-les d’abord.`;
    $('#cat-erreur').hidden = false;
    return;
  }
  if (!confirm(`Supprimer « ${c.nom} » ?`)) return;
  $('#edt-categorie').close();
  await stockage.supprimerCategorie(c.cle);
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Supprimé : ${c.nom}`);
}

// --- Préparer le sac ---
// Matières du jour (déduites de l'emploi du temps) et matériel habituel.
// Les cases cochées ne valent que pour ce jour.

const cleSac = (jour) => `sablio-sac-${edt.isoLocal(jour)}`;

function lireSac(jour) {
  try { return new Set(JSON.parse(lirePreference(cleSac(jour), '[]'))); } catch { return new Set(); }
}

// Le jour pour lequel on prépare le sac, vu depuis la journée `jour` :
// le prochain jour de classe (la veille au soir) ou ce jour même (le matin).
function jourDuSac(jour) {
  if (etat.reglages.sac === 'matin') return edt.debutJour(jour);
  return edt.prochainJourDeCours(jour, edt.estEcole)?.jour ?? null;
}

// « demain », « aujourd’hui », sinon « vendredi 27 ».
function jourCourt(d, n) {
  const ecart = edt.ecartJours(n, d);
  if (ecart === 0) return 'aujourd’hui';
  if (ecart === 1) return 'demain';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
}

function htmlSac(jour, n, { lien: avecLien = false, depuis = null } = {}) {
  // Quand le préparer : « ce soir », « jeudi soir », « le matin même ».
  let quand = 'le matin même';
  if (etat.reglages.sac === 'veille') {
    const veille = depuis ?? edt.debutJour(n);
    const ecart = edt.ecartJours(n, veille);
    quand = ecart === 0 ? 'ce soir' : ecart === 1 ? 'demain soir'
      : `${veille.toLocaleDateString('fr-FR', { weekday: 'long' })} soir`;
  }
  const titre = `Préparer le sac pour ${jourCourt(jour, n)}`;
  const coches = lireSac(jour);
  const matieres = new Map();
  for (const o of edt.coursDuJour(jour, edt.estEcole)) {
    const m = o.nature === 'ecole' ? o.categorie : devoirsDe(o)[0]?.matiere;
    if (m && !matieres.has(m.cle)) matieres.set(m.cle, m);
  }
  const lien = avecLien ? `<button type="button" class="lien" data-action="voir-jour" data-date="${edt.isoLocal(jour)}">Voir la journée</button>` : '';
  const entete = `<div class="entete-carte"><p class="etiquette">${echapper(titre)}</p>${lien}</div>
    <p class="vide quand-sac">À faire ${echapper(quand)}.</p>`;
  if (!matieres.size) return `${entete}<p class="vide">Pas de cours : rien à préparer.</p>`;
  const lignes = [...matieres.values()].map((m) => `<li><label data-css="${couleurs(m)}">
      <input type="checkbox" data-sac="${edt.isoLocal(jour)}" value="${m.cle}" ${coches.has(m.cle) ? 'checked' : ''}>
      ${pastille(m)} <span>${echapper(m.nom)}${m.materiel ? `<span class="precision">+ ${echapper(m.materiel)}</span>` : ''}</span>
    </label></li>`).join('');
  return `${entete}<ul class="sac">${lignes}</ul>`;
}

// --- Vue Jour ---

// Change quand la vue Jour doit être reconstruite : jour affiché, et position
// du repère « vous êtes ici » parmi les séances (pas à chaque seconde).
function cleJour(n) {
  if (!etat.jour) return '';
  const passees = edt.memeJour(etat.jour, n)
    ? edt.occurrencesDuJour(etat.jour).map((o) => (o.fin <= n ? 2 : o.debut <= n ? 1 : 0)).join('') : '';
  return `${edt.isoLocal(etat.jour)}:${passees}`;
}

function construireJour(n, profil) {
  etat.jour ??= edt.debutJour(n);
  const jour = etat.jour;
  const aujourdhui = edt.memeJour(jour, n);
  // Les boutons de navigation ne bougent pas, quelle que soit la longueur
  // du titre ; la bande des jours permet d'aller plus loin en un clic.
  $('#jour-entete').innerHTML = `
    <div class="jour-nav">
      <button type="button" data-action="jour-decaler" data-jours="-1" aria-label="Jour précédent" title="Jour précédent (flèche gauche)">←</button>
      <button type="button" data-action="jour-aujourdhui" ${aujourdhui ? 'disabled' : ''}>Aujourd’hui</button>
      <button type="button" data-action="jour-decaler" data-jours="1" aria-label="Jour suivant" title="Jour suivant (flèche droite)">→</button>
    </div>
    <h2>${echapper(edt.titreJour(jour, n))}</h2>
    <button type="button" data-action="evenement-nouveau" data-date="${edt.isoLocal(jour)}">+ Événement</button>
    <button type="button" class="mise-en-avant" data-action="ajouter">+ Devoir</button>
    ${htmlBandeJours(jour, n)}`;
  $('#jour-edt').innerHTML = htmlJourEdt(jour, n);
  $('#jour-devoirs').innerHTML = htmlJourDevoirs(jour, n, profil);
  const pourLe = jourDuSac(jour);
  $('#jour-sac').innerHTML = pourLe
    ? htmlSac(pourLe, n, { lien: !edt.memeJour(pourLe, jour), depuis: jour })
    : '<p class="etiquette">Préparer le sac</p><p class="vide">Pas de cours dans les deux semaines.</p>';
  appliquerStyles($('#vue-jour'));
}

// « Semaine 48 (B) · semaine prochaine », comme l'en-tête de MyDevoirs.
function texteSemaine(jour, n) {
  const { semaine, annee } = edt.numeroSemaine(jour);
  const autreAnnee = annee !== n.getFullYear() ? ` de ${annee}` : '';
  return `Semaine ${semaine}${autreAnnee} (${edt.lettreSemaine(jour)}) · ${edt.semaineRelative(jour, n)}`;
}

// Le numéro de semaine en élément graphique : « S48 » et la lettre du cycle.
// Le texte complet (« Semaine 48 (B) · semaine prochaine ») est dans l'infobulle.
function badgeSemaine(jour, n, variante = '') {
  const texte = texteSemaine(jour, n);
  const { semaine } = edt.numeroSemaine(jour);
  return `<span class="badge-semaine ${variante}" role="img" aria-label="${echapper(texte)}" title="${echapper(texte)}">
    <span class="bs-num"><small>S</small>${semaine}</span><span class="bs-lettre">${echapper(edt.lettreSemaine(jour))}</span></span>`;
}

// Champs « Aller à » (vues Jour et Semaine) : une semaine, une date ou un jour.
for (const formulaire of document.querySelectorAll('form.aller')) {
  const saisie = formulaire.querySelector('input');
  const erreur = formulaire.querySelector('.erreur');
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const jour = edt.interpreterSaisie(saisie.value, maintenant());
      erreur.hidden = true;
      saisie.removeAttribute('aria-invalid');
      saisie.value = '';
      if (formulaire.dataset.cible === 'semaine') allerALaSemaine(jour);
      else allerAuJour(jour);
    } catch (err) {
      erreur.textContent = err.message;
      erreur.hidden = false;
      saisie.setAttribute('aria-invalid', 'true');
    }
  });
  saisie.addEventListener('input', () => {
    erreur.hidden = true;
    saisie.removeAttribute('aria-invalid');
  });
}

// Les sept jours de la semaine affichée, avec le nombre de devoirs à rendre.
function htmlBandeJours(jour, n) {
  const debut = edt.lundi(jour);
  const puces = [];
  for (let i = 0; i < 7; i++) {
    const d = edt.ajouterJours(debut, i);
    const nb = (etat.devoirs ?? []).filter((x) => !x.fait && edt.memeJour(x.rendu, d)).length;
    const classes = ['puce-jour'];
    if (edt.memeJour(d, jour)) classes.push('choisi');
    if (edt.memeJour(d, n)) classes.push('aujourdhui');
    if (!edt.coursDuJour(d, edt.estEcole).length) classes.push('libre');
    const nom = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    const etiquette = `${edt.dateLongue(d)}${edt.memeJour(d, n) ? ', aujourd’hui' : ''}${nb ? `, ${pluriel(nb, 'devoir')} à rendre` : ''}`;
    puces.push(`<button type="button" class="${classes.join(' ')}" data-action="voir-jour" data-date="${edt.isoLocal(d)}"
      aria-label="${echapper(etiquette)}" ${edt.memeJour(d, jour) ? 'aria-current="date"' : ''}>
      <span class="jour-nom">${echapper(nom)}</span><span class="jour-num">${d.getDate()}</span>
      <span class="jour-nb">${nb || ''}</span></button>`);
  }
  const { semaine } = edt.numeroSemaine(jour);
  return `<nav class="bande-jours" aria-label="Jours de la semaine ${semaine}">
    <button type="button" class="puce-semaine" data-action="jour-decaler" data-jours="-7" aria-label="Semaine précédente" title="Semaine précédente">«</button>
    <button type="button" class="lien-semaine" data-action="voir-semaine" data-date="${edt.isoLocal(jour)}"
      title="Voir la semaine" aria-label="Voir la semaine ${edt.numeroSemaine(jour).semaine}">${badgeSemaine(jour, n, 'grand')}</button>
    ${puces.join('')}
    <button type="button" class="puce-semaine" data-action="jour-decaler" data-jours="7" aria-label="Semaine suivante" title="Semaine suivante">»</button>
  </nav>`;
}

function htmlJourEdt(jour, n) {
  const liste = edt.occurrencesDuJour(jour).filter(visible);
  const titre = '<p class="etiquette">Emploi du temps</p>';
  if (!liste.length) return `${titre}<p class="vide">Pas de cours ce jour.</p>`;
  const ecart = edt.ecartJours(n, jour);
  // Le repère « Vous êtes ici » n'existe qu'aujourd'hui : dans le cours en
  // cours s'il y en a un, sinon entre deux séances.
  const enCours = ecart === 0 && liste.some((o) => (o.statut === 'normal' || o.statut === 'deplace') && o.debut <= n && n < o.fin);
  let repere = ecart !== 0 || enCours;
  const lignes = [];
  const ici = '<li class="ici" aria-label="Vous êtes ici"><span>Vous êtes ici</span></li>';
  for (const o of liste) {
    if (!repere && o.debut > n) {
      lignes.push(ici);
      repere = true;
    }
    lignes.push(ligneSeance(o, n, ecart));
  }
  if (!repere) lignes.push(ici);
  return `${titre}<ol class="seances">${lignes.join('')}</ol>`;
}

function ligneSeance(o, n, ecart) {
  const a = affichage(o);
  const classes = ['seance'];
  if (ecart < 0 || (ecart === 0 && o.fin <= n)) classes.push('passe');
  const actuel = ecart === 0 && o.debut <= n && n < o.fin && (o.statut === 'normal' || o.statut === 'deplace');
  if (actuel) classes.push('actuel');
  let statut = '';
  if (o.statut === 'annule') {
    classes.push('annule');
    statut = `Annulé${o.motif ? ` · ${o.motif}` : ''}`;
  } else if (o.statut === 'parti') {
    classes.push('annule');
    statut = `Déplacé ${edt.quandTexte(o.versDebut, n)} à ${edt.heureTexte(o.versDebut)}`;
  } else if (o.statut === 'deplace') {
    classes.push('deplace');
    statut = `Déplacé${o.motif ? ` (${o.motif})` : ''} · prévu ${edt.jourRelatif(o.origine.debut, n)} à ${edt.heureTexte(o.origine.debut)}`;
  }
  const devoirs = o.nature === 'perso' ? [] : devoirsDe(o).filter((d) => !d.fait);
  const badge = devoirs.length && o.statut !== 'parti'
    ? `<span class="badge" title="${echapper(devoirs.map((d) => d.texte).join(' ; '))}">${pluriel(devoirs.length, 'devoir')}</span>` : '';
  // « + » : ajouter un devoir à rendre à ce cours (cours à venir seulement).
  const plus = o.nature !== 'perso' && o.debut > n && (o.statut === 'normal' || o.statut === 'deplace')
    ? `<button type="button" class="ajout-seance" data-ajouter-seance="${cleSeance(o)}"
        aria-label="Ajouter un devoir pour ${echapper(a.nom)}, ${echapper(edt.dateLongue(o.debut))} à ${edt.heureTexte(o.debut)}"
        title="Ajouter un devoir à rendre à ce cours">+</button>` : '';
  return `<li class="${classes.join(' ')}" data-css="${couleurs(a)}" data-debut="${o.debut.getTime()}" data-fin="${o.fin.getTime()}" data-seance="${cleSeance(o)}">
      <span class="horaire">${edt.heureTexte(o.debut)}<br>${edt.heureTexte(o.fin)}</span>
      ${pastille(a)}
      <button type="button" class="seance-texte" title="Annuler, déplacer, voir les devoirs"><strong>${echapper(a.nom)}</strong>
        ${a.lieu ? `<span class="precision">${echapper(a.lieu)}</span>` : ''}
        ${statut ? `<span class="statut">${echapper(statut)}</span>` : ''}
        ${actuel ? '<span class="statut en-cours" data-champ="encore"></span>' : ''}</button>
      <span class="seance-fin">${badge}${plus}</span>
      ${actuel ? '<span class="ici-dans" aria-hidden="true"><span>Vous êtes ici</span></span>' : ''}
    </li>`;
}

function htmlJourDevoirs(jour, n, profil) {
  if (!etat.devoirs) return `<p class="etiquette">Devoirs</p><p class="vide">${echapper(etat.messageDevoirs ?? 'Chargement…')}</p>`;
  const aRendre = etat.devoirs.filter((d) => edt.memeJour(d.rendu, jour)).sort((a, b) => quandRendre(a) - quandRendre(b));
  const faits = aRendre.filter((d) => d.fait).length;
  const progression = aRendre.length
    ? `<span class="progression"><span class="mini-barre" data-css="--fait:${faits / aRendre.length}"></span>${faits}/${aRendre.length}</span>` : '';
  const lignesRendre = aRendre.map((d) => ligneDevoir(d, { precision: precisionRendu(d, n) })).join('');

  // Travail du soir : les devoirs prévus ce jour (« à faire le »), et ceux
  // à rendre au prochain jour de classe qui n'ont pas de jour prévu.
  const suivant = edt.prochainJourDeCours(jour, visible)?.jour;
  const soir = etat.devoirs.filter((d) => !d.fait && edt.ecartJours(jour, d.rendu) > 0 && (d.aFaireLe
    ? edt.memeJour(d.aFaireLe, jour)
    : suivant && edt.memeJour(d.rendu, suivant))).sort((a, b) => a.rendu - b.rendu);
  const ecart = edt.ecartJours(n, jour);
  // Les échéances restent comptées depuis aujourd'hui, comme l'en-tête.
  const titreSoir = ecart === 0 ? 'Ce soir' : ecart === 1 ? 'Demain soir'
    : `${edt.majuscule(jour.toLocaleDateString('fr-FR', { weekday: 'long' }))} soir`;
  const lignesSoir = soir.map((d) => ligneDevoir(d, {
    precision: d.aFaireLe ? 'prévu ce soir-là' : '',
    droite: edt.echeanceTexte(d.rendu, n, profil),
    proche: true,
  })).join('');

  return `
    <div class="entete-carte"><p class="etiquette">À rendre ce jour</p>${progression}</div>
    ${aRendre.length ? `<ul class="liste-devoirs">${lignesRendre}</ul>` : '<p class="vide">Rien à rendre ce jour.</p>'}
    <p class="etiquette sous-titre">${echapper(titreSoir)}</p>
    ${soir.length ? `<ul class="liste-devoirs">${lignesSoir}</ul>` : '<p class="vide">Pas de travail prévu.</p>'}`;
}

const quandRendre = (d) => (d.seance ? d.seance.debut : d.rendu);

function precisionRendu(d, n) {
  const o = d.seance;
  if (!o) return '';
  if (o.statut === 'deplace') return `cours déplacé à ${edt.heureTexte(o.debut)}`;
  if (o.statut === 'annule') return '';
  return o.nature === 'creneau' ? `${o.titre} de ${edt.heureTexte(o.debut)}` : `cours de ${edt.heureTexte(o.debut)}`;
}

// --- Vue Semaine ---
// Une ligne par jour : les séances en bandes de couleur (pictogramme seul,
// le détail est dans l'infobulle et dans la vue Jour), puis les devoirs à
// rendre ce jour et leur progression. Un clic sur un jour ouvre la vue Jour.

// Le week-end, on montre directement la semaine suivante (comme MyDevoirs).
function semaineParDefaut(n) {
  const jour = n.getDay();
  return edt.ajouterJours(edt.lundi(n), jour === 0 || jour === 6 ? 7 : 0);
}

function allerALaSemaine(date) {
  etat.semaine = edt.lundi(date);
  etat.vue = 'semaine';
  rendre(true);
}

function construireSemaine(n) {
  etat.semaine ??= semaineParDefaut(n);
  const lundi = etat.semaine;
  const jours = Array.from({ length: 7 }, (_, i) => edt.ajouterJours(lundi, i));
  const seances = jours.map((j) => edt.occurrencesDuJour(j).filter(visible));
  const devoirs = jours.map((j) => (etat.devoirs ?? []).filter((d) => edt.memeJour(d.rendu, j)));

  // Échelle horaire commune à toute la semaine, en heures pleines.
  const toutes = seances.flat();
  const heure = (d) => d.getHours() + d.getMinutes() / 60;
  const hMin = toutes.length ? Math.floor(Math.min(...toutes.map((o) => heure(o.debut)))) : 8;
  const hMax = toutes.length ? Math.ceil(Math.max(...toutes.map((o) => heure(o.fin)))) : 17;
  const pct = (d) => ((heure(d) - hMin) / (hMax - hMin)) * 100;

  const courante = edt.memeJour(lundi, edt.lundi(n));
  const total = devoirs.flat();
  const faits = total.filter((d) => d.fait).length;
  $('#semaine-entete').innerHTML = `
    <div class="jour-nav">
      <button type="button" data-action="semaine-decaler" data-semaines="-1" aria-label="Semaine précédente" title="Semaine précédente (flèche gauche)">←</button>
      <button type="button" data-action="semaine-courante" ${courante ? 'disabled' : ''}>Cette semaine</button>
      <button type="button" data-action="semaine-decaler" data-semaines="1" aria-label="Semaine suivante" title="Semaine suivante (flèche droite)">→</button>
    </div>
    ${badgeSemaine(lundi, n)}
    <h2>${echapper(edt.majuscule(edt.semaineRelative(lundi, n)))} · ${echapper(edt.plageDates(lundi, jours[6]))}</h2>
    <button type="button" data-action="evenement-nouveau" data-date="${edt.isoLocal(edt.memeJour(lundi, edt.lundi(n)) ? n : lundi)}">+ Événement</button>
    <span class="semaine-total">${total.length ? `${pluriel(total.length, 'devoir')} à rendre · ${faits} fait${faits > 1 ? 's' : ''}` : 'Aucun devoir à rendre'}</span>`;

  const graduations = [];
  for (let h = hMin; h <= hMax; h++) {
    graduations.push(`<span data-css="--position:${(((h - hMin) / (hMax - hMin)) * 100).toFixed(3)}">${h} h</span>`);
  }
  const lignes = [`<div class="sg" aria-hidden="true"><span></span><span class="graduations-semaine">${graduations.join('')}</span><span></span></div>`];
  const replies = [];
  jours.forEach((j, i) => {
    const weekend = j.getDay() === 0 || j.getDay() === 6;
    // Un jour de week-end sans rien est replié en une seule ligne.
    if (weekend && !seances[i].length && !devoirs[i].length) {
      replies.push(j);
      return;
    }
    lignes.push(ligneJourSemaine(j, n, seances[i], devoirs[i], pct));
  });
  if (replies.length) {
    const noms = replies.map((j) => `${j.toLocaleDateString('fr-FR', { weekday: 'long' })} ${j.getDate()}`);
    lignes.push(`<p class="sj-repli">${echapper(edt.majuscule(noms.join(' et ')))} : rien de prévu</p>`);
  }
  const grille = $('#semaine-grille');
  grille.innerHTML = lignes.join('');
  grille.dataset.hmin = hMin;
  grille.dataset.hmax = hMax;
  appliquerStyles($('#vue-semaine'));
}

function ligneJourSemaine(j, n, seances, devoirs, pct) {
  const ecart = edt.ecartJours(n, j);
  const blocs = seances.map((o) => {
    const a = affichage(o);
    const classes = ['sb'];
    if (o.statut === 'annule') classes.push('annule');
    if (o.statut === 'parti') classes.push('parti');
    if (o.statut === 'deplace') classes.push('deplace');
    if (ecart < 0 || (ecart === 0 && o.fin <= n)) classes.push('passe');
    const statut = { annule: ', annulé', parti: ', déplacé ailleurs', deplace: ', déplacé ici' }[o.statut] ?? '';
    const aRendre = o.nature !== 'perso' && o.statut !== 'parti' && devoirsDe(o).some((d) => !d.fait);
    const titre = `${a.nom}, ${edt.heureTexte(o.debut)} – ${edt.heureTexte(o.fin)}${statut}${aRendre ? ', devoir à rendre' : ''}`;
    return `<span class="${classes.join(' ')}" title="${echapper(titre)}"
      data-css="${couleurs(a)};--debut:${pct(o.debut).toFixed(3)};--largeur:${(pct(o.fin) - pct(o.debut)).toFixed(3)}">${a.picto}${aRendre ? '<span class="point"></span>' : ''}</span>`;
  }).join('');
  const faits = devoirs.filter((d) => d.fait).length;
  const droite = devoirs.length
    ? `<span class="sj-pastilles">${devoirs.map((d) => `<span class="mini-pastille${d.fait ? ' fait' : ''}" data-css="${couleurs(d.matiere)}" title="${echapper(`${d.matiere.nom} : ${d.texte.split('\n')[0]}${d.fait ? ' (fait)' : ''}`)}">${d.matiere.picto}</span>`).join('')}</span>
       <span class="progression"><span class="mini-barre" data-css="--fait:${faits / devoirs.length}"></span>${faits}/${devoirs.length}</span>`
    : '<span class="vide">rien à rendre</span>';
  const relatif = ecart === 0 ? 'aujourd’hui' : ecart === 1 ? 'demain' : '';
  const classes = ['sj'];
  if (ecart === 0) classes.push('aujourdhui');
  if (ecart < 0) classes.push('passe');
  const etiquette = `${edt.dateLongue(j)}${relatif ? `, ${relatif}` : ''} : ${pluriel(seances.filter((o) => o.statut !== 'parti').length, 'séance')}, ${devoirs.length ? `${pluriel(devoirs.length, 'devoir')} à rendre dont ${faits} fait${faits > 1 ? 's' : ''}` : 'rien à rendre'}`;
  return `<button type="button" class="${classes.join(' ')}" data-action="voir-jour" data-date="${edt.isoLocal(j)}" aria-label="${echapper(etiquette)}">
      <span class="sj-date"><span class="sj-nom">${echapper(j.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''))}</span>
        <span class="sj-num">${j.getDate()}</span>${relatif ? `<span class="sj-rel">${relatif}</span>` : ''}</span>
      <span class="sj-frise">${seances.length ? blocs : '<span class="sj-vide">pas de cours</span>'}${ecart === 0 ? '<span class="sj-maintenant" data-champ="semaine-maintenant"></span>' : ''}</span>
      <span class="sj-devoirs">${droite}</span>
    </button>`;
}

function allerAuJour(jour) {
  etat.jour = edt.debutJour(jour);
  etat.vue = 'jour';
  rendre(true);
}

// --- Mise à jour fine (chaque seconde) ---

function mettreAJour(s, n, profil) {
  $('[data-champ="heure"]').textContent = edt.heureTexte(n);
  $('[data-champ="simulee"]').hidden = !horloge.simulee;
  const champDate = $('[data-champ="date"]');
  const date = `${echapper(edt.majuscule(edt.dateLongue(n)))} ${badgeSemaine(n, n)}`;
  if (champDate.dataset.valeur !== date) {
    champDate.dataset.valeur = date;
    champDate.innerHTML = date;
  }
  if (etat.vue === 'jour') {
    // Le repère « Vous êtes ici » avance dans le cours en cours.
    const actuel = $('#jour-edt .seance.actuel');
    if (actuel) {
      const [d, f] = [Number(actuel.dataset.debut), Number(actuel.dataset.fin)];
      actuel.style.setProperty('--avance', Math.min(1, Math.max(0, (n - d) / (f - d))).toFixed(4));
      const encore = actuel.querySelector('[data-champ="encore"]');
      if (encore) encore.textContent = `En cours · encore ${edt.dureeTexte(f - n, profil.motsLongs)}`;
    }
  }
  if (etat.vue === 'semaine') {
    const ligne = $('[data-champ="semaine-maintenant"]');
    const grille = $('#semaine-grille');
    if (ligne) {
      const [hMin, hMax] = [Number(grille.dataset.hmin), Number(grille.dataset.hmax)];
      const position = ((n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600 - hMin) / (hMax - hMin)) * 100;
      ligne.hidden = position < 0 || position > 100;
      ligne.style.setProperty('--position', position.toFixed(3));
    }
  }
  if (etat.vue !== 'maintenant') return;

  const restant = $('[data-champ="restant"]');
  if (restant) {
    const duree = edt.dureeTexte(s.restant, profil.motsLongs);
    restant.textContent = s.etat === 'cours' ? `Encore ${duree}` : `Dans ${duree}`;
  }
  const barre = $('#maintenant .barre');
  if (barre) {
    barre.style.setProperty('--fraction', s.fraction.toFixed(4));
    barre.setAttribute('aria-valuenow', Math.round(s.fraction * 100));
  }

  const prochain = s.etat === 'fini' ? null : s.suivant;
  const avantSuivant = $('[data-champ="avant-suivant"]');
  if (avantSuivant && prochain) avantSuivant.textContent = `dans ${edt.dureeTexte(prochain.debut - n, profil.motsLongs)}`;
  $('#ensuite').classList.toggle('imminent', Boolean(prochain) && prochain.debut - n <= RAPPEL_AVANT);

  const repere = $('[data-champ="repere"]');
  if (repere && s.cours.length) {
    const { pct } = bornesFrise(s.cours);
    const position = pct(n.getTime());
    repere.hidden = position < 0 || position > 100;
    repere.style.setProperty('--position', position.toFixed(3));
    for (const bloc of document.querySelectorAll('.bloc')) {
      const c = s.cours.find((x) => x.id === bloc.dataset.id);
      if (!c) continue;
      bloc.classList.toggle('passe', c.fin <= n);
      bloc.classList.toggle('actuel', c.debut <= n && n < c.fin);
    }
  }
}

// --- Rappels : notification système + carillon, 5 min avant chaque séance ---
// Calculés sur toutes les séances, même masquées : le rappel reste utile,
// mais il est toujours neutre pour une activité qui n'est pas « visible ».

function verifierRappels(s, n, profil) {
  const prochain = s.etat === 'fini' ? null : s.suivant;
  if (!prochain || etat.rappels.has(prochain.id)) return;
  const avant = prochain.debut - n;
  if (avant <= 0 || avant > RAPPEL_AVANT) return;
  etat.rappels.add(prochain.id);
  const a = affichage(prochain, { prudent: true });
  jouerCarillon();
  api.notifier(
    `Dans ${edt.dureeTexte(avant, profil.motsLongs)} : ${a.nom}`,
    [`À ${edt.heureTexte(prochain.debut)}`, a.lieu].filter(Boolean).join(', '),
  ).then((r) => journaliser(`Rappel ${a.nom} : ${r}`));
}

// Les navigateurs n'autorisent le son qu'après une première interaction :
// on prépare le contexte audio au premier clic ou à la première touche.
let audio = null;
function deverrouillerSon() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* pas de son disponible */ }
}
document.addEventListener('pointerdown', deverrouillerSon, { once: true });
document.addEventListener('keydown', deverrouillerSon, { once: true });

function jouerCarillon() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime + 0.05;
    for (const [frequence, decalage] of [[659.25, 0], [880, 0.2]]) {
      const oscillateur = audio.createOscillator();
      const volume = audio.createGain();
      oscillateur.type = 'sine';
      oscillateur.frequency.value = frequence;
      volume.gain.setValueAtTime(0.0001, t + decalage);
      volume.gain.exponentialRampToValueAtTime(0.25, t + decalage + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + decalage + 0.9);
      oscillateur.connect(volume).connect(audio.destination);
      oscillateur.start(t + decalage);
      oscillateur.stop(t + decalage + 1);
    }
    return `joué (état audio : ${audio.state})`;
  } catch (e) {
    return `échec : ${e.message}`;
  }
}

// --- Saisie d'un devoir ---
// On choisit d'abord QUAND le rendre : un jour, puis un cours de ce jour.
// La matière se déduit du cours ; on ne la choisit que pour un créneau sans
// matière fixe (DS) ou pour un devoir sans cours précis.

const saisie = { jour: null, seance: null };
const cleSeance = (o) => `o|${o.serie}|${o.dateOrigine}`;

function seanceChoisie() {
  if (!saisie.seance?.startsWith('o|')) return null;
  const [, serie, dateOrigine] = saisie.seance.split('|');
  return edt.trouverOccurrence(serie, dateOrigine);
}

// Sans argument : nouveau devoir. Avec un devoir : modification.
// Avec une séance (bouton « + » d'un cours) : devoir à rendre à ce cours.
function ouvrirAjout(devoir = null, occurrence = null) {
  if (!etat.devoirs) return;
  etat.edition = devoir?.id ?? null;
  const n = maintenant();
  const matiere = $('#ajout-matiere');
  // Reconstruite à chaque fois : les matières peuvent avoir changé.
  matiere.innerHTML = edt.matieres()
    .map((m) => `<option value="${m.cle}">${m.picto} ${echapper(m.nom)}</option>`).join('');
  // Matière par défaut : celle du cours en cours ou qui vient de finir,
  // puisqu'on note le travail à la fin du cours.
  const s = edt.situation(n, edt.estEcole);
  const recent = s.actuel ?? s.precedent ?? (s.etat === 'fini' ? s.cours.at(-1) : null);
  if (recent?.nature === 'ecole') matiere.value = recent.cle;

  if (devoir) {
    matiere.value = devoir.matiere.cle;
    saisie.jour = devoir.rendu;
    saisie.seance = devoir.seance ? cleSeance(devoir.seance) : 'date';
  } else if (occurrence) {
    saisie.jour = edt.debutJour(occurrence.debut);
    saisie.seance = cleSeance(occurrence);
  } else if (etat.vue === 'jour' && etat.jour && edt.ecartJours(n, etat.jour) > 0
    && edt.coursDuJour(etat.jour, edt.estEcole).length) {
    // Vue Jour sur un jour à venir : on propose ce jour ; reste à choisir le cours.
    saisie.jour = etat.jour;
    saisie.seance = null;
  } else {
    // Sinon : le prochain cours de la matière qui vient de finir.
    const [prochain] = recent?.nature === 'ecole' ? edt.prochainesOccurrences(n, (o) => o.cle === recent.cle, 1) : [];
    saisie.jour = prochain ? edt.debutJour(prochain.debut)
      : edt.prochainJourDeCours(n)?.jour ?? edt.ajouterJours(edt.debutJour(n), 1);
    saisie.seance = prochain ? cleSeance(prochain) : null;
  }

  const editeur = $('#ajout-texte');
  editeur.innerHTML = devoir ? nettoyerHtml(devoir.contenu ?? htmlDepuisTexte(devoir.texte)) : '';
  $('#ajout-erreur').hidden = true;
  $('#ajout-erreur-rendu').hidden = true;
  $('#ajout-afaire').value = devoir?.aFaireLe ? edt.isoLocal(devoir.aFaireLe) : '';
  $('#ajout-champ-afaire').hidden = !etat.reglages.aFaireLe && !devoir?.aFaireLe;
  $('#ajout-titre').textContent = devoir ? 'Modifier le devoir' : 'Nouveau devoir';
  $('#ajout-valider').textContent = devoir ? 'Enregistrer' : 'Ajouter';
  remplirJours();
  remplirSeances();
  const dialogue = $('#ajout');
  dialogue.returnValue = '';
  dialogue.showModal();
  // Cours déjà choisi : on passe directement au travail à faire.
  if (!saisie.seance) {
    $('#ajout-jours input:checked')?.focus();
    return;
  }
  editeur.focus();
  const plage = document.createRange(); // curseur à la fin du texte existant
  plage.selectNodeContents(editeur);
  plage.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(plage);
}

const devoirEnEdition = () => (etat.edition ? etat.devoirs?.find((d) => d.id === etat.edition) : null);

// Les dix prochains jours de classe, en puces groupées par semaine.
function remplirJours() {
  const n = maintenant();
  const jours = [];
  let j = edt.debutJour(n);
  for (let i = 0; i < 31 && jours.length < 10; i++, j = edt.ajouterJours(j, 1)) {
    if (edt.coursDuJour(j, edt.estEcole).some((o) => i > 0 || o.debut > n)) jours.push(j);
  }
  if (saisie.jour && !jours.some((x) => edt.memeJour(x, saisie.jour))) {
    jours.push(saisie.jour);
    jours.sort((a, b) => a - b);
  }
  let semaine = null;
  const html = [];
  for (const x of jours) {
    const s = edt.numeroSemaine(x).semaine;
    if (s !== semaine) {
      html.push(badgeSemaine(x, n, 'petit'));
      semaine = s;
    }
    const ecart = edt.ecartJours(n, x);
    const nom = ecart === 0 ? 'auj.' : ecart === 1 ? 'demain' : x.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    const choisi = saisie.jour && edt.memeJour(x, saisie.jour);
    html.push(`<label class="puce-choix" title="${echapper(edt.dateLongue(x))}">
      <input type="radio" name="rendu-jour" value="${edt.isoLocal(x)}" ${choisi ? 'checked' : ''}>
      <span class="jour-nom">${echapper(nom)}</span><span class="jour-num">${x.getDate()}</span></label>`);
  }
  $('#ajout-jours').innerHTML = html.join('');
  $('#ajout-date').value = saisie.jour ? edt.isoLocal(saisie.jour) : '';
}

// Les cours du jour choisi (et les créneaux comme le DS), plus « Sans cours précis ».
function remplirSeances() {
  const zone = $('#ajout-seances');
  if (!saisie.jour) {
    zone.innerHTML = '';
    return;
  }
  const seances = edt.coursDuJour(saisie.jour, edt.estEcole);
  // En modification, la séance actuelle reste proposée, même annulée.
  const actuelle = seanceChoisie();
  if (actuelle && edt.memeJour(actuelle.debut, saisie.jour) && !seances.some((o) => cleSeance(o) === saisie.seance)) {
    seances.push(actuelle);
    seances.sort((a, b) => a.debut - b.debut);
  }
  const options = seances.map((o) => {
    const a = o.nature === 'creneau' ? { nom: `${o.titre} (matière au choix)`, picto: o.picto, couleur: GRIS } : affichage(o);
    const statut = o.statut === 'annule' ? ' · annulé' : o.statut === 'deplace' ? ' · déplacé' : '';
    return `<label class="choix-seance" data-css="${couleurs(a)}">
      <input type="radio" name="rendu-seance" value="${cleSeance(o)}" ${cleSeance(o) === saisie.seance ? 'checked' : ''}>
      ${pastille(a)}<span><strong>${echapper(a.nom)}</strong><span class="precision">${edt.heureTexte(o.debut)}${statut}</span></span></label>`;
  });
  options.push(`<label class="choix-seance sans-cours">
      <input type="radio" name="rendu-seance" value="date" ${saisie.seance === 'date' ? 'checked' : ''}>
      <span><strong>Sans cours précis</strong><span class="precision">seulement la date</span></span></label>`);
  zone.innerHTML = `${seances.length ? '' : '<p class="vide">Pas de cours ce jour-là.</p>'}${options.join('')}`;
  appliquerStyles(zone);
  majMatiere();
}

// La matière vient du cours choisi ; le champ ne sert que sinon.
function majMatiere() {
  const o = seanceChoisie();
  $('#ajout-champ-matiere').hidden = o?.nature === 'ecole';
  if (o?.nature === 'ecole') $('#ajout-matiere').value = o.cle;
}

// Nouveau jour : on présélectionne le cours de la matière en cours, s'il y en a un.
function choisirJourSaisie(jour) {
  saisie.jour = edt.debutJour(jour);
  const cle = $('#ajout-matiere').value;
  const cours = edt.coursDuJour(saisie.jour, (o) => o.cle === cle);
  saisie.seance = cours.length === 1 ? cleSeance(cours[0]) : null;
  $('#ajout-erreur-rendu').hidden = true;
  remplirJours();
  remplirSeances();
}

async function enregistrerAjout() {
  const o = seanceChoisie();
  const serie = o?.serie ?? null;
  const dateOrigine = o?.dateOrigine ?? null;
  const pour = edt.isoLocal(o ? o.debut : saisie.jour);
  // Le contenu mis en forme est nettoyé ; `texte` en garde la version brute.
  const contenu = nettoyerHtml($('#ajout-texte').innerHTML);
  const edition = etat.edition;
  const devoir = {
    id: edition ?? crypto.randomUUID(),
    matiere: o?.nature === 'ecole' ? o.cle : $('#ajout-matiere').value,
    texte: texteBrut(contenu),
    contenu,
    pour,
    serie,
    dateOrigine,
    aFaireLe: (!$('#ajout-champ-afaire').hidden && $('#ajout-afaire').value) || null,
  };
  etat.edition = null;
  if (!devoir.texte || !pour) return;
  try {
    if (edition) await stockage.modifier(devoir);
    else await stockage.ajouter(devoir);
    await chargerDevoirs();
    planifierSauvegarde();
    journaliser(`Devoir ${edition ? 'modifié' : 'ajouté'} : ${devoir.texte.split('\n')[0]} (${serie ? 'rattaché au cours' : 'rattaché à une date'})`);
    if (edition) afficherDetail(edition);
  } catch (e) {
    journaliser(`${edition ? 'Modification' : 'Ajout'} : échec (${e.message})`);
  }
}

// Coller depuis l'ENT : on garde la mise en forme utile, nettoyée.
$('#ajout-texte').addEventListener('paste', (e) => {
  const html = e.clipboardData?.getData('text/html');
  const texte = e.clipboardData?.getData('text/plain') ?? '';
  e.preventDefault();
  if (html) document.execCommand('insertHTML', false, nettoyerHtml(html));
  else document.execCommand('insertText', false, texte);
});
// Un glisser-déposer pourrait apporter des images ou du HTML non nettoyé.
$('#ajout-texte').addEventListener('drop', (e) => e.preventDefault());
// Les boutons de mise en forme ne doivent pas prendre le focus de l'éditeur.
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('[data-format]')) e.preventDefault();
});

// --- Une séance : annuler, déplacer, rétablir ---
// L'exception porte sur la séance prévue (série + date d'origine) ; les
// devoirs qui lui sont rattachés la suivent d'eux-mêmes.

let seanceOuverte = null;
const hhmmDe = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function ouvrirSeance(cle) {
  const [, serie, dateOrigine] = cle.split('|');
  const o = edt.trouverOccurrence(serie, dateOrigine);
  if (!o) return;
  seanceOuverte = o;
  const n = maintenant();
  const a = affichage(o);
  const prevu = o.origine ?? { debut: o.debut, fin: o.fin };
  $('#seance-pastille').innerHTML = pastille(a);
  appliquerStyles($('#seance-pastille'));
  $('#seance-titre').textContent = a.nom;
  $('#seance-quand').textContent = [
    `Prévue ${edt.dateLongue(prevu.debut)}, ${edt.heureTexte(prevu.debut)} – ${edt.heureTexte(prevu.fin)}`, a.lieu,
  ].filter(Boolean).join(' · ');
  const devoirs = o.nature === 'perso' ? [] : devoirsDe(o);
  $('#seance-devoirs').innerHTML = devoirs.length
    ? `<p class="etiquette">À rendre à cette séance</p><ul class="liste-devoirs">${devoirs.map((d) => ligneDevoir(d, {})).join('')}</ul>
       <p class="vide">Si la séance est déplacée, ${devoirs.length > 1 ? 'ces devoirs la suivent' : 'ce devoir la suit'}.</p>`
    : '';
  appliquerStyles($('#seance-devoirs'));
  const statut = o.statut === 'annule' || o.statut === 'deplace' ? o.statut : 'normal';
  document.querySelector(`input[name="seance-statut"][value="${statut}"]`).checked = true;
  $('#seance-motif').value = o.motif ?? '';
  $('#seance-date').value = edt.isoLocal(o.debut);
  $('#seance-debut').value = hhmmDe(o.debut);
  $('#seance-fin').value = hhmmDe(o.fin);
  $('#seance-erreur').hidden = true;
  $('#seance-ajouter-devoir').hidden = o.nature === 'perso' || o.debut <= n;
  // En mode discret, une activité non visible ne se modifie pas (comme dans l'écran Emploi du temps).
  const serieComplete = edt.series().find((x) => x.id === o.serie);
  const cache = o.nature === 'perso' && etat.discret && o.categorie?.confidentialite !== 'visible';
  $('#seance-serie').hidden = !serieComplete || cache;
  $('#seance-serie').textContent = serieComplete?.type === 'evenement' ? 'Modifier l’événement' : 'Modifier le cours (toute la série)';
  majChampsSeance();
  if (!$('#seance').open) $('#seance').showModal();
  document.querySelector('input[name="seance-statut"]:checked').focus();
}

function majChampsSeance() {
  const statut = document.querySelector('input[name="seance-statut"]:checked')?.value;
  $('#seance-deplacement').hidden = statut !== 'deplace';
  $('#seance-champ-motif').hidden = statut === 'normal';
  for (const id of ['#seance-date', '#seance-debut', '#seance-fin']) $(id).required = statut === 'deplace';
}

async function enregistrerSeance() {
  const o = seanceOuverte;
  const statut = document.querySelector('input[name="seance-statut"]:checked').value;
  const motif = $('#seance-motif').value.trim() || null;
  const cle = { serie: o.serie, dateOrigine: o.dateOrigine };
  try {
    if (statut === 'normal') await stockage.supprimerException(o.serie, o.dateOrigine);
    else if (statut === 'annule') await stockage.enregistrerException({ ...cle, statut, motif });
    else {
      await stockage.enregistrerException({
        ...cle, statut, motif, nouvelleDate: $('#seance-date').value, debut: $('#seance-debut').value, fin: $('#seance-fin').value,
      });
    }
    await rechargerTout();
    planifierSauvegarde();
    const libelle = { normal: 'rétablie', annule: 'annulée', deplace: `déplacée au ${$('#seance-date').value} à ${$('#seance-debut').value}` }[statut];
    journaliser(`Séance ${affichage(o).nom} du ${o.dateOrigine} ${libelle}`);
  } catch (e) {
    journaliser(`Séance : échec (${e.message})`);
  }
}

let seanceEnCours = Promise.resolve();
$('#seance form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  const statut = document.querySelector('input[name="seance-statut"]:checked')?.value;
  if (statut === 'deplace' && $('#seance-fin').value <= $('#seance-debut').value) {
    e.preventDefault();
    $('#seance-erreur').textContent = 'L’heure de fin doit être après l’heure de début.';
    $('#seance-erreur').hidden = false;
    return;
  }
  seanceEnCours = enregistrerSeance();
});

// Cours annulé : on rattache le devoir à la séance suivante de la même série
// de cours (même matière, ou même créneau pour un DS).
async function reporter(id) {
  const d = etat.devoirs?.find((x) => x.id === id);
  const o = d?.seance;
  if (!o) return;
  const filtre = o.nature === 'creneau' ? (x) => x.serie === o.serie : (x) => x.cle === o.cle;
  const [suivante] = edt.prochainesOccurrences(o.fin, filtre, 1);
  if (!suivante) {
    journaliser('Report : pas de cours suivant dans les cinq semaines');
    return;
  }
  try {
    await stockage.rattacher(id, { serie: suivante.serie, dateOrigine: suivante.dateOrigine, pour: edt.isoLocal(suivante.debut) });
    await chargerDevoirs();
    planifierSauvegarde();
    journaliser(`Report : « ${d.texte} » pour ${edt.dateLongue(suivante.debut)}`);
  } catch (e) {
    journaliser(`Report : échec (${e.message})`);
  }
}

// --- Outils ---

function journaliser(texte) {
  const heure = new Date().toLocaleTimeString('fr-FR');
  etat.journal.push(`${heure} ${texte}`);
  const li = document.createElement('li');
  li.textContent = `${heure} ${texte}`;
  $('#journal').append(li);
}

function resumeSqlite(r) {
  if (!r) return 'annulé';
  return r.ok
    ? `OK, ${r.lignes} lignes, journal ${r.journal}, ${r.ms} ms (${r.dossier})`
    : `ÉCHEC : ${r.erreur} (${r.dossier ?? ''})`;
}

function mesurerFluidite(dureeMs = 1000) {
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

function statistiquesRendu() {
  if (!etat.durees.length) return 'pas encore mesuré';
  const moyenne = etat.durees.reduce((a, b) => a + b, 0) / etat.durees.length;
  return `moyenne ${moyenne.toFixed(2)} ms, max ${Math.max(...etat.durees).toFixed(2)} ms (${etat.durees.length} rendus)`;
}

async function lignesEnvironnement() {
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

function remplirListe(dl, lignes) {
  dl.replaceChildren();
  for (const [cle, valeur] of lignes) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = cle;
    dd.textContent = valeur;
    dl.append(dt, dd);
  }
}

async function afficherEnvironnement() {
  remplirListe($('#environnement'), await lignesEnvironnement());
}

async function rapport() {
  const lignes = await lignesEnvironnement();
  return [
    'Sablio – rapport du prototype',
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
async function verifierStockage() {
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

async function lancerTests() {
  journaliser(`Stockage aller-retour : ${await verifierStockage()}`);
  if (dansElectron) journaliser(`SQLite (Node) : ${resumeSqlite(await api.testerSqlite())}`);
  journaliser(`Notification : ${await api.notifier('Essai de notification', 'Si ce message s’affiche, les rappels fonctionnent.')}`);
  journaliser(`Son : ${jouerCarillon()}`);
  journaliser(`Fluidité : ${await mesurerFluidite()}`);
  return etat.journal;
}

function basculerOutils() {
  const panneau = $('#outils');
  panneau.hidden = !panneau.hidden;
  for (const b of document.querySelectorAll('[data-action="outils"][aria-expanded]')) {
    b.setAttribute('aria-expanded', String(!panneau.hidden));
  }
  if (!panneau.hidden) {
    const n = maintenant();
    const p = (x) => String(x).padStart(2, '0');
    $('#heure-simulee').value = `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`;
    $('#discret-mode').value = etat.reglages.discret;
    $('#reglage-afaire').checked = etat.reglages.aFaireLe;
    $('#reglage-sac').value = etat.reglages.sac;
    afficherEnvironnement();
    afficherDonnees();
  }
}

function changerProfil(profil) {
  if (!PROFILS[profil]) return;
  etat.profil = profil;
  document.documentElement.dataset.profil = profil;
  $('#profil').value = profil;
  ecrirePreference('profil', profil);
  rendre(true);
}

const actions = {
  'plein-ecran': () => api.basculerPleinEcran(),
  compact: () => api.basculerCompact?.(),
  outils: basculerOutils,
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
  'serie-supprimer': supprimerSerieEditee,
  'categorie-nouvelle': (bouton) => ouvrirCategorie(null, bouton.dataset.nature),
  'categorie-supprimer': supprimerCategorieEditee,
  'seance-serie': () => {
    $('#seance').close();
    const serie = edt.series().find((x) => x.id === seanceOuverte.serie);
    if (serie?.type === 'evenement') ouvrirEvenement(serie.id);
    else ouvrirSerie(serie.id);
  },
  'evenement-nouveau': (bouton) => ouvrirEvenement(null, bouton.dataset.date),
  'evenement-supprimer': supprimerEvenementEdite,
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

// L'événement « submit » part tout de suite et dit quel bouton a servi ;
// « close » part plus tard, et deux fermetures rapprochées se confondent.
let ajoutEnCours = Promise.resolve();
$('#ajout form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') {
    etat.edition = null;
    return;
  }
  if (!saisie.seance) {
    e.preventDefault();
    $('#ajout-erreur-rendu').hidden = false;
    $('#ajout-seances input')?.focus();
    return;
  }
  // L'éditeur n'est pas un champ de formulaire : on vérifie nous-mêmes.
  if (!texteBrut($('#ajout-texte').innerHTML)) {
    e.preventDefault();
    $('#ajout-erreur').hidden = false;
    $('#ajout-texte').focus();
    return;
  }
  ajoutEnCours = enregistrerAjout();
});
$('#ajout').addEventListener('cancel', () => { etat.edition = null; });

// Essai des actions sans clic, pour les captures automatiques : saisie,
// report d'un devoir dont le cours est annulé, bouton du mode discret.
async function essaisInterface() {
  const avant = etat.devoirs.length;
  // Aller à : une semaine, puis une saisie fausse.
  etat.vue = 'jour';
  rendre(true);
  $('#aller-saisie').value = '50';
  $('#aller').requestSubmit();
  const apresSemaine = `${edt.isoLocal(etat.jour)} (${texteSemaine(etat.jour, maintenant())})`;
  $('#aller-saisie').value = '31/02';
  $('#aller').requestSubmit();
  journaliser(`Essai aller à : « 50 » → ${apresSemaine} ; « 31/02 » → ${$('#aller-erreur').hidden ? 'accepté à tort' : `refusé (${$('#aller-erreur').textContent})`}`);
  $('#aller-saisie').value = '';
  $('#aller-erreur').hidden = true;

  // Saisie sur un jour à venir : il faut choisir le cours avant d'enregistrer.
  ouvrirAjout();
  $('#ajout-texte').innerHTML = 'Sans cours choisi';
  $('#ajout form').requestSubmit($('#ajout button[value="ok"]'));
  journaliser(`Essai saisie sans cours : ${$('#ajout').open && !$('#ajout-erreur-rendu').hidden ? 'refusée, la fenêtre reste ouverte' : 'acceptée à tort'}`);
  $('#ajout').close();
  allerAuJour(maintenant());

  // Nettoyage : un contenu dangereux, analysé sans être exécuté.
  const piege = '<p onclick="x()">Texte <b>gras</b><script>alert(1)</script><img src="x" onerror="alert(1)"> <a href="javascript:alert(1)">lien</a> <a href="https://exemple.fr">site</a></p>';
  journaliser(`Essai nettoyage : ${nettoyerHtml(piege)}`);
  ouvrirAjout();
  $('#ajout-texte').innerHTML = '<p>Essai <strong>automatique</strong></p><ul><li>premier point</li><li>second point</li></ul>';
  const choix = $('input[name="rendu-seance"]:checked')?.closest('label').textContent.trim().replace(/\s+/g, ' ');
  $('#ajout form').requestSubmit($('#ajout button[value="ok"]'));
  await ajoutEnCours;
  const ajoute = etat.devoirs.find((d) => d.texte.startsWith('Essai automatique'));
  if (!ajoute) {
    journaliser(`Essai saisie : ÉCHEC, rien n'a été ajouté (choix « ${choix} »)`);
    return;
  }
  journaliser(`Essai texte brut : ${JSON.stringify(ajoute?.texte)}`);
  journaliser(`Essai saisie : ${etat.devoirs.length - avant} devoir ajouté (${ajoute?.matiere.nom}, « ${choix} »), à rendre ${ajoute ? edt.dateLongue(ajoute.rendu) : '?'}, rattaché ${ajoute?.serie ? 'au cours' : 'à une date'}`);
  const annule = etat.devoirs.find((d) => d.seance?.statut === 'annule');
  if (annule) {
    await reporter(annule.id);
    const apres = etat.devoirs.find((d) => d.id === annule.id);
    journaliser(`Essai report : « ${apres.texte} » ${edt.dateLongue(annule.rendu)} → ${edt.dateLongue(apres.rendu)} à ${edt.heureTexte(apres.seance.debut)} (${apres.seance.statut})`);
  } else {
    journaliser('Essai report : aucun devoir sur un cours annulé');
  }
  const etats = [etat.discret];
  basculerDiscret();
  etats.push(etat.discret);
  basculerDiscret();
  etats.push(etat.discret);
  journaliser(`Essai mode discret (${etat.reglages.discret}) : ${etats.map((x) => (x ? 'actif' : 'inactif')).join(' → ')}`);

  // Séance : on déplace celle du DS (un devoir y est rattaché), puis on la rétablit.
  const ds = etat.devoirs.find((d) => d.seance?.nature === 'creneau');
  if (ds) {
    const avantDeplacement = edt.dateLongue(ds.rendu);
    ouvrirSeance(cleSeance(ds.seance));
    $('#seance input[value="deplace"]').checked = true;
    majChampsSeance();
    $('#seance-date').value = edt.isoLocal(edt.ajouterJours(ds.seance.debut, 1));
    $('#seance-debut').value = '14:00';
    $('#seance-fin').value = '15:50';
    $('#seance-motif').value = 'essai';
    $('#seance form').requestSubmit($('#seance button[value="ok"]'));
    await seanceEnCours;
    const deplace = etat.devoirs.find((d) => d.id === ds.id);
    const apresDeplacement = `${edt.dateLongue(deplace.rendu)} à ${edt.heureTexte(deplace.seance.debut)} (${deplace.seance.statut})`;
    ouvrirSeance(cleSeance(deplace.seance));
    $('#seance input[value="normal"]').checked = true;
    $('#seance form').requestSubmit($('#seance button[value="ok"]'));
    await seanceEnCours;
    const retabli = etat.devoirs.find((d) => d.id === ds.id);
    journaliser(`Essai séance : « ${ds.texte} » ${avantDeplacement} → déplacée : ${apresDeplacement} → rétablie : ${edt.dateLongue(retabli.rendu)} (${retabli.seance.statut})`);
  }

  // Emploi du temps : nouvelle activité, cours du samedi, puis suppression.
  ouvrirCategorie(null, 'perso');
  $('#cat-nom').value = 'Équitation';
  document.querySelector('input[name="cat-picto"][value="🐴"]').checked = true;
  $('#edt-categorie form').requestSubmit($('#edt-categorie button[value="ok"]'));
  await categorieEnCours;
  const equitation = edt.activites().find((x) => x.nom === 'Équitation');
  ouvrirSerie(null, 6);
  $('#serie-categorie').value = equitation.cle;
  majChampsSerie();
  $('#serie-debut').value = '10:00';
  $('#serie-fin').value = '11:30';
  $('#serie-salle').value = 'Centre équestre';
  $('#edt-serie form').requestSubmit($('#edt-serie button[value="ok"]'));
  await serieEnCours;
  const samedi = edt.ajouterJours(edt.lundi(maintenant()), 5);
  const auCentre = edt.coursDuJour(samedi).map((o) => `${o.titre} ${edt.heureTexte(o.debut)}`).join(', ');
  ouvrirCategorie(equitation.cle);
  await supprimerCategorieEditee();
  const refus = $('#cat-erreur').hidden ? 'acceptée à tort' : 'refusée';
  $('#edt-categorie').close();
  serieEditee = edt.series().find((x) => x.cle === equitation.cle);
  const confirmer = window.confirm;
  window.confirm = () => true;
  await supprimerSerieEditee();
  ouvrirCategorie(equitation.cle);
  await supprimerCategorieEditee();
  window.confirm = confirmer;
  journaliser(`Essai emploi du temps : couleur ${equitation.couleur}, samedi ${edt.isoLocal(samedi)} → ${auCentre || 'rien'} ; suppression de l’activité utilisée ${refus} ; après suppression : ${edt.activites().some((x) => x.nom === 'Équitation') ? 'encore là' : 'retirée'}`);

  // Agenda : RDV psy le mercredi suivant à 17 h 30, trois semaines de suite.
  const mercredi = edt.ajouterJours(edt.lundi(edt.ajouterJours(maintenant(), 7)), 2);
  ouvrirEvenement(null, edt.isoLocal(mercredi));
  $('#evt-categorie').value = 'psy';
  document.querySelector('input[name="evt-repetition"][value="1"]').checked = true;
  $('#evt-fois').value = '3';
  $('#evt-debut').value = '17:30';
  $('#evt-fin').value = '18:15';
  majChampsEvenement();
  const resume = $('#evt-resume').textContent;
  $('#evenement form').requestSubmit($('#evenement button[value="ok"]'));
  await evenementEnCours;
  const rdv = [0, 7, 14, 21].map((j) => edt.coursDuJour(edt.ajouterJours(mercredi, j), (o) => o.cle === 'psy').length);
  evenementEdite = edt.evenements().find((x) => x.cle === 'psy');
  const confirmerEvt = window.confirm;
  window.confirm = () => true;
  await supprimerEvenementEdite();
  window.confirm = confirmerEvt;
  journaliser(`Essai agenda : « ${resume} » ; psy les mercredis ${rdv.join('/')} (attendu 1/1/1/0) ; après suppression : ${edt.evenements().some((x) => x.cle === 'psy') ? 'encore là' : 'retiré'}`);

  // Modification : on ouvre le devoir, on le modifie, on enregistre.
  afficherDetail(ajoute.id);
  actions['modifier-devoir']();
  $('#ajout-texte').innerHTML += '<p>Ligne ajoutée</p>';
  $('#ajout form').requestSubmit($('#ajout button[value="ok"]'));
  await ajoutEnCours;
  const modifie = etat.devoirs.find((d) => d.id === ajoute.id);
  journaliser(`Essai modification : ${etat.devoirs.length} devoirs, texte ${JSON.stringify(modifie?.texte)}, détail ${$('#detail').open ? 'rouvert' : 'fermé'}`);
  $('#detail').close();
}

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

// Accès pour les captures automatiques (main.js).
window.prototypeMyDevoirs = {
  scenario(iso, profil, vue = 'maintenant', jour = null) {
    changerProfil(profil);
    etat.vue = vue;
    etat.jour = jour ? edt.dateDepuisIso(jour) : edt.debutJour(new Date(iso));
    etat.semaine = edt.lundi(etat.jour);
    reglerHorloge({ date: new Date(iso), vitesse: 0 });
  },
  modeDiscret: changerModeDiscret,
  ouvrirAjout,
  fermerAjout: () => $('#ajout').close(),
  essaisInterface,
  ouvrirSeance: (debutCle) => ouvrirSeance(document.querySelector(`[data-seance^="${debutCle}"]`).dataset.seance),
  fermerSeance: () => $('#seance').close(),
  afficherDetail: (texte) => afficherDetail(etat.devoirs.find((d) => d.texte.startsWith(texte))?.id),
  fermerDetail: () => $('#detail').close(),
  lancerTests,
  rapport,
};

// --- Version navigateur : installation, hors-ligne, rappels ---

let invitationInstallation = null;

async function installer() {
  if (!invitationInstallation) return;
  invitationInstallation.prompt();
  const { outcome } = await invitationInstallation.userChoice;
  journaliser(`Installation : ${outcome === 'accepted' ? 'acceptée' : 'refusée'}`);
  invitationInstallation = null;
  $('[data-action="installer"]').hidden = true;
}

// Les navigateurs n'acceptent de demander l'autorisation qu'après un clic.
async function activerRappels() {
  const reponse = await Notification.requestPermission();
  journaliser(`Autorisation des notifications : ${reponse}`);
  $('[data-action="activer-rappels"]').hidden = reponse !== 'default';
}

function preparerNavigateur() {
  // Fonctions propres à Electron, absentes de la version navigateur.
  for (const bouton of document.querySelectorAll('[data-action="compact"], [data-action^="test-sqlite"]')) bouton.hidden = true;
  if ('Notification' in window && Notification.permission === 'default') {
    $('[data-action="activer-rappels"]').hidden = false;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // on garde l'invitation pour notre propre bouton
    invitationInstallation = e;
    $('[data-action="installer"]').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    $('[data-action="installer"]').hidden = true;
    journaliser('Application installée');
  });
  if (!enPWA) return;
  // Une nouvelle version du service worker a pris la main : on recharge une fois.
  const avaitUnServiceWorker = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (avaitUnServiceWorker) location.reload();
  });
  navigator.serviceWorker.register('./sw.js')
    .catch((e) => journaliser(`Service worker : échec (${e.message})`));
  // Demande au navigateur de ne pas effacer les données de lui-même.
  navigator.storage?.persist?.().then((ok) => journaliser(`Stockage persistant : ${ok ? 'accordé' : 'refusé'}`));
}

if (!dansElectron) preparerNavigateur();

// --- Données : base SQLite et sauvegarde dans un fichier ---

let stockage = null;
const sauvegardeEtat = { fichier: null, autorisation: '', derniere: null, minuterie: null, suspendue: false };

// Démonstration : exceptions (un cours annulé, un cours déplacé) et devoirs
// rattachés aux prochains cours, calculés à partir d'un jour de référence
// retenu pour que les deux restent cohérents d'une ouverture à l'autre.
const CLE_REFERENCE = 'sablio-demo-reference';

// Démonstration complète : emploi du temps, exceptions et devoirs.
function preparerDemo(reference) {
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
async function chargerEmploiDuTemps() {
  const donnees = await stockage.emploiDuTemps();
  edt.definirEmploiDuTemps(donnees);
  edt.definirExceptions(donnees.exceptions);
}

async function rechargerTout() {
  await chargerEmploiDuTemps();
  await chargerDevoirs();
}

async function chargerDevoirs() {
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
function planifierSauvegarde() {
  if (sauvegardeEtat.suspendue) return;
  clearTimeout(sauvegardeEtat.minuterie);
  sauvegardeEtat.minuterie = setTimeout(() => sauvegarder(false), 2000);
}

// `interactif` : appelé depuis un clic, le navigateur peut donc demander l'autorisation.
async function sauvegarder(interactif) {
  const fichier = sauvegardeEtat.fichier;
  if (!fichier) {
    if (interactif) journaliser('Sauvegarde : choisissez d’abord un fichier');
    return;
  }
  try {
    sauvegardeEtat.autorisation = await sauvegarde.autorisation(fichier, interactif);
    const enAttente = sauvegardeEtat.autorisation !== 'granted';
    $('[data-action="reprendre-sauvegarde"]').hidden = !enAttente;
    if (enAttente) {
      journaliser(`Sauvegarde en attente : autorisation « ${sauvegardeEtat.autorisation} »`);
      return;
    }
    const octets = await stockage.exporter();
    await sauvegarde.ecrire(fichier, octets);
    sauvegardeEtat.derniere = new Date();
    sauvegardeEtat.suspendue = false;
    journaliser(`Sauvegarde : ${Math.ceil(octets.length / 1024)} Ko écrits dans ${fichier.name}`);
  } catch (e) {
    journaliser(`Sauvegarde : échec (${e.message})`);
  } finally {
    afficherDonnees();
  }
}

function afficherDonnees() {
  const info = stockage?.info;
  const f = sauvegardeEtat;
  remplirListe($('#donnees'), [
    ['Base', info?.mode ?? 'ouverture…'],
    ['SQLite', info?.sqlite ?? '–'],
    ['Devoirs', etat.devoirs ? String(etat.devoirs.length) : '–'],
    ['Fichier de sauvegarde', !sauvegarde.disponible ? 'impossible dans ce navigateur' : f.fichier?.name ?? 'aucun'],
    ['Autorisation d’écrire', f.fichier ? f.autorisation || '?' : '–'],
    ['Dernière sauvegarde', f.derniere ? f.derniere.toLocaleTimeString('fr-FR') : 'aucune pendant cette session'],
    ['Sauvegarde automatique', f.suspendue ? 'suspendue (après la perte simulée)' : 'après chaque modification'],
  ]);
}

const actionsDonnees = {
  'choisir-sauvegarde': async () => {
    try {
      sauvegardeEtat.fichier = await sauvegarde.choisirFichier();
      journaliser(`Fichier de sauvegarde choisi : ${sauvegardeEtat.fichier.name}`);
      await sauvegarder(true);
    } catch (e) {
      if (e.name !== 'AbortError') journaliser(`Choix du fichier : échec (${e.message})`);
    }
  },
  sauvegarder: () => sauvegarder(true),
  'reprendre-sauvegarde': () => sauvegarder(true),
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
Object.assign(actions, actionsDonnees);

// Une seule fenêtre peut ouvrir la base. Le verrou (Web Locks) est gardé tant
// que la page est ouverte et libéré automatiquement à sa fermeture.
function prendreVerrou() {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request('mydevoirs-base', { ifAvailable: true }, (verrou) => {
      resolve(Boolean(verrou));
      return verrou ? new Promise(() => {}) : undefined;
    });
  });
}

function alerter(texte, avecBouton = false) {
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
actions.recharger = () => location.reload();

async function demarrerStockage() {
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
    sauvegardeEtat.fichier = (await sauvegarde.fichierEnregistre()) ?? null;
    if (sauvegardeEtat.fichier) {
      // La question clé : le navigateur se souvient-il de l'autorisation ?
      sauvegardeEtat.autorisation = await sauvegarde.autorisation(sauvegardeEtat.fichier);
      journaliser(`Au démarrage : fichier ${sauvegardeEtat.fichier.name}, autorisation « ${sauvegardeEtat.autorisation} »`);
      $('[data-action="reprendre-sauvegarde"]').hidden = sauvegardeEtat.autorisation === 'granted';
    }
  }
  afficherDonnees();
}

// Paramètres d'adresse, pour les essais dans un navigateur :
// index.html?heure=2026-11-23T10:32&profil=primaire&vue=jour (heure figée).
// Lus avant d'ouvrir la base : la démonstration se cale sur l'heure simulée.
const parametres = new URLSearchParams(location.search);
if (parametres.get('heure')) {
  Object.assign(horloge, { reelBase: Date.now(), simBase: new Date(parametres.get('heure')).getTime(), vitesse: 0, simulee: true });
}
if (parametres.get('vue') === 'jour') {
  etat.vue = 'jour';
  etat.jour = parametres.get('jour') ? edt.dateDepuisIso(parametres.get('jour')) : edt.debutJour(maintenant());
}
if (parametres.get('vue') === 'afaire') etat.vue = 'afaire';
if (parametres.get('vue') === 'edt') etat.vue = 'edt';
if (parametres.get('vue') === 'semaine') {
  etat.vue = 'semaine';
  etat.semaine = parametres.get('jour') ? edt.lundi(edt.dateDepuisIso(parametres.get('jour'))) : semaineParDefaut(maintenant());
}
changerProfil(parametres.get('profil') ?? etat.profil);
planifier();
demarrerStockage().catch((e) => journaliser(`Stockage : échec (${e.message})`));
requestAnimationFrame(() => api.premierRendu());
