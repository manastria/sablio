// Calculs de temps et d'emploi du temps (emploi-du-temps.js), sur
// l'emploi du temps de démonstration. Chaque test repart d'un état propre.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import * as edt from '../src/emploi-du-temps.js';

const d = (iso, heure = '00:00') => {
  const [h, m] = heure.split(':').map(Number);
  const x = edt.dateDepuisIso(iso);
  x.setHours(h, m, 0, 0);
  return x;
};
const cles = (iso, filtre) => edt.coursDuJour(d(iso), filtre).map((o) => o.cle || o.titre);

beforeEach(() => {
  edt.definirEmploiDuTemps({ categories: edt.DEMO_CATEGORIES, series: edt.DEMO_SERIES });
  edt.definirExceptions([]);
  edt.definirPeriodes([]);
  edt.definirCycle();
});

test('numéros de semaine ISO, y compris autour du 1er janvier', () => {
  assert.deepEqual(edt.numeroSemaine(d('2026-11-20')), { semaine: 47, annee: 2026 });
  assert.deepEqual(edt.numeroSemaine(d('2027-01-01')), { semaine: 53, annee: 2026 });
  assert.equal(edt.isoLocal(edt.lundiDeSemaine(2026, 53)), '2026-12-28');
  assert.equal(edt.lundiDeSemaine(2027, 53), null);
});

test('semaines alternées : A/B depuis la référence, puis un cycle de trois', () => {
  assert.equal(edt.lettreSemaine(d('2025-12-29')), 'A');
  assert.equal(edt.lettreSemaine(d('2026-11-23')), 'B');
  edt.definirCycle({ libelles: ['1', '2', '3'], reference: d('2026-11-23') });
  assert.deepEqual(['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'].map((x) => edt.lettreSemaine(d(x))), ['1', '2', '3', '1']);
  edt.definirCycle({ actif: false });
  assert.equal(edt.lettreSemaine(d('2026-11-23')), '');
});

test('les cours réservés à une semaine n’ont lieu que cette semaine-là', () => {
  assert.ok(cles('2026-11-23').includes('pc') && !cles('2026-11-23').includes('svt')); // semaine B
  assert.ok(cles('2026-11-30').includes('svt') && !cles('2026-11-30').includes('pc')); // semaine A
});

test('une séance annulée reste affichée mais n’a plus lieu', () => {
  edt.definirExceptions([{ serie: 's5-0800-svt', dateOrigine: '2026-11-27', statut: 'annule', motif: 'absent' }]);
  assert.ok(!cles('2026-11-27').includes('svt'));
  const svt = edt.occurrencesDuJour(d('2026-11-27')).find((o) => o.cle === 'svt');
  assert.equal(svt.statut, 'annule');
});

test('une séance déplacée part de son jour et arrive à sa nouvelle date', () => {
  edt.definirExceptions([{
    serie: 's1-1005-hg', dateOrigine: '2026-11-23', statut: 'deplace', nouvelleDate: '2026-11-24', debut: '16:35', fin: '17:30',
  }]);
  assert.equal(edt.occurrencesDuJour(d('2026-11-23')).find((o) => o.cle === 'hg').statut, 'parti');
  const arrivee = edt.occurrencesDuJour(d('2026-11-24')).find((o) => o.cle === 'hg');
  assert.equal(arrivee.statut, 'deplace');
  assert.equal(edt.heureTexte(arrivee.debut), '16 h 35');
  assert.equal(edt.trouverOccurrence('s1-1005-hg', '2026-11-23').statut, 'deplace');
});

test('Pâques et jours fériés', () => {
  assert.deepEqual([2026, 2027, 2028].map((a) => edt.isoLocal(edt.paques(a))), ['2026-04-05', '2027-03-28', '2028-04-16']);
  const f2027 = Object.fromEntries(edt.joursFeries(2027).map((f) => [f.nom, f.du]));
  assert.equal(f2027.Ascension, '2027-05-06');
  assert.equal(f2027['Lundi de Pentecôte'], '2027-05-17');
});

