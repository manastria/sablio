// Interface : vue « Maintenant / Ensuite », frise, devoirs, panneau d'outils.

import * as edt from './emploi-du-temps.js';
import * as sauvegarde from './sauvegarde.js';
import { ouvrirStockage } from './stockage.js';

const MINUTE = 60_000;
const RAPPEL_AVANT = 5 * MINUTE;

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
  primaire: { devoirs: 2, motsLongs: true },
  college: { devoirs: 4, motsLongs: false },
  superieur: { devoirs: 8, motsLongs: false },
};

const $ = (selecteur) => document.querySelector(selecteur);
const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

const etat = {
  profil: PROFILS[lirePreference('profil', '')] ? lirePreference('profil', '') : 'college',
  devoirs: null, // chargés depuis la base (null tant qu'elle n'est pas ouverte)
  versionDevoirs: 0,
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

const couleurs = (m) => `--couleur:${m.couleur};--sur-couleur:${edt.texteSur(m.couleur)}`;
const pastille = (m) => `<span class="pastille" data-css="${couleurs(m)}">${echapper(m.court)}</span>`;

// --- Rendu ---

// Reconstruit le HTML quand la situation change de nature ; sinon, ne met à
// jour que les textes et les barres (pour garder les transitions fluides).
function rendre(forcer = false) {
  const debut = performance.now();
  const n = maintenant();
  const s = edt.situation(n);
  const profil = PROFILS[etat.profil];
  const cle = [
    s.etat, s.actuel?.id, s.suivant?.id, s.demain?.jour?.getTime(),
    edt.debutJour(n).getTime(), etat.profil, etat.versionDevoirs,
  ].join('|');
  if (forcer || cle !== cleStructure) {
    cleStructure = cle;
    construire(s, n, profil);
  }
  mettreAJour(s, n, profil);
  verifierRappels(s, n, profil);
  etat.durees.push(performance.now() - debut);
  if (etat.durees.length > 300) etat.durees.shift();
}

function construire(s, n, profil) {
  const carteMaintenant = $('#maintenant');
  const carteEnsuite = $('#ensuite');
  const couleur = s.actuel?.matiere.couleur ?? s.suivant?.matiere.couleur ?? '';
  carteMaintenant.style.setProperty('--couleur', couleur || 'var(--accent)');
  carteMaintenant.innerHTML = htmlMaintenant(s, n, profil);
  carteEnsuite.innerHTML = htmlEnsuite(s, n, profil);
  const prochain = prochainCours(s);
  carteEnsuite.style.setProperty('--couleur', prochain?.matiere.couleur ?? 'var(--accent)');
  $('#frise').innerHTML = htmlFrise(s);
  $('#devoirs').innerHTML = htmlDevoirs(n, profil);
  for (const id of ['#maintenant', '#ensuite', '#frise', '#devoirs']) appliquerStyles($(id));
}

const prochainCours = (s) => (s.etat === 'fini' ? s.demain?.cours[0] : s.suivant) ?? null;

function htmlMaintenant(s, n, profil) {
  const barre = '<div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="barre-reste"></div></div>';
  if (s.etat === 'cours') {
    const c = s.actuel;
    return `
      <p class="etiquette">${profil.motsLongs ? 'En ce moment' : 'Maintenant'}</p>
      <div class="titre-cours">${pastille(c.matiere)}<h2>${echapper(c.matiere.nom)}</h2></div>
      <p class="lieu">Salle ${echapper(c.salle)}</p>
      <p class="grand" data-champ="restant"></p>
      ${barre}
      <p class="bornes"><span>Début ${edt.heureTexte(c.debut)}</span><span>Fin ${edt.heureTexte(c.fin)}</span></p>`;
  }
  if (s.etat === 'pause' || s.etat === 'avant') {
    return `
      <p class="etiquette">${s.etat === 'avant' ? 'Avant les cours' : 'Pause'}</p>
      <div class="titre-cours"><p>${s.etat === 'avant' ? 'Premier cours' : 'Reprise'} à ${edt.heureTexte(s.suivant.debut)}</p></div>
      <p class="grand" data-champ="restant"></p>
      ${barre}
      <p class="bornes"><span>${s.precedent ? `Depuis ${edt.heureTexte(s.precedent.fin)}` : ''}</span><span>${edt.heureTexte(s.suivant.debut)}</span></p>`;
  }
  const pourDemain = (etat.devoirs ?? []).filter((d) => !d.fait && edt.ecartJours(n, d.pour) === 1).length;
  const texteDevoirs = pourDemain === 0
    ? 'Rien à faire pour demain.'
    : `${pourDemain} devoir${pourDemain > 1 ? 's' : ''} à faire pour demain.`;
  return `
    <p class="etiquette">Journée terminée</p>
    <div class="titre-cours"><p>Plus de cours aujourd’hui</p></div>
    <p class="grand grand-texte">${echapper(texteDevoirs)}</p>`;
}

function htmlEnsuite(s, n) {
  const prochain = prochainCours(s);
  if (s.etat === 'cours' && !prochain) {
    return `
      <p class="etiquette">Ensuite</p>
      <div class="titre-cours"><h2>Dernier cours de la journée</h2></div>
      <p class="detail">Fin des cours à ${edt.heureTexte(s.actuel.fin)}.</p>`;
  }
  if (!prochain) {
    return '<p class="etiquette">Ensuite</p><p class="vide">Pas de cours dans les deux semaines.</p>';
  }
  const etiquette = s.etat === 'fini'
    ? edt.majuscule(edt.jourRelatif(prochain.debut, n))
    : s.etat === 'cours' ? 'Ensuite' : 'Prochain cours';
  // Pendant un cours, on dit quand vient le suivant ; en pause, la carte
  // « Maintenant » montre déjà le temps d'attente, on donne donc l'heure.
  const enchaine = s.etat === 'cours' && prochain.debut.getTime() === s.actuel.fin.getTime();
  const quand = s.etat === 'cours'
    ? `<p class="moyen"${enchaine ? '>juste après' : ' data-champ="avant-suivant">'}</p>`
    : `<p class="moyen">${edt.heureTexte(prochain.debut)}</p>`;
  const salle = `salle ${echapper(prochain.salle)}`;
  const detail = s.etat === 'cours' ? `À ${edt.heureTexte(prochain.debut)} · ${salle}`
    : s.etat === 'fini' ? `Premier cours · ${salle}` : edt.majuscule(salle);
  return `
    <p class="etiquette">${etiquette}</p>
    <div class="titre-cours">${pastille(prochain.matiere)}<h2>${echapper(prochain.matiere.nom)}</h2></div>
    ${quand}
    <p class="detail">${detail}</p>`;
}

function bornesFrise(cours) {
  const debut = cours[0].debut.getTime() - 15 * MINUTE;
  const fin = cours.at(-1).fin.getTime() + 15 * MINUTE;
  return { debut, fin, pct: (t) => ((t - debut) / (fin - debut)) * 100 };
}

function htmlFrise(s) {
  if (!s.cours.length) {
    return '<p class="etiquette">Aujourd’hui</p><p class="vide">Pas de cours aujourd’hui.</p>';
  }
  const { debut, fin, pct } = bornesFrise(s.cours);
  const blocs = s.cours.map((c) => {
    const titre = `${c.matiere.nom}, ${edt.heureTexte(c.debut)} – ${edt.heureTexte(c.fin)}, salle ${c.salle}`;
    return `<div class="bloc" data-id="${c.id}" title="${echapper(titre)}"
      data-css="${couleurs(c.matiere)};--debut:${pct(c.debut).toFixed(3)};--largeur:${(pct(c.fin) - pct(c.debut)).toFixed(3)}">${echapper(c.matiere.court)}</div>`;
  }).join('');
  const heures = [];
  const h = new Date(debut);
  h.setMinutes(0, 0, 0);
  for (h.setHours(h.getHours() + 1); h.getTime() < fin; h.setHours(h.getHours() + 1)) {
    heures.push(`<span data-css="--position:${pct(h.getTime()).toFixed(3)}">${h.getHours()} h</span>`);
  }
  return `
    <p class="etiquette">Aujourd’hui</p>
    <div class="frise-piste">${blocs}<div class="repere" data-champ="repere"></div></div>
    <div class="graduations">${heures.join('')}</div>`;
}

function htmlDevoirs(n, profil) {
  if (!etat.devoirs) return `<p class="etiquette">Devoirs à faire</p><p class="vide">${echapper(etat.messageDevoirs ?? 'Chargement…')}</p>`;
  const tous = [...etat.devoirs].sort((a, b) => a.pour - b.pour);
  const aFaire = tous.filter((d) => !d.fait);
  const faits = tous.filter((d) => d.fait);
  const ligne = (d, coche) => {
    const proche = edt.ecartJours(n, d.pour) <= 1;
    return `<li class="devoir"><label data-css="${couleurs(d.matiere)}">
      <input type="checkbox" data-devoir="${d.id}" ${coche ? 'checked' : ''}>
      ${pastille(d.matiere)}
      <span class="texte">${echapper(d.texte)}</span>
      <span class="echeance${proche && !coche ? ' proche' : ''}">${echapper(edt.echeanceTexte(d.pour, n))}</span>
    </label></li>`;
  };
  const visibles = aFaire.slice(0, profil.devoirs);
  const caches = aFaire.length - visibles.length;
  return `
    <p class="etiquette">Devoirs à faire</p>
    ${visibles.length ? `<ul class="liste-devoirs">${visibles.map((d) => ligne(d, false)).join('')}</ul>` : '<p class="vide">Tout est fait. Bravo !</p>'}
    ${caches > 0 ? `<p class="vide">Et ${caches} autre${caches > 1 ? 's' : ''} plus tard.</p>` : ''}
    ${faits.length ? `<details class="faits"><summary>${faits.length} devoir${faits.length > 1 ? 's' : ''} fait${faits.length > 1 ? 's' : ''}</summary>
      <ul class="liste-devoirs">${faits.map((d) => ligne(d, true)).join('')}</ul></details>` : ''}`;
}

function mettreAJour(s, n, profil) {
  $('[data-champ="heure"]').textContent = edt.heureTexte(n);
  $('[data-champ="simulee"]').hidden = !horloge.simulee;
  $('[data-champ="date"]').textContent = `${edt.dateLongue(n)} · semaine ${edt.lettreSemaine(n)}`;

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
  if (repere) {
    const { pct } = bornesFrise(s.cours);
    const position = pct(n.getTime());
    repere.hidden = position < 0 || position > 100;
    repere.style.setProperty('--position', position.toFixed(3));
    for (const bloc of document.querySelectorAll('.bloc')) {
      const c = s.cours.find((x) => x.id === bloc.dataset.id);
      bloc.classList.toggle('passe', c.fin <= n);
      bloc.classList.toggle('actuel', c.debut <= n && n < c.fin);
    }
  }
}

// --- Rappels : notification système + carillon, 5 min avant chaque cours ---

function verifierRappels(s, n, profil) {
  const prochain = s.etat === 'fini' ? null : s.suivant;
  if (!prochain || etat.rappels.has(prochain.id)) return;
  const avant = prochain.debut - n;
  if (avant <= 0 || avant > RAPPEL_AVANT) return;
  etat.rappels.add(prochain.id);
  jouerCarillon();
  api.notifier(
    `Dans ${edt.dureeTexte(avant, profil.motsLongs)} : ${prochain.matiere.nom}`,
    `À ${edt.heureTexte(prochain.debut)}, salle ${prochain.salle}`,
  ).then((r) => journaliser(`Rappel ${prochain.matiere.nom} : ${r}`));
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
    'MyDevoirs – rapport du prototype',
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
  const bouton = e.target.closest('[data-action]');
  if (bouton) actions[bouton.dataset.action]?.(bouton);
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-devoir]')) {
    const id = e.target.dataset.devoir;
    const devoir = etat.devoirs?.find((d) => d.id === id);
    if (!devoir) return;
    // L'écran change tout de suite ; l'enregistrement suit.
    devoir.fait = e.target.checked;
    etat.versionDevoirs += 1;
    rendre();
    stockage.marquer(id, devoir.fait)
      .then(planifierSauvegarde)
      .catch((erreur) => journaliser(`Enregistrement : échec (${erreur.message})`));
  } else if (e.target.id === 'profil') {
    changerProfil(e.target.value);
  } else if (e.target.id === 'vitesse') {
    reglerHorloge({ vitesse: Number(e.target.value), simulee: horloge.simulee || e.target.value !== '1' });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    api.basculerPleinEcran();
  }
});

