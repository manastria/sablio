// Code de secours (code adulte oublié) : même calcul que la page web.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeSecours, lisible, nouvelleDemande } from '../src/secours.js';

test('six chiffres, les mêmes avec ou sans espace, différents le lendemain', async () => {
  const a = await codeSecours('027133', '2026-11-20');
  assert.match(a, /^\d{6}$/);
  assert.equal(await codeSecours('027 133', '2026-11-20'), a);
  assert.notEqual(await codeSecours('027133', '2026-11-21'), a);
});

test('code de demande tiré au hasard, affiché en deux groupes', () => {
  const demande = nouvelleDemande();
  assert.match(demande, /^\d{6}$/);
  assert.match(lisible(demande), /^\d{3} \d{3}$/);
});
