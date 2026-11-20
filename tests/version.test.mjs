// Le numéro de version affiché (src/version.js) suit celui de package.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DATE_VERSION, VERSION } from '../src/version.js';

test('même version dans src/version.js et package.json', () => {
  const paquet = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, paquet.version);
  assert.match(DATE_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});
