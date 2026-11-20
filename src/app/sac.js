// Préparer le sac : matières du jour visé et matériel, la veille ou le matin.

import * as edt from '../emploi-du-temps.js';
import { $, couleurs, echapper, etat, jourCourt, lirePreference, pastille } from './commun.js';
import { devoirsDe } from './discret.js';

// --- Préparer le sac ---
// Matières du jour (déduites de l'emploi du temps) et matériel habituel.
// Les cases cochées ne valent que pour ce jour.

export const cleSac = (jour) => `sablio-sac-${edt.isoLocal(jour)}`;

export function lireSac(jour) {
  try { return new Set(JSON.parse(lirePreference(cleSac(jour), '[]'))); } catch { return new Set(); }
}

// Le jour pour lequel on prépare le sac, vu depuis la journée `jour` :
// le prochain jour de classe (la veille au soir) ou ce jour même (le matin).
export function jourDuSac(jour) {
  if (etat.reglages.sac === 'matin') return edt.debutJour(jour);
  return edt.prochainJourDeCours(jour, edt.estEcole)?.jour ?? null;
}

export function htmlSac(jour, n, { lien: avecLien = false, depuis = null } = {}) {
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
