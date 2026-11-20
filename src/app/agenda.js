// Agenda : événements datés, uniques ou répétés.

import * as edt from '../emploi-du-temps.js';
import { $, PALETTE, PICTOS, appliquerStyles, couleurs, dateMoyenne, echapper, etat, heureCourte, journaliser, maintenant, pastille, pluriel } from './commun.js';
import { discret, visible } from './discret.js';
import { planifierSauvegarde, rechargerTout, stockage } from './donnees.js';
import { affichageCategorie } from './emploi-du-temps.js';
import { adulte, bloque } from './verrou.js';

// --- Agenda : événements datés ---
// « RDV psy le mercredi 25/11 à 17 h 30, pendant 3 semaines » : une série
// de type « événement », de valideDu à valideAu, toutes les 1 ou 2 semaines.

// « mer. 25 nov. », « mer. 25 nov., 2 déc. et 9 déc. », « chaque semaine du … au … ».
export function resumeDates(dates) {
  if (!dates.length) return '';
  if (dates.length === 1) return dateMoyenne(dates[0]);
  if (dates.length <= 4) {
    const autres = dates.slice(1).map((d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
    return `${dateMoyenne(dates[0])}, ${autres.slice(0, -1).join(', ')}${autres.length > 1 ? ' et ' : ''}${autres.at(-1)}`;
  }
  return `du ${dateMoyenne(dates[0])} au ${dateMoyenne(dates.at(-1))}`;
}

export function htmlAgenda(n) {
  const aujourdhui = edt.isoLocal(n);
  const liste = edt.evenements().slice().sort((a, b) => (a.valideDu ?? '').localeCompare(b.valideDu ?? ''));
  const aVenir = liste.filter((x) => (x.valideAu ?? x.valideDu ?? '') >= aujourdhui);
  const passes = liste.filter((x) => (x.valideAu ?? x.valideDu ?? '') < aujourdhui);
  const ligne = (x) => {
    const a = affichageCategorie(edt.categorie(x.cle) ?? { nature: 'perso', nom: x.titre, picto: x.picto, couleur: x.couleur, confidentialite: x.confidentialite, garderCouleur: true }, x);
    if (a.masque) return '';
    const dates = edt.datesEvenement(x);
    const rythme = `${dates.length > 1 ? `, ${x.intervalle === 2 ? 'une semaine sur deux' : 'chaque semaine'}` : ''}${x.auteur === 'eleve' ? ' · ajouté par l’élève' : ''}`;
    const details = `${resumeDates(dates)}${rythme} · ${heureCourte(x.debut)} – ${heureCourte(x.fin)}`;
    return `<li><button type="button" class="ligne-edt" data-evenement="${x.id}" data-css="${couleurs(a)}" ${a.cache ? 'disabled title="Désactivez le mode discret pour modifier"' : ''}>
      ${pastille(a)}<span><strong>${echapper(a.nom)}</strong><span class="precision">${echapper(details)}</span></span></button></li>`;
  };
  return `${aVenir.length ? `<ul class="liste-edt">${aVenir.map(ligne).join('')}</ul>` : '<p class="vide">Aucun événement à venir.</p>'}
    ${passes.length ? `<details class="faits"><summary>${pluriel(passes.length, 'événement')} passé${passes.length > 1 ? 's' : ''}</summary>
      <ul class="liste-edt">${passes.map(ligne).join('')}</ul></details>` : ''}`;
}

export let evenementEdite = null;

export function htmlChoixPictos(nom, choisi) {
  const liste = choisi && !PICTOS.includes(choisi) ? [choisi, ...PICTOS] : PICTOS;
  return liste.map((p) => `<label class="puce-picto"><input type="radio" name="${nom}" value="${p}" ${p === choisi ? 'checked' : ''}><span>${p}</span></label>`).join('');
}

export function htmlChoixCouleurs(nom, choisie) {
  const liste = PALETTE.includes(choisie) ? PALETTE : [choisie, ...PALETTE];
  return liste.map((x) => `<label class="puce-couleur" data-css="--couleur:${x}">
    <input type="radio" name="${nom}" value="${x}" ${x === choisie ? 'checked' : ''} aria-label="Couleur ${x}"><span></span></label>`).join('');
}

// Ajouter un événement reste libre ; modifier un événement existant est verrouillé.
// Un événement créé par l'élève (sous verrou) reste modifiable sans code.
export function ouvrirEvenement(id = null, date = null) {
  const deLEleve = id && edt.evenements().find((e) => e.id === id)?.auteur === 'eleve';
  if (id && !deLEleve && bloque('Modifier un événement', () => ouvrirEvenement(id, date))) return;
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
export function serieDuFormulaire() {
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
    // Créé sous verrou, hors mode adulte : il appartient à l'élève.
    auteur: evenementEdite ? evenementEdite.auteur ?? null : etat.verrou && !adulte() ? 'eleve' : null,
  };
}

export function majChampsEvenement() {
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

export async function enregistrerEvenementFormulaire() {
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

export let evenementEnCours = Promise.resolve();
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

export async function supprimerEvenementEdite(x = evenementEdite) {
  if (!x || !confirm(`Supprimer cet événement${edt.datesEvenement(x).length > 1 ? ' et toutes ses dates' : ''} ?`)) return;
  $('#evenement').close();
  await stockage.supprimerSerie(x.id);
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Événement supprimé : ${edt.categorie(x.cle)?.nom ?? x.titre}`);
}
