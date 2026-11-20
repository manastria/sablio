// Schéma de la base Sablio : table de départ et migrations numérotées.
// La version est dans PRAGMA user_version. Partagé par le worker de stockage
// et par les tests (tests/schema.test.mjs, avec le SQLite de Node).

export const VERSION = 8;
export const SCHEMA = `
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
export const MIGRATIONS = {
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
  // 6 : réglages partagés avec l'emploi du temps (cycle de semaines…), en JSON.
  6: `
    CREATE TABLE reglage (
      cle TEXT PRIMARY KEY,
      valeur TEXT,
      modifie_le INTEGER NOT NULL,
      supprime INTEGER NOT NULL DEFAULT 0
    );
  `,
  // 7 : jours sans cours ajoutés à la main (stage, examens…) ; activités
  // qui s'arrêtent pendant les vacances.
  7: `
    CREATE TABLE periode (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      du TEXT NOT NULL,
      au TEXT NOT NULL,
      modifie_le INTEGER NOT NULL,
      supprime INTEGER NOT NULL DEFAULT 0
    );
    ALTER TABLE categorie ADD COLUMN pause_vacances INTEGER;
  `,
  // 8 : qui a créé un événement (« eleve » : créé sous verrou, modifiable sans code).
  8: `
    ALTER TABLE serie ADD COLUMN auteur TEXT;
  `,
};

// Les requêtes qui amènent une base de la version `version` à VERSION, dans
// l'ordre, la dernière fixant user_version. Une base de la version 1 a déjà
// user_version = 1 ; une base neuve, 0 (la table de départ est créée par SCHEMA).
export function etapesDeMigration(version) {
  if (version > VERSION) throw new Error(`base créée par une version plus récente (schéma ${version})`);
  const etapes = [];
  for (let v = Math.max(version, 1) + 1; v <= VERSION; v++) etapes.push(MIGRATIONS[v]);
  etapes.push(`PRAGMA user_version = ${VERSION}`);
  return etapes;
}
