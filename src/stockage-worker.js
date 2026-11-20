// Worker de stockage : SQLite compilé en WebAssembly, enregistré dans le
// stockage privé du navigateur (OPFS) grâce au VFS « opfs-sahpool ».
// Ce VFS n'a pas besoin des en-têtes COOP/COEP, impossibles à régler sur
// GitHub Pages, mais il ne fonctionne que dans un worker, et une seule
// fenêtre à la fois peut l'utiliser.

import sqlite3InitModule from './vendor/sqlite/index.mjs';
import { SCHEMA, VERSION, etapesDeMigration } from './schema.js';

const NOM = '/sablio.sqlite3';

// --- Emploi du temps : écriture « insérer ou remplacer » (clé = identifiant) ---

function ecrireCategorie(x) {
  db.exec({
    sql: `INSERT OR REPLACE INTO categorie (cle, nature, nom, court, picto, couleur, materiel, confidentialite,
            garder_couleur, ordre, pause_vacances, modifie_le, supprime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    bind: [x.cle, x.nature, x.nom, x.court ?? null, x.picto ?? null, x.couleur, x.materiel ?? null,
      x.confidentialite ?? null, x.garderCouleur ? 1 : 0, x.ordre ?? 0, x.pauseVacances ? 1 : 0, Date.now()],
  });
}

function ecrireSerie(x) {
  db.exec({
    sql: `INSERT OR REPLACE INTO serie (id, categorie, titre, picto, salle, jour, debut, fin, semaine,
            valide_du, valide_au, type, intervalle, couleur, confidentialite, auteur, modifie_le, supprime)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    bind: [x.id, x.cle || null, x.titre ?? null, x.picto ?? null, x.salle ?? null, x.jour, x.debut, x.fin,
      x.semaine ?? null, x.valideDu ?? null, x.valideAu ?? null, x.type ?? null, x.intervalle ?? null,
      x.couleur ?? null, x.confidentialite ?? null, x.auteur ?? null, Date.now()],
  });
}

