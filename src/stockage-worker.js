// Worker de stockage : SQLite compilé en WebAssembly, enregistré dans le
// stockage privé du navigateur (OPFS) grâce au VFS « opfs-sahpool ».
// Ce VFS n'a pas besoin des en-têtes COOP/COEP, impossibles à régler sur
// GitHub Pages, mais il ne fonctionne que dans un worker, et une seule
// fenêtre à la fois peut l'utiliser.

import sqlite3InitModule from './vendor/sqlite/index.mjs';

const NOM = '/mydevoirs.sqlite3';
const VERSION = 5;
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
  // 3 : contenu mis en forme (HTML nettoyé) ; `texte` garde la version brute.
  3: `
    ALTER TABLE devoir ADD COLUMN contenu TEXT;
  `,
  // 4 : l'emploi du temps est enregistré (il était écrit dans le code).
  4: `
    CREATE TABLE categorie (
      cle TEXT PRIMARY KEY,
      nature TEXT NOT NULL,
      nom TEXT NOT NULL,
      court TEXT,
      picto TEXT,
      couleur TEXT NOT NULL,
      materiel TEXT,
      confidentialite TEXT,
      garder_couleur INTEGER,
      ordre INTEGER,
      modifie_le INTEGER NOT NULL,
      supprime INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE serie (
      id TEXT PRIMARY KEY,
      categorie TEXT,
      titre TEXT,
      picto TEXT,
      salle TEXT,
      jour INTEGER NOT NULL,
      debut TEXT NOT NULL,
      fin TEXT NOT NULL,
      semaine TEXT,
      valide_du TEXT,
      valide_au TEXT,
      modifie_le INTEGER NOT NULL,
      supprime INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE exception (
      serie TEXT NOT NULL,
      date_origine TEXT NOT NULL,
      statut TEXT NOT NULL,
      motif TEXT,
      nouvelle_date TEXT,
      debut TEXT,
      fin TEXT,
      modifie_le INTEGER NOT NULL,
      supprime INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (serie, date_origine)
    );
  `,
  // 5 : l'agenda (événements datés, répétés ou non) dans la table des séries.
  5: `
    ALTER TABLE serie ADD COLUMN type TEXT;
    ALTER TABLE serie ADD COLUMN intervalle INTEGER;
    ALTER TABLE serie ADD COLUMN couleur TEXT;
    ALTER TABLE serie ADD COLUMN confidentialite TEXT;
  `,
};

// --- Emploi du temps : écriture « insérer ou remplacer » (clé = identifiant) ---

function ecrireCategorie(x) {
  db.exec({
    sql: `INSERT OR REPLACE INTO categorie (cle, nature, nom, court, picto, couleur, materiel, confidentialite,
            garder_couleur, ordre, modifie_le, supprime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    bind: [x.cle, x.nature, x.nom, x.court ?? null, x.picto ?? null, x.couleur, x.materiel ?? null,
      x.confidentialite ?? null, x.garderCouleur ? 1 : 0, x.ordre ?? 0, Date.now()],
  });
}

function ecrireSerie(x) {
  db.exec({
    sql: `INSERT OR REPLACE INTO serie (id, categorie, titre, picto, salle, jour, debut, fin, semaine,
            valide_du, valide_au, type, intervalle, couleur, confidentialite, modifie_le, supprime)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    bind: [x.id, x.cle || null, x.titre ?? null, x.picto ?? null, x.salle ?? null, x.jour, x.debut, x.fin,
      x.semaine ?? null, x.valideDu ?? null, x.valideAu ?? null, x.type ?? null, x.intervalle ?? null,
      x.couleur ?? null, x.confidentialite ?? null, Date.now()],
  });
}

