// Rendu : choix de la vue, accueil « Maintenant / Ensuite », mise à jour fine
// chaque seconde, rappels (notification + carillon).

import * as edt from '../emploi-du-temps.js';
import { construireAFaire } from './afaire.js';
import * as sauvegarde from '../sauvegarde.js';
import { $, DISCRET_PAUSE, MINUTE, PROFILS, RAPPEL_AVANT, appliquerStyles, couleurs, echapper, etat, horloge, jourCourt, journaliser, lirePreference, maintenant, pastille, pluriel } from './commun.js';
import { sauvegardeEtat } from './donnees.js';
import { htmlDevoirs } from './devoirs.js';
import { affichage, discret, discretActif, visible } from './discret.js';
import { construireEdt } from './emploi-du-temps.js';
import { badgeSemaine, cleJour, construireJour } from './jour.js';
import { api, dansElectron, jouerCarillon } from './plateforme.js';
import { htmlSac } from './sac.js';
import { construireSemaine } from './semaine.js';
import { adulte, majVerrou } from './verrou.js';

export function reglerHorloge({ date = maintenant(), vitesse = horloge.vitesse, simulee = true } = {}) {
  Object.assign(horloge, { reelBase: Date.now(), simBase: date.getTime(), vitesse, simulee });
  planifier();
  rendre(true);
}
export let cleStructure = '';
export let minuteur = null;

export function planifier() {
  clearInterval(minuteur);
  const pas = horloge.vitesse > 1 ? 200 : 1000;
  document.documentElement.style.setProperty('--tick', `${horloge.vitesse === 0 ? 0 : pas}ms`);
  if (horloge.vitesse !== 0) minuteur = setInterval(() => rendre(), pas);
}
// --- Rendu ---