function ecrireException(x) {
  db.exec({
    sql: `INSERT OR REPLACE INTO exception (serie, date_origine, statut, motif, nouvelle_date, debut, fin,
            modifie_le, supprime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    bind: [x.serie, x.dateOrigine, x.statut, x.motif ?? null, x.nouvelleDate ?? null, x.debut ?? null, x.fin ?? null, Date.now()],
  });
}

// Sauf si la base a été remise à zéro pour un usage réel : la démonstration
// ne doit plus revenir.
// La démonstration retient le jour sur lequel elle est calée et l'instant de
// sa création : ce qui a été modifié ensuite vient de l'utilisateur.
function ecrireReglage(cle, valeur) {
  db.exec({
    sql: 'INSERT OR REPLACE INTO reglage (cle, valeur, modifie_le, supprime) VALUES (?, ?, ?, 0)',
    bind: [cle, JSON.stringify(valeur), Date.now()],
  });
}

function marquerDemo(reference) {
  if (reference) ecrireReglage('demo', { reference, creeeLe: Date.now() });
}

function lireReglage(cle) {
  const valeur = db.selectValue('SELECT valeur FROM reglage WHERE cle = ? AND supprime = 0', [cle]);
  return valeur ? JSON.parse(valeur) : null;
}

function completerEmploiDuTemps() {
  const reelle = db.selectValue("SELECT count(*) FROM reglage WHERE cle = 'base' AND supprime = 0");
  if (graineMigration && !reelle && !db.selectValue('SELECT count(*) FROM categorie')) insererEmploiDuTemps(graineMigration);
}

function ecrirePeriode(x) {
  db.exec({
    sql: 'INSERT OR REPLACE INTO periode (id, nom, du, au, modifie_le, supprime) VALUES (?, ?, ?, ?, ?, 0)',
    bind: [x.id, x.nom, x.du, x.au, Date.now()],
  });
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
  let etapes;
  try {
    etapes = etapesDeMigration(db.selectValue('PRAGMA user_version'));
  } catch (e) {
    db.close();
    throw e;
  }
  db.transaction(() => {
    for (const sql of etapes) db.exec(sql);
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
        name: 'sablio',
        directory: '.sablio',
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
      marquerDemo(graine.reference);
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
      `SELECT cle, nature, nom, court, picto, couleur, materiel, confidentialite, garder_couleur AS garderCouleur, ordre,
              pause_vacances AS pauseVacances
       FROM categorie WHERE supprime = 0 ORDER BY ordre, nom`,
    ).map((x) => ({ ...x, garderCouleur: Boolean(x.garderCouleur), pauseVacances: Boolean(x.pauseVacances) }));
    const periodes = db.selectObjects('SELECT id, nom, du, au FROM periode WHERE supprime = 0 ORDER BY du');
    const series = db.selectObjects(
      `SELECT id, coalesce(categorie, '') AS cle, titre, picto, salle, jour, debut, fin, semaine,
              valide_du AS valideDu, valide_au AS valideAu, type, intervalle, couleur, confidentialite, auteur
       FROM serie WHERE supprime = 0 ORDER BY jour, debut`,
    );
    const exceptions = db.selectObjects(
      `SELECT serie, date_origine AS dateOrigine, statut, motif, nouvelle_date AS nouvelleDate, debut, fin
       FROM exception WHERE supprime = 0`,
    );
    const reglages = Object.fromEntries(
      db.selectObjects('SELECT cle, valeur FROM reglage WHERE supprime = 0').map((x) => [x.cle, JSON.parse(x.valeur)]),
    );
    return { categories, series, exceptions, reglages, periodes };
  },

  enregistrerPeriode({ periode }) { ecrirePeriode(periode); return true; },

  // Emploi du temps reçu d'un autre ordinateur (l'ergothérapeute le prépare
  // chez elle). « remplacer » retire ce qui n'est pas dans le fichier, sauf
  // les matières encore utilisées par des devoirs. Tout ou rien.
  importerEmploiDuTemps({ edt, remplacer }) {
    const maintenant = Date.now();
    db.transaction(() => {
      if (remplacer) {
        const garder = (liste, cle) => new Set(liste.map((x) => x[cle]));
        const categories = garder(edt.categories, 'cle');
        const utilisees = new Set(db.selectValues('SELECT DISTINCT matiere FROM devoir WHERE supprime = 0'));
        for (const cle of db.selectValues('SELECT cle FROM categorie WHERE supprime = 0')) {
          if (!categories.has(cle) && !utilisees.has(cle)) {
            db.exec({ sql: 'UPDATE categorie SET supprime = 1, modifie_le = ? WHERE cle = ?', bind: [maintenant, cle] });
          }
        }
        const series = garder(edt.series, 'id');
        for (const id of db.selectValues('SELECT id FROM serie WHERE supprime = 0')) {
          if (!series.has(id)) db.exec({ sql: 'UPDATE serie SET supprime = 1, modifie_le = ? WHERE id = ?', bind: [maintenant, id] });
        }
        const periodes = garder(edt.periodes ?? [], 'id');
        for (const id of db.selectValues('SELECT id FROM periode WHERE supprime = 0')) {
          if (!periodes.has(id)) db.exec({ sql: 'UPDATE periode SET supprime = 1, modifie_le = ? WHERE id = ?', bind: [maintenant, id] });
        }
        for (const [cle, valeur] of Object.entries(edt.reglages ?? {})) {
          if (valeur) {
            db.exec({
              sql: 'INSERT OR REPLACE INTO reglage (cle, valeur, modifie_le, supprime) VALUES (?, ?, ?, 0)',
              bind: [cle, JSON.stringify(valeur), maintenant],
            });
          }
        }
      }
      for (const x of edt.categories) ecrireCategorie(x);
      for (const x of edt.series) ecrireSerie(x);
      for (const x of edt.periodes ?? []) ecrirePeriode(x);
    });
    return true;
  },
  supprimerPeriode({ id }) {
    db.exec({ sql: 'UPDATE periode SET supprime = 1, modifie_le = ? WHERE id = ?', bind: [Date.now(), id] });
    return true;
  },

  enregistrerReglage({ cle, valeur }) {
    db.exec({
      sql: 'INSERT OR REPLACE INTO reglage (cle, valeur, modifie_le, supprime) VALUES (?, ?, ?, 0)',
      bind: [cle, JSON.stringify(valeur), Date.now()],
    });
    return true;
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
  // Usage réel : tout effacer, ne garder que les matières fournies, et marquer
  // la base pour que la démonstration ne revienne pas.
  async repartirDeZero({ matieres }) {
    await operations.effacer();
    db.transaction(() => {
      for (const x of matieres) ecrireCategorie(x);
      db.exec({
        sql: "INSERT OR REPLACE INTO reglage (cle, valeur, modifie_le, supprime) VALUES ('base', ?, ?, 0)",
        bind: [JSON.stringify({ reelle: true, depuis: new Date().toISOString() }), Date.now()],
      });
    });
    return { nombre: compter() };
  },

  async reinitialiser({ graine }) {
    await operations.effacer();
    inserer(graine.devoirs ?? []);
    insererEmploiDuTemps(graine);
    marquerDemo(graine.reference);
    return { nombre: compter() };
  },

  // La base sert-elle encore d'exemple ? A-t-on touché à l'exemple depuis sa
  // création (une ligne modifiée après) ? Une base sans marque « demo » vient
  // d'une version précédente : on la considère comme modifiée, par prudence.
  etatDemo() {
    const reelle = Boolean(lireReglage('base'));
    const demo = lireReglage('demo');
    if (reelle || !demo) return { reelle, demo: null, modifiee: true };
    const apres = demo.creeeLe + 5000;
    const touchee = ['devoir', 'categorie', 'serie', 'exception', 'periode']
      .some((table) => db.selectValue(`SELECT count(*) FROM ${table} WHERE modifie_le > ?`, [apres]))
      || db.selectValue("SELECT count(*) FROM reglage WHERE cle NOT IN ('demo', 'base') AND modifie_le > ?", [apres]);
    return { reelle, demo, modifiee: Boolean(touchee) };
  },

  // « J'ai déjà adapté l'exemple » : la base devient réelle telle quelle.
  marquerReelle() {
    db.transaction(() => {
      ecrireReglage('base', { reelle: true, depuis: new Date().toISOString() });
      db.exec({ sql: "UPDATE reglage SET supprime = 1, modifie_le = ? WHERE cle = 'demo'", bind: [Date.now()] });
    });
    return true;
  },

  exporter() {
    return pool ? pool.exportFile(NOM) : sqlite3.capi.sqlite3_js_db_export(db);
  },

  // Remplace la base par le fichier fourni. On garde une copie de la base
  // actuelle et on la remet en place si le fichier n'est pas une base valide.
  async importer({ octets }) {
    if (!pool) throw new Error('restauration impossible : la base n’est pas enregistrée');
    const entete = new TextDecoder().decode(octets.slice(0, 15));
    if (entete !== 'SQLite format 3') throw new Error('ce fichier n’est pas une sauvegarde Sablio');
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
