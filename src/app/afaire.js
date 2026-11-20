// Écran « À faire » : devoirs non faits groupés par échéance.

import * as edt from '../emploi-du-temps.js';
import { $, appliquerStyles, echapper, etat, pluriel } from './commun.js';
import { ligneAFaire, ligneDevoir } from './devoirs.js';
import { quandRendre } from './jour.js';

// --- Écran « À faire » ---
// Tous les devoirs non faits, groupés par échéance (comme la liste « À faire »
// de MyDevoirs, mais en temps relatif) ; les devoirs faits sont repliés.

export const GROUPES = [
  ['retard', 'En retard'],
  ['aujourdhui', 'Pour aujourd’hui'],
  ['demain', 'Pour demain'],
  ['semaine', 'Cette semaine'],
  ['prochaine', 'La semaine prochaine'],
  ['plus-tard', 'Plus tard'],
];

export function groupeEcheance(rendu, n) {
  const ecart = edt.ecartJours(n, rendu);
  if (ecart < 0) return 'retard';
  if (ecart === 0) return 'aujourdhui';
  if (ecart === 1) return 'demain';
  const semaines = Math.round(edt.ecartJours(edt.lundi(n), edt.lundi(rendu)) / 7);
  return semaines === 0 ? 'semaine' : semaines === 1 ? 'prochaine' : 'plus-tard';
}

export function construireAFaire(n, profil) {
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
