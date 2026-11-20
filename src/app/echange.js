// Échanger l'emploi du temps par fichier (ergothérapeute, enseignant) :
// export, import, prénom de l'élève, emploi du temps vide.

import * as edt from '../emploi-du-temps.js';
import { $, etat, journaliser, pluriel } from './commun.js';
import { planifierSauvegarde, rechargerTout, stockage } from './donnees.js';
import { bloque } from './verrou.js';

// --- Échanger l'emploi du temps par fichier ---
// L'ergothérapeute (ou un parent) le prépare dans son Sablio, l'exporte et
// l'envoie ; la famille l'importe. Fichier JSON versionné, lisible sans
// l'application. Ni devoirs, ni séances modifiées, ni code du verrou.

export const FORMAT_EDT = 'sablio-emploi-du-temps';

export async function exportEmploiDuTemps() {
  const d = await stockage.emploiDuTemps();
  return {
    format: FORMAT_EDT,
    version: 1,
    exporteLe: new Date().toISOString(),
    categories: d.categories,
    series: d.series,
    periodes: d.periodes ?? [],
    eleve: d.reglages?.eleve?.nom || null,
    reglages: { cycle: d.reglages?.cycle ?? null, vacances: d.reglages?.vacances ?? null, eleve: d.reglages?.eleve ?? null },
  };
}

export async function exporterEmploiDuTemps() {
  if (bloque('Exporter l’emploi du temps', exporterEmploiDuTemps)) return;
  const fichier = await exportEmploiDuTemps();
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([JSON.stringify(fichier, null, 2)], { type: 'application/json' }));
  // « sablio-emploi-du-temps-leo-2026-11-20.json » : le prénom évite les confusions.
  const prenom = (fichier.eleve ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  lien.download = `sablio-emploi-du-temps-${prenom ? `${prenom}-` : ''}${edt.isoLocal(new Date())}.json`;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10_000);
  journaliser(`Emploi du temps exporté : ${fichier.categories.length} matières et activités, ${fichier.series.length} cours et événements`);
}

export function importerEmploiDuTemps() {
  if (bloque('Importer un emploi du temps', importerEmploiDuTemps)) return;
  $('#import-edt-fichier').value = '';
  $('#import-edt-fichier').click();
}

// Les matières et activités du fichier qui existent déjà sous le même nom, et
// les cours identiques (même matière, jour, heures, semaine), gardent leur
// identifiant local : pas de doublon, et les devoirs restent rattachés.
export function rapprocher(fichier) {
  const norme = (x) => `${x.nature}|${x.nom.trim().toLocaleLowerCase('fr')}`;
  const locales = new Map([...edt.matieres(), ...edt.activites()].map((c) => [norme(c), c.cle]));
  const correspondance = new Map(fichier.categories.map((c) => [c.cle, locales.get(norme(c)) ?? c.cle]));
  const empreinteSerie = (x) => [x.cle, x.titre ?? '', x.jour, x.debut, x.fin, x.semaine ?? '', x.type ?? '', x.valideDu ?? '', x.valideAu ?? ''].join('|');
  const seriesLocales = new Map(edt.series().map((x) => [empreinteSerie(x), x.id]));
  const series = fichier.series.map((x) => {
    const y = { ...x, cle: x.cle ? correspondance.get(x.cle) ?? x.cle : '' };
    return { ...y, id: seriesLocales.get(empreinteSerie(y)) ?? y.id };
  });
  return {
    categories: fichier.categories.map((c) => ({ ...c, cle: correspondance.get(c.cle) })),
    series,
    periodes: fichier.periodes ?? [],
    // En remplacement, le prénom suit le fichier (vide s'il n'en a pas).
    reglages: { ...fichier.reglages, eleve: fichier.reglages?.eleve ?? { nom: '' } },
    reconnues: [...correspondance].filter(([a, b]) => a !== b).length,
  };
}

