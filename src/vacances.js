// Vacances scolaires de France métropolitaine, zones A, B et C.
// Source : ministère de l'Éducation nationale, jeu de données ouvert
// « fr-en-calendrier-scolaire » (data.education.gouv.fr), extrait le
// 20 novembre 2026. L'application est hors ligne : ces dates sont à mettre
// à jour chaque année (2027-2028 : rentrée pas encore publiée, été jusqu'au 31 août).
//
// `du` et `au` : premier et dernier jour sans cours, inclus (le jeu de données
// donne le jour de reprise comme fin).

export const SOURCE_VACANCES = 'data.education.gouv.fr, extrait le 20 novembre 2026';

// [année scolaire, zone, nom, du, au]
export const VACANCES = [
  ["2026-2027", "A", "Vacances de la Toussaint", "2026-10-17", "2026-11-01"],
  ["2026-2027", "B", "Vacances de la Toussaint", "2026-10-17", "2026-11-01"],
  ["2026-2027", "C", "Vacances de la Toussaint", "2026-10-17", "2026-11-01"],
  ["2026-2027", "A", "Vacances de Noël", "2026-12-19", "2027-01-03"],
  ["2026-2027", "B", "Vacances de Noël", "2026-12-19", "2027-01-03"],
  ["2026-2027", "C", "Vacances de Noël", "2026-12-19", "2027-01-03"],
  ["2026-2027", "C", "Vacances d’hiver", "2027-02-06", "2027-02-21"],
  ["2026-2027", "A", "Vacances d’hiver", "2027-02-13", "2027-02-28"],
  ["2026-2027", "B", "Vacances d’hiver", "2027-02-20", "2027-03-07"],
  ["2026-2027", "C", "Vacances de printemps", "2027-04-03", "2027-04-18"],
  ["2026-2027", "A", "Vacances de printemps", "2027-04-10", "2027-04-25"],
  ["2026-2027", "B", "Vacances de printemps", "2027-04-17", "2027-05-02"],
  ["2026-2027", "A", "Pont de l’Ascension", "2027-05-07", "2027-05-07"],
  ["2026-2027", "B", "Pont de l’Ascension", "2027-05-07", "2027-05-07"],
  ["2026-2027", "C", "Pont de l’Ascension", "2027-05-07", "2027-05-07"],
  ["2026-2027", "A", "Vacances d’été", "2027-07-03", "2027-09-01"],
  ["2026-2027", "B", "Vacances d’été", "2027-07-03", "2027-09-01"],
  ["2026-2027", "C", "Vacances d’été", "2027-07-03", "2027-09-01"],
  ["2027-2028", "A", "Vacances de la Toussaint", "2027-10-23", "2027-11-07"],
  ["2027-2028", "B", "Vacances de la Toussaint", "2027-10-23", "2027-11-07"],
  ["2027-2028", "C", "Vacances de la Toussaint", "2027-10-23", "2027-11-07"],
  ["2027-2028", "A", "Vacances de Noël", "2027-12-18", "2028-01-02"],
  ["2027-2028", "B", "Vacances de Noël", "2027-12-18", "2028-01-02"],
  ["2027-2028", "C", "Vacances de Noël", "2027-12-18", "2028-01-02"],
  ["2027-2028", "B", "Vacances d’hiver", "2028-02-05", "2028-02-20"],
  ["2027-2028", "C", "Vacances d’hiver", "2028-02-12", "2028-02-27"],
  ["2027-2028", "A", "Vacances d’hiver", "2028-02-19", "2028-03-05"],
  ["2027-2028", "B", "Vacances de printemps", "2028-04-08", "2028-04-23"],
  ["2027-2028", "C", "Vacances de printemps", "2028-04-15", "2028-05-01"],
  ["2027-2028", "A", "Vacances de printemps", "2028-04-22", "2028-05-08"],
  ["2027-2028", "A", "Pont de l’Ascension", "2028-05-25", "2028-05-28"],
  ["2027-2028", "B", "Pont de l’Ascension", "2028-05-25", "2028-05-28"],
  ["2027-2028", "C", "Pont de l’Ascension", "2028-05-25", "2028-05-28"],
  ["2027-2028", "A", "Vacances d’été", "2028-07-04", "2028-08-31"],
  ["2027-2028", "B", "Vacances d’été", "2028-07-04", "2028-08-31"],
  ["2027-2028", "C", "Vacances d’été", "2028-07-04", "2028-08-31"],
];