function ecrireException(x) {
  db.exec({
    sql: `INSERT OR REPLACE INTO exception (serie, date_origine, statut, motif, nouvelle_date, debut, fin,
            modifie_le, supprime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    bind: [x.serie, x.dateOrigine, x.statut, x.motif ?? null, x.nouvelleDate ?? null, x.debut ?? null, x.fin ?? null, Date.now()],
  });
}

function completerEmploiDuTemps() {
  if (graineMigration && !db.selectValue('SELECT count(*) FROM categorie')) insererEmploiDuTemps(graineMigration);
}

function insererEmploiDuTemps(graine) {
  db.transaction(() => {
    for (const x of graine.categories ?? []) ecrireCategorie(x);
    for (const x of graine.series ?? []) ecrireSerie(x);
    for (const x of graine.exceptions ?? []) ecrireException(x);
  });
}

let sqlite3 = null;
// Emploi du temps de démonstration, pour une base d'une version précédente
// (ouverte ou restaurée) qui n'en a pas encore.
let graineMigration = null;
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
        sql: `INSERT INTO devoir (id, matiere, texte, contenu, pour, serie, date_origine, a_faire_le, modifie_le)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [d.id, d.matiere, d.texte, d.contenu ?? null, d.pour, d.serie ?? null, d.dateOrigine ?? null, d.aFaireLe ?? null, Date.now()],
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
    if (pool && !existait && graine) {
      inserer(graine.devoirs ?? []);
      insererEmploiDuTemps(graine);
    }
    // Base d'une version précédente : l'emploi du temps était écrit dans le
    // code ; on reprend celui de la démonstration.
    graineMigration = graine;
    if (pool && existait) completerEmploiDuTemps();
    return { mode, persistant: Boolean(pool), sqlite: sqlite3.version.libVersion, creee: !existait, nombre: compter() };
  },

  devoirs() {
    return db.selectObjects(
      `SELECT id, matiere, texte, contenu, pour, fait, serie, date_origine AS dateOrigine, a_faire_le AS aFaireLe
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

  emploiDuTemps() {
    const categories = db.selectObjects(
      `SELECT cle, nature, nom, court, picto, couleur, materiel, confidentialite, garder_couleur AS garderCouleur, ordre
       FROM categorie WHERE supprime = 0 ORDER BY ordre, nom`,
    ).map((x) => ({ ...x, garderCouleur: Boolean(x.garderCouleur) }));
    const series = db.selectObjects(
      `SELECT id, coalesce(categorie, '') AS cle, titre, picto, salle, jour, debut, fin, semaine,
              valide_du AS valideDu, valide_au AS valideAu, type, intervalle, couleur, confidentialite
       FROM serie WHERE supprime = 0 ORDER BY jour, debut`,
    );
    const exceptions = db.selectObjects(
      `SELECT serie, date_origine AS dateOrigine, statut, motif, nouvelle_date AS nouvelleDate, debut, fin
       FROM exception WHERE supprime = 0`,
    );
    return { categories, series, exceptions };
  },

  enregistrerCategorie({ categorie }) { ecrireCategorie(categorie); return true; },
  enregistrerSerie({ serie }) { ecrireSerie(serie); return true; },
  enregistrerException({ exception }) { ecrireException(exception); return true; },

  // Suppressions douces : la ligne reste, marquée, pour la fusion entre appareils.
  supprimerCategorie({ cle }) {
    db.exec({ sql: 'UPDATE categorie SET supprime = 1, modifie_le = ? WHERE cle = ?', bind: [Date.now(), cle] });
    return true;
  },
  supprimerSerie({ id }) {
    db.exec({ sql: 'UPDATE serie SET supprime = 1, modifie_le = ? WHERE id = ?', bind: [Date.now(), id] });
    return true;
  },
  supprimerException({ serie, dateOrigine }) {
    db.exec({
      sql: 'UPDATE exception SET supprime = 1, modifie_le = ? WHERE serie = ? AND date_origine = ?',
      bind: [Date.now(), serie, dateOrigine],
    });
    return true;
  },

  ajouter({ devoir }) {
    inserer([devoir]);
    return true;
  },

  modifier({ devoir: d }) {
    db.exec({
      sql: `UPDATE devoir SET matiere = ?, texte = ?, contenu = ?, pour = ?, serie = ?, date_origine = ?,
            a_faire_le = ?, modifie_le = ? WHERE id = ?`,
      bind: [d.matiere, d.texte, d.contenu ?? null, d.pour, d.serie ?? null, d.dateOrigine ?? null, d.aFaireLe ?? null, Date.now(), d.id],
    });
    return true;
  },

  // Suppression douce : la ligne reste, marquée, pour la fusion entre appareils.
  supprimer({ id }) {
    db.exec({ sql: 'UPDATE devoir SET supprime = 1, modifie_le = ? WHERE id = ?', bind: [Date.now(), id] });
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
    inserer(graine.devoirs ?? []);
    insererEmploiDuTemps(graine);
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
      completerEmploiDuTemps();
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
