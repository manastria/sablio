// Dates officielles des vacances (vacances.js) : cohérence des données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VACANCES } from '../src/vacances.js';

test('chaque période a une année, une zone, un nom et des dates dans l’ordre', () => {
  for (const [annee, zone, nom, du, au] of VACANCES) {
    assert.match(annee, /^\d{4}-\d{4}$/);
    assert.ok(['A', 'B', 'C'].includes(zone));
    assert.ok(nom.length > 0);
    assert.match(du, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(du <= au, `${nom} ${zone} ${du} > ${au}`);
  }
});

test('chaque zone a ses cinq vacances par année scolaire, sans chevauchement', () => {
  for (const zone of ['A', 'B', 'C']) {
    const liste = VACANCES.filter((v) => v[1] === zone).sort((a, b) => a[3].localeCompare(b[3]));
    for (const annee of new Set(liste.map((v) => v[0]))) {
      const noms = liste.filter((v) => v[0] === annee).map((v) => v[2]);
      for (const attendu of ['Toussaint', 'Noël', 'hiver', 'printemps', 'été']) {
        assert.ok(noms.some((n) => n.includes(attendu)), `${zone} ${annee} : ${attendu}`);
      }
    }
    for (let i = 1; i < liste.length; i++) assert.ok(liste[i - 1][4] < liste[i][3], `${zone} : chevauchement`);
  }
});
