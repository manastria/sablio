// Worker de stockage : SQLite compilé en WebAssembly, enregistré dans le
// stockage privé du navigateur (OPFS) grâce au VFS « opfs-sahpool ».
// Ce VFS n'a pas besoin des en-têtes COOP/COEP, impossibles à régler sur
// GitHub Pages, mais il ne fonctionne que dans un worker, et une seule
// fenêtre à la fois peut l'utiliser.

import sqlite3InitModule from './vendor/sqlite/index.mjs';

const NOM = '/mydevoirs.sqlite3';
const VERSION = 2;
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS devoir (
    id TEXT PRIMARY KEY,
    matiere TEXT NOT NULL,
    texte TEXT NOT NULL,
    pour TEXT NOT NULL,
    fait INTEGER NOT NULL DEFAULT 0,
    modifie_le INTEGER NOT NULL,
    supprime INTEGER NOT NULL DEFAULT 0
  );
`;

// Migrations numérotées : la version du schéma est dans PRAGMA user_version.
const MIGRATIONS = {
  // 2 : le devoir suit son cours (série + date d'origine) ; jour de travail facultatif.
  2: `
    ALTER TABLE devoir ADD COLUMN serie TEXT;
    ALTER TABLE devoir ADD COLUMN date_origine TEXT;
    ALTER TABLE devoir ADD COLUMN a_faire_le TEXT;
  `,
};

let sqlite3 = null;
let pool = null;
let db = null;
let mode = '';

function ouvrirBase() {
  db = pool ? new pool.OpfsSAHPoolDb(NOM) : new sqlite3.oo1.DB(':memory:');
  db.exec(SCHEMA);
  const version = db.selectValue('PRAGMA user_version');
  if (version > VERSION) {
    db.close();
    throw new Error(`base créée par une version plus récente (schéma ${version})`);
  }
  // Une base de la version 1 a déjà user_version = 1 ; une base neuve, 0.
  db.transaction(() => {
    for (let v = Math.max(version, 1) + 1; v <= VERSION; v++) db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${VERSION}`);
  });
}

function compter() {
  return db.selectValue('SELECT count(*) FROM devoir WHERE supprime = 0');
}

function inserer(devoirs) {
  db.transaction(() => {
    for (const d of devoirs) {
      db.exec({
        sql: `INSERT INTO devoir (id, matiere, texte, pour, serie, date_origine, a_faire_le, modifie_le)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [d.id, d.matiere, d.texte, d.pour, d.serie ?? null, d.dateOrigine ?? null, d.aFaireLe ?? null, Date.now()],
      });
    }
  });
}

const operations = {
  // `graine` : devoirs de démonstration, insérés seulement à la création de la base.
  async ouvrir({ graine }) {
    sqlite3 = await sqlite3InitModule();
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({
        name: 'mydevoirs',
        directory: '.mydevoirs',
        // En cas d'échec (base déjà ouverte dans une autre fenêtre),
        // surtout ne rien effacer.
        preserveOnInitFailure: true,
      });
      mode = 'OPFS (stockage privé du navigateur)';
    } catch (e) {
      pool = null;
      mode = `mémoire seulement, rien n'est enregistré (${e.message})`;
    }
    const existait = pool ? pool.getFileNames().includes(NOM) : false;
    ouvrirBase();
    // Sans stockage, pas de démonstration : on ne montre pas des données qui seraient perdues.
    if (pool && !existait && graine?.length) inserer(graine);
    return { mode, persistant: Boolean(pool), sqlite: sqlite3.version.libVersion, creee: !existait, nombre: compter() };
  },

  devoirs() {
    return db.selectObjects(
      `SELECT id, matiere, texte, pour, fait, serie, date_origine AS dateOrigine, a_faire_le AS aFaireLe
       FROM devoir WHERE supprime = 0 ORDER BY pour, rowid`,
    );
  },

  marquer({ id, fait }) {
    db.exec({
      sql: 'UPDATE devoir SET fait = ?, modifie_le = ? WHERE id = ?',
      bind: [fait ? 1 : 0, Date.now(), id],
    });
    return true;
  },

  ajouter({ devoir }) {
    inserer([devoir]);
    return true;
  },

  // Rattache le devoir à une autre séance (report après une annulation).
  rattacher({ id, serie, dateOrigine, pour }) {
    db.exec({
      sql: 'UPDATE devoir SET serie = ?, date_origine = ?, pour = ?, modifie_le = ? WHERE id = ?',
      bind: [serie ?? null, dateOrigine ?? null, pour, Date.now(), id],
    });
    return true;
  },

  // Démonstration : efface tout et remet les devoirs fournis.
  async reinitialiser({ graine }) {
    await operations.effacer();
    inserer(graine);
    return { nombre: compter() };
  },

  exporter() {
    return pool ? pool.exportFile(NOM) : sqlite3.capi.sqlite3_js_db_export(db);
  },

  // Remplace la base par le fichier fourni. On garde une copie de la base
  // actuelle et on la remet en place si le fichier n'est pas une base valide.
  async importer({ octets }) {
    if (!pool) throw new Error('restauration impossible : la base n’est pas enregistrée');
    const entete = new TextDecoder().decode(octets.slice(0, 15));
    if (entete !== 'SQLite format 3') throw new Error('ce fichier n’est pas une sauvegarde MyDevoirs');
    const copie = pool.exportFile(NOM);
    db.close();
    try {
      await pool.importDb(NOM, octets);
      ouvrirBase();
      const verification = db.selectValue('PRAGMA integrity_check');
      if (verification !== 'ok') throw new Error(`fichier abîmé (${verification})`);
      return { nombre: compter() };
    } catch (e) {
      try { db?.close(); } catch { /* déjà fermée */ }
      await pool.importDb(NOM, copie);
      ouvrirBase();
      throw new Error(`${e.message} ; les données actuelles sont conservées`);
    }
  },

  // Pour l'essai : efface tout, puis recrée une base vide (sans démonstration).
  async effacer() {
    db.close();
    if (pool) await pool.wipeFiles();
    ouvrirBase();
    return { nombre: compter() };
  },
};

self.onmessage = async ({ data: { id, op, args } }) => {
  try {
    const resultat = await operations[op](args ?? {});
    const transfert = resultat instanceof Uint8Array ? [resultat.buffer] : [];
    self.postMessage({ id, resultat }, transfert);
  } catch (e) {
    self.postMessage({ id, erreur: e.message ?? String(e) });
  }
};