test('vacances : plus de cours, les activités continuent sauf celles qui s’arrêtent', () => {
  edt.definirPeriodes([{ nom: 'Vacances de Noël', du: '2026-12-19', au: '2027-01-03', nature: 'vacances' }]);
  assert.deepEqual(cles('2026-12-22'), ['psy']); // mardi : le psychologue continue
  assert.deepEqual(cles('2026-12-23'), []); // mercredi : le foot s'arrête
  assert.equal(edt.isoLocal(edt.prochainJourDeCours(d('2026-12-21'), edt.estEcole).jour), '2027-01-04');
  assert.equal(edt.periodeDe(d('2026-12-25')).nom, 'Vacances de Noël');
});

test('événements : une fois, chaque semaine, toutes les deux semaines', () => {
  const evt = (intervalle, du, au) => ({ id: `e${intervalle}`, type: 'evenement', jour: 3, cle: 'psy', debut: '17:30', fin: '18:15', valideDu: du, valideAu: au, intervalle });
  assert.equal(edt.datesEvenement(evt(null, '2026-11-25', '2026-11-25')).length, 1);
  assert.deepEqual(edt.datesEvenement(evt(2, '2026-11-25', '2026-12-23')).map(edt.isoLocal), ['2026-11-25', '2026-12-09', '2026-12-23']);
  edt.definirEmploiDuTemps({ categories: edt.DEMO_CATEGORIES, series: [evt(2, '2026-11-25', '2026-12-23')] });
  assert.deepEqual(['2026-11-25', '2026-12-02', '2026-12-09'].map((x) => cles(x).length), [1, 0, 1]);
});

test('« Aller à » : semaines, dates, jours, erreurs', () => {
  const n = d('2026-11-20', '12:00');
  const aller = (t) => edt.isoLocal(edt.interpreterSaisie(t, n));
  assert.equal(aller('48'), '2026-11-23');
  assert.equal(aller('2'), '2027-01-11'); // l'année la plus proche
  assert.equal(aller('25/12'), '2026-12-25');
  assert.equal(aller('25 décembre'), '2026-12-25');
  assert.equal(aller('1er janvier'), '2027-01-01');
  assert.equal(aller('demain'), '2026-11-21');
  assert.equal(aller('lundi'), '2026-11-23');
  assert.throws(() => aller('31/02'), /n’existe pas/);
  assert.throws(() => aller('bla'), /Non reconnu/);
});

test('temps relatif : jours, nuits, soirs, retard', () => {
  const n = d('2026-11-23', '10:00');
  assert.equal(edt.echeanceTexte(d('2026-11-24'), n), 'pour demain');
  assert.equal(edt.echeanceTexte(d('2026-11-27'), n, { nuits: true }), 'pour vendredi (dans 4 nuits)');
  assert.equal(edt.echeanceTexte(d('2026-12-01'), n), 'pour mardi 1 déc. (dans 8 jours)');
  assert.equal(edt.echeanceTexte(d('2026-11-21'), n), 'en retard de 2 jours');
  assert.equal(edt.soirsTexte(d('2026-11-26'), n), 'il te reste 3 soirs');
  assert.equal(edt.soirsTexte(d('2026-11-24'), n), 'il ne reste que ce soir');
  assert.equal(edt.semaineRelative(d('2026-12-07'), n), 'dans 2 semaines');
});

test('plages de dates', () => {
  assert.equal(edt.plageDates(d('2026-11-23'), d('2026-11-29')), '23 – 29 novembre');
  assert.equal(edt.plageDates(d('2026-11-30'), d('2026-12-06')), '30 novembre – 6 décembre');
});

test('démonstration : huit devoirs, dont un sur la séance qui sera annulée', () => {
  const reference = d('2026-11-20');
  const exceptions = edt.exceptionsDemo(reference);
  const devoirs = edt.devoirsDemo(reference);
  assert.equal(devoirs.length, 8);
  const annulee = exceptions.find((e) => e.statut === 'annule');
  assert.ok(devoirs.some((x) => x.serie === annulee.serie && x.dateOrigine === annulee.dateOrigine));
});