// Reconstruit le HTML quand la situation change de nature ; sinon, ne met à
// jour que les textes et les barres (pour garder les transitions fluides).
export function rendre(forcer = false) {
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

// Point rouge sur l'icône du menu : une action importante y attend
// (activer les rappels, reprendre la sauvegarde). « Installer » n'est pas
// signalé : Edge le propose dans tout onglet, même l'application déjà installée.
// Alertes du menu : chacune s'explique et peut être écartée. Pendant la
// démonstration, rien n'est signalé (sauvegarder un exemple n'a pas de sens).
export function majPointMenu() {
  const reelle = Boolean(etat.demo?.reelle);
  let sauvegardeAttendue = null;
  if (sauvegarde.disponible) {
    if (sauvegardeEtat.dossier && sauvegardeEtat.autorisation && sauvegardeEtat.autorisation !== 'granted') {
      sauvegardeAttendue = 'autorisation'; // vrai problème : toujours signalé
    } else if (!sauvegardeEtat.dossier && reelle && lirePreference('sablio-sans-rappel-sauvegarde', '') !== '1') {
      sauvegardeAttendue = 'dossier';
    }
  }
  const blocSauvegarde = $('#alerte-sauvegarde');
  blocSauvegarde.hidden = !sauvegardeAttendue;
  if (sauvegardeAttendue === 'autorisation') {
    $('[data-action="reprendre-sauvegarde"]').textContent = 'Reprendre la sauvegarde';
    $('#alerte-sauvegarde-texte').textContent = `Le navigateur demande de nouveau l’autorisation d’écrire dans « ${sauvegardeEtat.dossier.name} ». Sans elle, rien n’est sauvegardé.`;
  } else if (sauvegardeAttendue === 'dossier') {
    $('[data-action="reprendre-sauvegarde"]').textContent = 'Choisir un dossier de sauvegarde';
  }
  blocSauvegarde.querySelector('[data-action="sans-rappel-sauvegarde"]').hidden = sauvegardeAttendue !== 'dossier';
  const notifications = !dansElectron && 'Notification' in window && Notification.permission === 'default';
  $('#alerte-rappels').hidden = !(notifications && reelle && lirePreference('sablio-sans-rappel-notifications', '') !== '1');
  $('#reglage-notifications').hidden = !notifications;

  const attente = !blocSauvegarde.hidden || !$('#alerte-rappels').hidden;
  const point = $('[data-champ="point-menu"]');
  point.hidden = !attente;
  point.title = attente ? 'Une action vous attend dans le menu' : '';
  $('.bouton-menu').setAttribute('aria-label', attente ? 'Menu (une action vous attend)' : 'Menu');
}

export function afficherVue() {
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

export function construire(s, n, profil) {
  const carteMaintenant = $('#maintenant');
  const carteEnsuite = $('#ensuite');
  const enCours = s.actuel ?? s.suivant;
  // Jour sans cours : couleur neutre (la carte parle des vacances, pas du prochain rendez-vous).
  const sansCours = edt.periodeDe(n) && !s.cours.some(edt.estEcole) && s.etat !== 'cours';
  carteMaintenant.style.setProperty('--couleur', enCours && !sansCours ? affichage(enCours).couleur : 'var(--accent)');
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

export const prochainCours = (s) => (s.etat === 'fini' ? s.demain?.cours[0] : s.suivant) ?? null;

export function htmlMaintenant(s, n, profil) {
  // Jour sans cours (vacances, férié) : on dit quand ça reprend. Une activité
  // de la journée (le psychologue) reste dans la carte « Ensuite ».
  const sansCours = edt.periodeDe(n);
  if (sansCours && !s.cours.some(edt.estEcole) && s.etat !== 'cours') {
    const reprise = edt.prochainJourDeCours(n, edt.estEcole)?.jour;
    const dans = reprise ? edt.ecartJours(n, reprise) : 0;
    return `
      <p class="etiquette">${sansCours.nature === 'ferie' ? 'Jour férié' : sansCours.nature === 'vacances' ? 'Vacances' : 'Pas de cours'}</p>
      <div class="titre-cours"><p>${sansCours.nature === 'vacances' ? '🏖️' : '📅'} ${echapper(sansCours.nom)}</p></div>
      ${reprise ? `<p class="grand grand-texte">Reprise ${dans === 1 ? 'demain' : `dans ${dans} ${profil.nuits ? 'nuits' : 'jours'}`}</p>
      <p class="detail">${echapper(edt.majuscule(edt.dateLongue(reprise)))}</p>` : ''}`;
  }
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
  const quand = lendemain ? jourCourt(lendemain, n) : 'demain';
  const texteDevoirs = aRendre === 0
    ? `Rien à rendre pour ${quand}.`
    : `${pluriel(aRendre, 'devoir')} à rendre pour ${quand}.`;
  return `
    <p class="etiquette">Journée terminée</p>
    <div class="titre-cours"><p>Plus de cours aujourd’hui</p></div>
    <p class="grand grand-texte">${echapper(texteDevoirs)}</p>
    ${lendemain ? `<button type="button" data-action="voir-jour" data-date="${edt.isoLocal(lendemain)}">Voir la journée de ${echapper(quand)}</button>` : ''}`;
}

export function htmlEnsuite(s, n) {
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

export function bornesFrise(cours) {
  const debut = cours[0].debut.getTime() - 15 * MINUTE;
  const fin = cours.at(-1).fin.getTime() + 15 * MINUTE;
  return { debut, fin, pct: (t) => ((t - debut) / (fin - debut)) * 100 };
}

export function htmlFrise(s) {
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
// --- Mise à jour fine (chaque seconde) ---

export function mettreAJour(s, n, profil) {
  majPointMenu();
  if (etat.verrou && etat.adulteJusqua && !adulte()) {
    etat.adulteJusqua = 0;
    journaliser('Mode adulte refermé (10 minutes sans action)');
  }
  majVerrou();
  $('[data-champ="heure"]').textContent = edt.heureTexte(n);
  $('[data-champ="simulee"]').hidden = !horloge.simulee;
  // Date et semaine ne changent qu'une fois par jour : on ne réécrit que si besoin.
  const champDate = $('[data-champ="date"]');
  const date = edt.majuscule(n.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }));
  if (champDate.textContent !== date) {
    champDate.textContent = date;
    $('[data-champ="semaine"]').innerHTML = badgeSemaine(n, n, 'carre');
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

export function verifierRappels(s, n, profil) {
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