api.surFenetre(({ compact }) => {
  if (compact) document.documentElement.dataset.compact = '';
  else delete document.documentElement.dataset.compact;
});

// Accès pour les captures automatiques (main.js).
window.prototypeMyDevoirs = {
  scenario(iso, profil) {
    changerProfil(profil);
    reglerHorloge({ date: new Date(iso), vitesse: 0 });
  },
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

function graineDemo() {
  const jour = edt.debutJour(new Date());
  return edt.DEVOIRS.map((d) => ({
    id: crypto.randomUUID(),
    matiere: d.matiere,
    texte: d.texte,
    pour: edt.isoLocal(edt.ajouterJours(jour, d.dans)),
  }));
}

async function chargerDevoirs() {
  const lignes = await stockage.devoirs();
  etat.devoirs = lignes.map((l) => ({
    id: l.id,
    texte: l.texte,
    fait: Boolean(l.fait),
    pour: edt.dateDepuisIso(l.pour),
    matiere: edt.MATIERES[l.matiere] ?? { nom: l.matiere, court: '?', couleur: '#888888' },
  }));
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
  if (!(await prendreVerrou())) {
    etat.messageDevoirs = 'Les devoirs sont ouverts dans une autre fenêtre.';
    rendre(true);
    alerter('MyDevoirs est déjà ouvert dans une autre fenêtre. Fermez-la, puis cliquez sur « Réessayer ».', true);
    journaliser('Base : déjà ouverte dans une autre fenêtre');
    return;
  }
  stockage = await ouvrirStockage(graineDemo());
  const { info } = stockage;
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

demarrerStockage().catch((e) => journaliser(`Stockage : échec (${e.message})`));

// Paramètres d'adresse, pour les essais dans un navigateur :
// index.html?heure=2026-11-23T10:32&profil=primaire (heure figée).
const parametres = new URLSearchParams(location.search);
changerProfil(parametres.get('profil') ?? etat.profil);
if (parametres.get('heure')) reglerHorloge({ date: new Date(parametres.get('heure')), vitesse: 0 });
else planifier();
requestAnimationFrame(() => api.premierRendu());
