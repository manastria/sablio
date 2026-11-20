// Vue Jour : en-tête, bande des jours, « Aller à », emploi du temps du jour,
// devoirs à rendre et travail du soir.

import * as edt from '../emploi-du-temps.js';
import { $, appliquerStyles, couleurs, dateMoyenne, echapper, etat, jourCourt, maintenant, pastille, pluriel } from './commun.js';
import { cleSeance, ligneDevoir, saisie } from './devoirs.js';
import { affichage, devoirsDe, visible } from './discret.js';
import { rendre } from './rendu.js';
import { htmlSac, jourDuSac } from './sac.js';
import { allerALaSemaine } from './semaine.js';

// --- Vue Jour ---

// Change quand la vue Jour doit être reconstruite : jour affiché, et position
// du repère « vous êtes ici » parmi les séances (pas à chaque seconde).
export function cleJour(n) {
  if (!etat.jour) return '';
  const passees = edt.memeJour(etat.jour, n)
    ? edt.occurrencesDuJour(etat.jour).map((o) => (o.fin <= n ? 2 : o.debut <= n ? 1 : 0)).join('') : '';
  return `${edt.isoLocal(etat.jour)}:${passees}`;
}

export function construireJour(n, profil) {
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
export function texteSemaine(jour, n) {
  const { semaine, annee } = edt.numeroSemaine(jour);
  const autreAnnee = annee !== n.getFullYear() ? ` de ${annee}` : '';
  const lettre = edt.lettreSemaine(jour);
  return `Semaine ${semaine}${autreAnnee}${lettre ? ` (${lettre})` : ''} · ${edt.semaineRelative(jour, n)}`;
}

// Le numéro de semaine en élément graphique : « S48 » et la lettre du cycle.
// Le texte complet (« Semaine 48 (B) · semaine prochaine ») est dans l'infobulle.
export function badgeSemaine(jour, n, variante = '') {
  const texte = texteSemaine(jour, n);
  const { semaine } = edt.numeroSemaine(jour);
  return `<span class="badge-semaine ${variante}" role="img" aria-label="${echapper(texte)}" title="${echapper(texte)}">
    <span class="bs-num"><small>${variante === 'carre' ? 'sem.' : 'S'}</small>${semaine}</span>${edt.lettreSemaine(jour) ? `<span class="bs-lettre">${echapper(edt.lettreSemaine(jour))}</span>` : ''}</span>`;
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
export function htmlBandeJours(jour, n) {
  const debut = edt.lundi(jour);
  const puces = [];
  for (let i = 0; i < 7; i++) {
    const d = edt.ajouterJours(debut, i);
    const nb = (etat.devoirs ?? []).filter((x) => !x.fait && edt.memeJour(x.rendu, d)).length;
    const classes = ['puce-jour'];
    if (edt.memeJour(d, jour)) classes.push('choisi');
    if (edt.memeJour(d, n)) classes.push('aujourdhui');
    if (!edt.coursDuJour(d, edt.estEcole).length) classes.push('libre');
    const sansCours = edt.periodeDe(d);
    if (sansCours) classes.push('sans-cours');
    const nom = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    const etiquette = `${edt.dateLongue(d)}${edt.memeJour(d, n) ? ', aujourd’hui' : ''}${sansCours ? `, ${sansCours.nom}` : ''}${nb ? `, ${pluriel(nb, 'devoir')} à rendre` : ''}`;
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

// Bandeau d'un jour sans cours : « 🏖️ Vacances de Noël, jusqu'au dimanche
// 3 janvier · reprise lundi 4 janvier ».
export function htmlBandeauSansCours(jour, n) {
  const p = edt.periodeDe(jour);
  if (!p) return '';
  const reprise = edt.prochainJourDeCours(jour, edt.estEcole)?.jour;
  const plage = p.du === p.au ? '' : `du ${dateMoyenne(edt.dateDepuisIso(p.du))} au ${dateMoyenne(edt.dateDepuisIso(p.au))}`;
  return `<p class="bandeau-sans-cours ${p.nature}">${p.nature === 'vacances' ? '🏖️' : '📅'} <strong>${echapper(p.nature === 'ferie' ? `Jour férié : ${p.nom}` : p.nom)}</strong>
    ${plage ? `<span>${echapper(plage)}</span>` : ''}${reprise ? `<span>reprise ${echapper(jourCourt(reprise, n))}</span>` : ''}</p>`;
}

export function htmlJourEdt(jour, n) {
  const liste = edt.occurrencesDuJour(jour).filter(visible);
  const titre = `<p class="etiquette">Emploi du temps</p>${htmlBandeauSansCours(jour, n)}`;
  if (!liste.length) return `${titre}${edt.periodeDe(jour) ? '' : '<p class="vide">Pas de cours ce jour.</p>'}`;
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

export function ligneSeance(o, n, ecart) {
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

export function htmlJourDevoirs(jour, n, profil) {
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

export const quandRendre = (d) => (d.seance ? d.seance.debut : d.rendu);

export function precisionRendu(d, n) {
  const o = d.seance;
  if (!o) return '';
  if (o.statut === 'deplace') return `cours déplacé à ${edt.heureTexte(o.debut)}`;
  if (o.statut === 'annule') return '';
  return o.nature === 'creneau' ? `${o.titre} de ${edt.heureTexte(o.debut)}` : `cours de ${edt.heureTexte(o.debut)}`;
}
export function allerAuJour(jour) {
  etat.jour = edt.debutJour(jour);
  etat.vue = 'jour';
  rendre(true);
}
