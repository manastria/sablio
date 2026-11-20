// Vacances scolaires, jours fériés et périodes sans cours ajoutées à la main.

import * as edt from '../emploi-du-temps.js';
import { SOURCE_VACANCES } from '../vacances.js';
import { $, dateMoyenne, echapper, etat, journaliser, maintenant, pastille } from './commun.js';
import { planifierSauvegarde, rechargerTout, stockage } from './donnees.js';
import { bloque } from './verrou.js';

// --- Vacances et jours sans cours ---

export function htmlVacances(n) {
  const aujourdhui = edt.isoLocal(n);
  const zone = etat.vacances?.zone;
  const resume = `${zone ? `Vacances de la zone ${zone}` : 'Pas de zone de vacances'} · ${etat.vacances?.feries ? 'jours fériés sans cours' : 'jours fériés non pris en compte'}.`;
  // Les prochaines périodes (en cours comprise) ; les jours fériés isolés à part.
  const prochaines = edt.toutesLesPeriodes().filter((p) => p.au >= aujourdhui).slice(0, 8);
  const lignes = prochaines.map((p) => {
    const debut = edt.dateDepuisIso(p.du);
    const dates = p.du === p.au ? dateMoyenne(debut) : `du ${dateMoyenne(debut)} au ${dateMoyenne(edt.dateDepuisIso(p.au))}`;
    const contenu = `<span class="pastille pastille-neutre" aria-hidden="true">${p.nature === 'vacances' ? '🏖️' : p.nature === 'ferie' ? '📅' : '📌'}</span>
      <span><strong>${echapper(p.nom)}</strong><span class="precision">${echapper(dates)}</span></span>`;
    return p.nature === 'autre'
      ? `<li><button type="button" class="ligne-edt" data-periode="${p.id}" data-css="--couleur:var(--accent)">${contenu}</button></li>`
      : `<li><span class="ligne-edt periode-fixe">${contenu}</span></li>`;
  }).join('');
  return `<p class="vide">${echapper(resume)} <button type="button" class="lien" data-action="vacances-modifier">Modifier</button></p>
    ${lignes ? `<ul class="liste-edt">${lignes}</ul>` : '<p class="vide">Aucune période à venir.</p>'}`;
}

export function ouvrirVacances() {
  if (bloque('Modifier les vacances', ouvrirVacances)) return;
  document.querySelector(`input[name="vacances-zone"][value="${etat.vacances?.zone ?? ''}"]`).checked = true;
  $('#vacances-feries').checked = etat.vacances?.feries ?? true;
  $('#vacances-source').textContent = `Dates officielles 2026-2027 et 2027-2028 (${SOURCE_VACANCES}). À mettre à jour chaque année.`;
  $('#edt-vacances').showModal();
}

export let vacancesEnCours = Promise.resolve();
$('#edt-vacances form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  const valeur = { zone: document.querySelector('input[name="vacances-zone"]:checked').value, feries: $('#vacances-feries').checked };
  vacancesEnCours = (async () => {
    await stockage.enregistrerReglage('vacances', valeur);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`Vacances : ${valeur.zone ? `zone ${valeur.zone}` : 'aucune zone'}, jours fériés ${valeur.feries ? 'sans cours' : 'ignorés'}`);
  })();
});

export let periodeEditee = null;
export function ouvrirPeriode(id = null) {
  if (bloque('Modifier les jours sans cours', () => ouvrirPeriode(id))) return;
  const p = id ? etat.periodesSaisies.find((x) => x.id === id) : null;
  periodeEditee = p;
  const n = maintenant();
  $('#periode-nom').value = p?.nom ?? '';
  $('#periode-du').value = p?.du ?? edt.isoLocal(n);
  $('#periode-au').value = p?.au ?? edt.isoLocal(n);
  $('#periode-supprimer').hidden = !p;
  $('#periode-erreur').hidden = true;
  $('#periode').showModal();
}

export let periodeEnCours = Promise.resolve();
$('#periode form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  if ($('#periode-au').value < $('#periode-du').value) {
    e.preventDefault();
    $('#periode-erreur').textContent = 'La date de fin doit être après la date de début.';
    $('#periode-erreur').hidden = false;
    return;
  }
  const periode = { id: periodeEditee?.id ?? crypto.randomUUID(), nom: $('#periode-nom').value.trim(), du: $('#periode-du').value, au: $('#periode-au').value };
  periodeEnCours = (async () => {
    await stockage.enregistrerPeriode(periode);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`Jours sans cours : ${periode.nom}, du ${periode.du} au ${periode.au}`);
  })();
});

export async function supprimerPeriodeEditee() {
  const p = periodeEditee;
  if (!p || !confirm(`Supprimer « ${p.nom} » ?`)) return;
  $('#periode').close();
  await stockage.supprimerPeriode(p.id);
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Jours sans cours supprimés : ${p.nom}`);
}
