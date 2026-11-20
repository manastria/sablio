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
  ].join('|');
  if (forcer || cle !== cleStructure) {
    cleStructure = cle;
    afficherVue();
    if (etat.vue === 'jour') construireJour(n, profil);
    else construire(s, n, profil);
  }
  mettreAJour(s, n, profil);
  verifierRappels(edt.situation(n), n, profil);
  etat.durees.push(performance.now() - debut);
  if (etat.durees.length > 300) etat.durees.shift();
}

function afficherVue() {
  $('#vue-maintenant').hidden = etat.vue !== 'maintenant';
  $('#vue-jour').hidden = etat.vue !== 'jour';
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
  // Journée finie : la frise laisse la place au sac du prochain jour de classe.
  $('#frise').innerHTML = s.etat === 'fini' && s.demain
    ? htmlSac(s.demain.jour, `Préparer le sac pour ${edt.jourRelatif(s.demain.jour, n)}`, true)
    : htmlFrise(s);
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
    d.aFaireLe && ecart > 0 ? `à faire ${edt.quandTexte(d.aFaireLe, n, profil)}` : '',
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
    ${caches > 0 ? `<p class="vide">Et ${caches} autre${caches > 1 ? 's' : ''} plus tard.</p>` : ''}
    ${faits.length ? `<details class="faits"><summary>${pluriel(faits.length, 'devoir')} fait${faits.length > 1 ? 's' : ''}</summary>
      <ul class="liste-devoirs">${faits.map((d) => ligneDevoir(d, { droite: edt.echeanceTexte(d.rendu, n, profil) })).join('')}</ul></details>` : ''}`;
}

// --- Préparer le sac ---
// Matières du jour (déduites de l'emploi du temps) et matériel habituel.
// Les cases cochées ne valent que pour ce jour.

const cleSac = (jour) => `sablio-sac-${edt.isoLocal(jour)}`;

function lireSac(jour) {
  try { return new Set(JSON.parse(lirePreference(cleSac(jour), '[]'))); } catch { return new Set(); }
}

function htmlSac(jour, titre, avecLien = false) {
  const coches = lireSac(jour);
  const matieres = new Map();
  for (const o of edt.coursDuJour(jour, edt.estEcole)) {
    const m = o.nature === 'ecole' ? o.categorie : devoirsDe(o)[0]?.matiere;
    if (m && !matieres.has(m.cle)) matieres.set(m.cle, m);
  }
  const lien = avecLien ? `<button type="button" class="lien" data-action="voir-jour" data-date="${edt.isoLocal(jour)}">Voir la journée</button>` : '';
  const entete = `<div class="entete-carte"><p class="etiquette">${echapper(titre)}</p>${lien}</div>`;
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
    <span class="semaine">Semaine ${edt.lettreSemaine(jour)}</span>
    <button type="button" class="mise-en-avant" data-action="ajouter">+ Devoir</button>
    ${htmlBandeJours(jour, n)}`;
  $('#jour-edt').innerHTML = htmlJourEdt(jour, n);
  $('#jour-devoirs').innerHTML = htmlJourDevoirs(jour, n, profil);
  $('#jour-sac').innerHTML = htmlSac(jour, `Dans le sac pour ${edt.jourRelatif(jour, n)}`);
  appliquerStyles($('#vue-jour'));
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
  return `<nav class="bande-jours" aria-label="Jours de la semaine">
    <button type="button" class="puce-semaine" data-action="jour-decaler" data-jours="-7" aria-label="Semaine précédente" title="Semaine précédente">«</button>
    ${puces.join('')}
    <button type="button" class="puce-semaine" data-action="jour-decaler" data-jours="7" aria-label="Semaine suivante" title="Semaine suivante">»</button>
  </nav>`;
}

