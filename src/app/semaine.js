// Vue Semaine : une ligne par jour, séances en bandes, devoirs et progression.

import * as edt from '../emploi-du-temps.js';
import { $, appliquerStyles, couleurs, echapper, etat, maintenant, pluriel } from './commun.js';
import { affichage, devoirsDe, visible } from './discret.js';
import { badgeSemaine } from './jour.js';
import { rendre } from './rendu.js';

// --- Vue Semaine ---
// Une ligne par jour : les séances en bandes de couleur (pictogramme seul,
// le détail est dans l'infobulle et dans la vue Jour), puis les devoirs à
// rendre ce jour et leur progression. Un clic sur un jour ouvre la vue Jour.

// Le week-end, on montre directement la semaine suivante (comme MyDevoirs).
export function semaineParDefaut(n) {
  const jour = n.getDay();
  return edt.ajouterJours(edt.lundi(n), jour === 0 || jour === 6 ? 7 : 0);
}

export function allerALaSemaine(date) {
  etat.semaine = edt.lundi(date);
  etat.vue = 'semaine';
  rendre(true);
}

export function construireSemaine(n) {
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

export function ligneJourSemaine(j, n, seances, devoirs, pct) {
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
      <span class="sj-frise${edt.periodeDe(j) ? ' sans-cours' : ''}">${seances.length ? blocs : `<span class="sj-vide">${echapper(edt.periodeDe(j)?.nom ?? 'pas de cours')}</span>`}${ecart === 0 ? '<span class="sj-maintenant" data-champ="semaine-maintenant"></span>' : ''}</span>
      <span class="sj-devoirs">${droite}</span>
    </button>`;
}