export let importEnAttente = null;
export function proposerImport(fichier, nom) {
  if (fichier?.format !== FORMAT_EDT || fichier.version !== 1 || !Array.isArray(fichier.categories) || !Array.isArray(fichier.series)) {
    alert(`« ${nom} » n’est pas un emploi du temps Sablio.`);
    return;
  }
  importEnAttente = rapprocher(fichier);
  const cours = fichier.series.filter((x) => x.type !== 'evenement').length;
  const prepare = `${fichier.eleve ? ` (élève : ${fichier.eleve})` : ''}${fichier.exporteLe ? `, préparé le ${new Date(fichier.exporteLe).toLocaleDateString('fr-FR')}` : ''}`;
  const zone = fichier.reglages?.vacances?.zone;
  $('#import-edt-resume').textContent = `« ${nom} »${prepare} : ${pluriel(fichier.categories.filter((c) => c.nature === 'ecole').length, 'matière')}, ${pluriel(fichier.categories.filter((c) => c.nature === 'perso').length, 'activité')}, ${cours} cours, ${pluriel(fichier.series.length - cours, 'événement')}${fichier.reglages?.cycle?.actif ? `, semaines ${fichier.reglages.cycle.libelles.join('/')}` : ''}${zone ? `, vacances zone ${zone}` : ''}. ${importEnAttente.reconnues ? `${pluriel(importEnAttente.reconnues, 'matière')} déjà présente${importEnAttente.reconnues > 1 ? 's' : ''} sous le même nom.` : ''}`;
  document.querySelector('input[name="import-mode"][value="remplacer"]').checked = true;
  $('#import-edt').showModal();
}

$('#import-edt-fichier').addEventListener('change', async (e) => {
  const fichier = e.target.files?.[0];
  if (!fichier) return;
  try {
    proposerImport(JSON.parse(await fichier.text()), fichier.name);
  } catch {
    alert(`« ${fichier.name} » n’est pas un emploi du temps Sablio.`);
  }
});

export let importEnCours = Promise.resolve();
export async function appliquerImport(remplacer) {
  const donnees = importEnAttente;
  importEnAttente = null;
  try {
    await stockage.importerEmploiDuTemps(donnees, remplacer);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`Emploi du temps importé (${remplacer ? 'remplacé' : 'ajouté'}) : ${donnees.series.length} cours et événements`);
  } catch (e) {
    journaliser(`Import de l’emploi du temps : échec (${e.message})`);
  }
}
$('#import-edt form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok' || !importEnAttente) return;
  importEnCours = appliquerImport(document.querySelector('input[name="import-mode"]:checked').value === 'remplacer');
});

// Prénom de l'élève (titre, nom du fichier exporté).
export async function nommerEleve() {
  if (bloque('Changer le prénom', nommerEleve)) return;
  const nom = prompt('Prénom de l’élève (pour le titre et le nom du fichier exporté) :', etat.eleve ?? '');
  if (nom === null) return;
  await stockage.enregistrerReglage('eleve', { nom: nom.trim() });
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Prénom de l’élève : ${nom.trim() || '(aucun)'}`);
}

// Nouvel élève : on garde les matières ; cours, activités, événements,
// périodes, cycle, zone et prénom repartent de zéro.
export async function viderEmploiDuTemps(confirmer = true) {
  if (bloque('Repartir d’un emploi du temps vide', () => viderEmploiDuTemps(confirmer))) return;
  if (confirmer && !confirm('Repartir d’un emploi du temps vide ?\n\nLes matières sont gardées. Les cours, activités, événements et périodes sont retirés ; les semaines alternées et la zone de vacances reviennent aux réglages par défaut. Pensez à exporter l’emploi du temps actuel si vous voulez le garder.')) return;
  const vide = {
    categories: edt.matieres(),
    series: [],
    periodes: [],
    reglages: {
      cycle: { actif: true, libelles: edt.LIBELLES_AB, reference: edt.isoLocal(edt.REFERENCE_AB) },
      vacances: { zone: '', feries: true },
      eleve: { nom: '' },
    },
  };
  await stockage.importerEmploiDuTemps(vide, true);
  await rechargerTout();
  planifierSauvegarde();
  journaliser('Emploi du temps vidé (matières gardées)');
}
