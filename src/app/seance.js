// Une séance : voir ses devoirs, l'annuler, la déplacer, la rétablir.

import * as edt from '../emploi-du-temps.js';
import { $, appliquerStyles, etat, journaliser, maintenant, pastille } from './commun.js';
import { ligneDevoir } from './devoirs.js';
import { affichage, devoirsDe, visible } from './discret.js';
import { planifierSauvegarde, rechargerTout, stockage } from './donnees.js';
import { rendre } from './rendu.js';
import { bloque, verrouActif } from './verrou.js';

// --- Une séance : annuler, déplacer, rétablir ---
// L'exception porte sur la séance prévue (série + date d'origine) ; les
// devoirs qui lui sont rattachés la suivent d'eux-mêmes.

export let seanceOuverte = null;
export const hhmmDe = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function ouvrirSeance(cle) {
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

export function majChampsSeance() {
  const statut = document.querySelector('input[name="seance-statut"]:checked')?.value;
  $('#seance-deplacement').hidden = statut !== 'deplace';
  $('#seance-champ-motif').hidden = statut === 'normal';
  for (const id of ['#seance-date', '#seance-debut', '#seance-fin']) $(id).required = statut === 'deplace';
}

export async function enregistrerSeance() {
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

export let seanceEnCours = Promise.resolve();
$('#seance form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  // Annuler ou déplacer une séance est verrouillé ; regarder ses devoirs ne l'est pas.
  // L'élève garde la main sur les dates de ses propres événements.
  const serieSeance = edt.series().find((x) => x.id === seanceOuverte?.serie);
  if (verrouActif() && serieSeance?.auteur !== 'eleve') {
    e.preventDefault();
    bloque('Annuler ou déplacer une séance', () => $('#seance form').requestSubmit($('#seance button[value="ok"]')));
    return;
  }
  const statut = document.querySelector('input[name="seance-statut"]:checked')?.value;
  if (statut === 'deplace' && $('#seance-fin').value <= $('#seance-debut').value) {
    e.preventDefault();
    $('#seance-erreur').textContent = 'L’heure de fin doit être après l’heure de début.';
    $('#seance-erreur').hidden = false;
    return;
  }
  seanceEnCours = enregistrerSeance();
});