function htmlJourEdt(jour, n) {
  const liste = edt.occurrencesDuJour(jour).filter(visible);
  const titre = '<p class="etiquette">Emploi du temps</p>';
  if (!liste.length) return `${titre}<p class="vide">Pas de cours ce jour.</p>`;
  const ecart = edt.ecartJours(n, jour);
  let repere = ecart !== 0; // le repère « vous êtes ici » n'existe qu'aujourd'hui
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
  if (ecart === 0 && o.debut <= n && n < o.fin && (o.statut === 'normal' || o.statut === 'deplace')) classes.push('actuel');
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
  return `<li class="${classes.join(' ')}" data-css="${couleurs(a)}">
      <span class="horaire">${edt.heureTexte(o.debut)}<br>${edt.heureTexte(o.fin)}</span>
      ${pastille(a)}
      <span class="seance-texte"><strong>${echapper(a.nom)}</strong>
        ${a.lieu ? `<span class="precision">${echapper(a.lieu)}</span>` : ''}
        ${statut ? `<span class="statut">${echapper(statut)}</span>` : ''}</span>
      ${badge}
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

function allerAuJour(jour) {
  etat.jour = edt.debutJour(jour);
  etat.vue = 'jour';
  rendre(true);
}

// --- Mise à jour fine (chaque seconde) ---

function mettreAJour(s, n, profil) {
  $('[data-champ="heure"]').textContent = edt.heureTexte(n);
  $('[data-champ="simulee"]').hidden = !horloge.simulee;
  $('[data-champ="date"]').textContent = `${edt.dateLongue(n)} · semaine ${edt.lettreSemaine(n)}`;
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

// Sans argument : nouveau devoir. Avec un devoir : modification.
function ouvrirAjout(devoir = null) {
  if (!etat.devoirs) return;
  etat.edition = devoir?.id ?? null;
  const n = maintenant();
  const matiere = $('#ajout-matiere');
  if (!matiere.options.length) {
    matiere.innerHTML = Object.values(edt.MATIERES)
      .map((m) => `<option value="${m.cle}">${m.picto} ${echapper(m.nom)}</option>`).join('');
  }
  if (devoir) {
    matiere.value = devoir.matiere.cle;
  } else {
    // Matière par défaut : celle du cours en cours ou qui vient de finir,
    // puisqu'on note le travail à la fin du cours.
    const s = edt.situation(n, edt.estEcole);
    const recent = s.actuel ?? s.precedent ?? (s.etat === 'fini' ? s.cours.at(-1) : null);
    if (recent?.nature === 'ecole') matiere.value = recent.cle;
  }
  const editeur = $('#ajout-texte');
  editeur.innerHTML = devoir ? nettoyerHtml(devoir.contenu ?? htmlDepuisTexte(devoir.texte)) : '';
  $('#ajout-erreur').hidden = true;
  $('#ajout-afaire').value = devoir?.aFaireLe ? edt.isoLocal(devoir.aFaireLe) : '';
  $('#ajout-date').value = edt.isoLocal(devoir?.pour ?? (etat.vue === 'jour' && etat.jour ? etat.jour : edt.ajouterJours(n, 1)));
  $('#ajout-champ-afaire').hidden = !etat.reglages.aFaireLe && !devoir?.aFaireLe;
  $('#ajout-titre').textContent = devoir ? 'Modifier le devoir' : 'Nouveau devoir';
  $('#ajout-valider').textContent = devoir ? 'Enregistrer' : 'Ajouter';
  remplirRendu();
  const dialogue = $('#ajout');
  dialogue.returnValue = '';
  dialogue.showModal();
  editeur.focus();
  // Curseur à la fin du texte existant.
  const plage = document.createRange();
  plage.selectNodeContents(editeur);
  plage.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(plage);
}

const devoirEnEdition = () => (etat.edition ? etat.devoirs?.find((d) => d.id === etat.edition) : null);

// Choix de la séance : les prochains cours de la matière (le premier est
// proposé), les prochains créneaux à matière variable (DS), ou une date.
function remplirRendu() {
  const n = maintenant();
  const cle = $('#ajout-matiere').value;
  const m = edt.MATIERES[cle];
  const cours = edt.prochainesOccurrences(n, (o) => o.cle === cle, 4);
  const creneaux = edt.prochainesOccurrences(n, (o) => o.nature === 'creneau', 2);
  const option = (o, prefixe = '') => `<option value="o|${o.serie}|${o.dateOrigine}">${echapper(prefixe)}${echapper(edt.majuscule(edt.quandTexte(o.debut, n)))} · ${edt.heureTexte(o.debut)}</option>`;
  let html = '';
  if (cours.length) html += `<optgroup label="Cours de ${echapper(m.nom)}">${cours.map((o) => option(o)).join('')}</optgroup>`;
  if (creneaux.length) html += `<optgroup label="Créneaux sans matière fixe">${creneaux.map((o) => option(o, `${o.titre} · `)).join('')}</optgroup>`;
  html += '<option value="date">Autre date…</option>';
  const choix = $('#ajout-rendu');
  // Modification sans changer de matière : on garde la séance actuelle,
  // même si elle n'est plus dans les prochaines.
  const devoir = devoirEnEdition();
  const garder = devoir && devoir.matiere.cle === cle;
  const actuelle = garder && devoir.seance ? `o|${devoir.serie}|${devoir.dateOrigine}` : null;
  if (actuelle && !html.includes(`value="${actuelle}"`)) {
    html = `<option value="${actuelle}">Actuel : ${echapper(edt.majuscule(edt.quandTexte(devoir.seance.debut, n)))} · ${edt.heureTexte(devoir.seance.debut)}</option>${html}`;
  }
  choix.innerHTML = html;
  choix.selectedIndex = 0;
  if (actuelle) choix.value = actuelle;
  else if (garder) choix.value = 'date';
  majDateLibre();
}

function majDateLibre() {
  const libre = $('#ajout-rendu').value === 'date';
  $('#ajout-champ-date').hidden = !libre;
  $('#ajout-date').required = libre;
}

async function enregistrerAjout() {
  const choix = $('#ajout-rendu').value;
  let serie = null;
  let dateOrigine = null;
  let pour;
  if (choix.startsWith('o|')) {
    [, serie, dateOrigine] = choix.split('|');
    pour = edt.isoLocal(edt.trouverOccurrence(serie, dateOrigine).debut);
  } else {
    pour = $('#ajout-date').value;
  }
  // Le contenu mis en forme est nettoyé ; `texte` en garde la version brute.
  const contenu = nettoyerHtml($('#ajout-texte').innerHTML);
  const edition = etat.edition;
  const devoir = {
    id: edition ?? crypto.randomUUID(),
    matiere: $('#ajout-matiere').value,
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
    await chargerDevoirs();
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
    rendre(true);
  },
  'voir-jour': (bouton) => allerAuJour(edt.dateDepuisIso(bouton.dataset.date)),
  'jour-decaler': (bouton) => allerAuJour(edt.ajouterJours(etat.jour, Number(bouton.dataset.jours))),
  'jour-aujourdhui': () => allerAuJour(maintenant()),
  ajouter: () => ouvrirAjout(),
  'fermer-detail': () => $('#detail').close(),
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
  const reporterBouton = e.target.closest('[data-reporter]');
  if (reporterBouton) {
    reporter(reporterBouton.dataset.reporter);
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
  } else if (cible.id === 'reglage-afaire') {
    etat.reglages.aFaireLe = cible.checked;
    ecrirePreference('sablio-a-faire-le', cible.checked ? '1' : '0');
  } else if (cible.id === 'ajout-matiere') {
    remplirRendu();
  } else if (cible.id === 'ajout-rendu') {
    majDateLibre();
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
  // Nettoyage : un contenu dangereux, analysé sans être exécuté.
  const piege = '<p onclick="x()">Texte <b>gras</b><script>alert(1)</script><img src="x" onerror="alert(1)"> <a href="javascript:alert(1)">lien</a> <a href="https://exemple.fr">site</a></p>';
  journaliser(`Essai nettoyage : ${nettoyerHtml(piege)}`);
  ouvrirAjout();
  $('#ajout-texte').innerHTML = '<p>Essai <strong>automatique</strong></p><ul><li>premier point</li><li>second point</li></ul>';
  const choix = $('#ajout-rendu').selectedOptions[0].textContent;
  $('#ajout form').requestSubmit($('#ajout button[value="ok"]'));
  await ajoutEnCours;
  const ajoute = etat.devoirs.find((d) => d.texte.startsWith('Essai automatique'));
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
  // Flèches gauche et droite : jour précédent ou suivant dans la vue Jour.
  const champ = e.target.closest?.('input, select, textarea, dialog');
  if (etat.vue === 'jour' && !champ && !e.altKey && !e.ctrlKey && !e.metaKey
    && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    allerAuJour(edt.ajouterJours(etat.jour, e.key === 'ArrowLeft' ? -1 : 1));
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
    reglerHorloge({ date: new Date(iso), vitesse: 0 });
  },
  modeDiscret: changerModeDiscret,
  ouvrirAjout,
  fermerAjout: () => $('#ajout').close(),
  essaisInterface,
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

function preparerDemo(reference) {
  // Devoirs et exceptions sont calculés sur l'emploi du temps sans exception :
  // un devoir de démonstration peut ainsi tomber sur le cours qui sera annulé.
  edt.definirExceptions([]);
  const exceptions = edt.exceptionsDemo(reference);
  const devoirs = edt.devoirsDemo(reference).map((d) => ({
    id: crypto.randomUUID(), ...d, texte: d.contenu ? texteBrut(d.contenu) : d.texte,
  }));
  edt.definirExceptions(exceptions);
  return devoirs;
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
      matiere: edt.MATIERES[l.matiere] ?? { cle: l.matiere, nom: l.matiere, court: '?', picto: '❔', couleur: GRIS },
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
      await chargerDevoirs();
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
    await chargerDevoirs();
    journaliser('Perte simulée : la base est vide, la sauvegarde automatique est suspendue');
    afficherDonnees();
  },
  reinitialiser: async () => {
    if (!confirm('Remplacer tous les devoirs par ceux de la démonstration, recalculés à partir d’aujourd’hui ?')) return;
    try {
      const reference = edt.debutJour(maintenant());
      const graine = preparerDemo(reference);
      await stockage.reinitialiser(graine);
      ecrirePreference(CLE_REFERENCE, edt.isoLocal(reference));
      await chargerDevoirs();
      planifierSauvegarde();
      journaliser(`Démonstration réinitialisée : ${graine.length} devoirs`);
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
  await chargerDevoirs();
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
changerProfil(parametres.get('profil') ?? etat.profil);
planifier();
demarrerStockage().catch((e) => journaliser(`Stockage : échec (${e.message})`));
requestAnimationFrame(() => api.premierRendu());
