// Migrations de la base : chaque version précédente doit arriver à la
// dernière sans perdre de données. SQLite de Node (node:sqlite), en mémoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, SCHEMA, VERSION, etapesDeMigration } from '../src/schema.js';

function ouvrir(db) {
  db.exec(SCHEMA);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  db.exec('BEGIN');
  for (const sql of etapesDeMigration(version)) db.exec(sql);
  db.exec('COMMIT');
}

const version = (db) => db.prepare('PRAGMA user_version').get().user_version;
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((x) => x.name);

test('chaque version a sa migration', () => {
  for (let v = 2; v <= VERSION; v++) assert.equal(typeof MIGRATIONS[v], 'string', `migration ${v}`);
});

test('une base neuve arrive à la dernière version avec toutes ses tables', () => {
  const db = new DatabaseSync(':memory:');
  ouvrir(db);
  assert.equal(version(db), VERSION);
  assert.deepEqual(tables(db), ['categorie', 'devoir', 'exception', 'periode', 'reglage', 'serie']);
});

test('une base de la version 1 garde ses devoirs cochés', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`${SCHEMA} PRAGMA user_version = 1;`);
  db.prepare("INSERT INTO devoir (id, matiere, texte, pour, fait, modifie_le) VALUES ('x', 'ma', 'Ancien', '2026-11-20', 1, 0)").run();
  ouvrir(db);
  assert.equal(version(db), VERSION);
  const d = db.prepare('SELECT texte, fait, serie, contenu FROM devoir').get();
  assert.equal(d.texte, 'Ancien');
  assert.equal(d.fait, 1);
  assert.equal(d.serie, null);
  assert.equal(d.contenu, null);
});

test('une base de la version 3 garde le rattachement de ses devoirs à leur cours', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`${SCHEMA} ${MIGRATIONS[2]} ${MIGRATIONS[3]} PRAGMA user_version = 3;`);
  db.prepare("INSERT INTO devoir (id, matiere, texte, pour, serie, date_origine, modifie_le) VALUES ('x', 'ma', 'Ex.', '2026-11-23', 's1-0855-ma', '2026-11-23', 0)").run();
  ouvrir(db);
  assert.deepEqual({ ...db.prepare('SELECT serie, date_origine FROM devoir').get() }, { serie: 's1-0855-ma', date_origine: '2026-11-23' });
});

test('rouvrir une base à jour ne change rien', () => {
  const db = new DatabaseSync(':memory:');
  ouvrir(db);
  const avant = db.prepare("SELECT count(*) AS n FROM pragma_table_info('serie')").get().n;
  ouvrir(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM pragma_table_info('serie')").get().n, avant);
  assert.equal(version(db), VERSION);
});

test('une base plus récente que l’application est refusée', () => {
  assert.throws(() => etapesDeMigration(VERSION + 1), /plus récente/);
});
