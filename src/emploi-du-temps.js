// Données de démonstration et calculs de temps.
// Aucun accès au DOM : ce module se teste seul et pourra être repris.
//
// Vocabulaire (voir docs/modele-recurrence.md et docs/specification.md) :
// - une série est un motif qui revient (« maths, lundi 8 h 55 ») ;
// - une occurrence est une séance précise : série + date d'origine ;
// - une exception annule ou déplace une occurrence.

const MINUTE = 60_000;
const JOUR = 86_400_000;

// Lundi de référence de la semaine A (même convention que MyDevoirs).
export const REFERENCE_AB = new Date(2025, 11, 29);
export const LIBELLES_AB = ['A', 'B'];

// --- Emploi du temps ---
// Fourni par l'application (base SQLite) avec definirEmploiDuTemps() ; à défaut,
// celui de la démonstration. Une catégorie est une matière (école) ou une
// activité personnelle ; une série est un cours ou une activité qui revient.

// Matières : la même couleur et le même pictogramme pour les cours et pour
// les devoirs. `materiel` sert à « Préparer le sac ».
// Activités personnelles : jamais de devoir, et une confidentialité (visible,
// discret, masque) appliquée par le mode discret.
const cat = (cle, nature, nom, court, picto, couleur, autres = {}) => ({ cle, nature, nom, court, picto, couleur, ...autres });
export const DEMO_CATEGORIES = [
  cat('fr', 'ecole', 'Français', 'Fr', '📖', '#c8553d'),
  cat('ma', 'ecole', 'Mathématiques', 'Ma', '📐', '#2f6fbf', { materiel: 'calculatrice, équerre' }),
  cat('hg', 'ecole', 'Histoire-géographie', 'HG', '🌍', '#8a6d3b'),
  cat('an', 'ecole', 'Anglais', 'An', '💬', '#7b4fa0'),
  cat('svt', 'ecole', 'SVT', 'SVT', '🌱', '#3c8d40'),
  cat('pc', 'ecole', 'Physique-chimie', 'PC', '🧪', '#0f7f81', { materiel: 'blouse' }),
  cat('eps', 'ecole', 'EPS', 'EPS', '🏃', '#e0a100', { materiel: 'tenue de sport' }),
  cat('ap', 'ecole', 'Arts plastiques', 'AP', '🎨', '#c2457a', { materiel: 'pochette de dessin' }),
  cat('mu', 'ecole', 'Musique', 'Mu', '🎵', '#6d6aa8'),
  cat('te', 'ecole', 'Technologie', 'Te', '⚙️', '#5f7380'),
  cat('sport', 'perso', 'Football', 'Foot', '⚽', '#2e7d32', { confidentialite: 'visible', pauseVacances: true }),
  cat('psy', 'perso', 'Psychologue', 'Psy', '💭', '#c62828', { confidentialite: 'discret', garderCouleur: true }),
  cat('ortho', 'perso', 'Orthophonie', 'Ortho', '🗣️', '#d9822b', { confidentialite: 'discret', garderCouleur: false }),
  cat('piano', 'perso', 'Piano', 'Piano', '🎹', '#3949ab', { confidentialite: 'visible', pauseVacances: true }),
].map((c, ordre) => ({ ...c, ordre }));

// Semaine type d'un collégien. Clé : jour au sens de Date.getDay() (1 = lundi).
// `cle` vide : créneau à matière variable (le DS du mercredi).
// `semaine` : seulement en semaine A ou B.
const c = (debut, fin, cle, salle, semaine) => ({ debut, fin, cle, salle, semaine });
const SEMAINE_TYPE = {
  1: [
    c('08:00', '08:55', 'fr', 'B12'),
    c('08:55', '09:50', 'ma', 'B05'),
    c('10:05', '11:00', 'hg', 'C21'),
    c('11:00', '11:55', 'an', 'B14'),
    c('13:30', '14:25', 'svt', 'Labo 2', 'A'),
    c('13:30', '14:25', 'pc', 'Labo 1', 'B'),
    c('14:25', '16:20', 'eps', 'Gymnase'),
  ],
  2: [
    c('08:00', '09:50', 'te', 'Atelier'),
    c('10:05', '11:00', 'ma', 'B05'),
    c('11:00', '11:55', 'fr', 'B12'),
    c('13:30', '14:25', 'an', 'B14'),
    c('14:25', '15:20', 'mu', 'Musique'),
    c('17:30', '18:15', 'psy', 'Cabinet du Dr Martin'),
  ],
  3: [
    c('08:00', '08:55', 'ma', 'B05'),
    c('08:55', '09:50', 'fr', 'B12'),
    { ...c('10:05', '11:55', '', '104'), titre: 'DS', picto: '📝' },
    c('14:00', '16:00', 'sport', 'Stade municipal'),
  ],
  4: [
    c('08:00', '08:55', 'an', 'B14'),
    c('08:55', '09:50', 'hg', 'C21'),
    c('10:05', '11:00', 'fr', 'B12'),
    c('11:00', '11:55', 'ma', 'B05'),
    c('13:30', '15:20', 'eps', 'Gymnase'),
    c('15:35', '16:30', 'pc', 'Labo 1'),
    c('17:30', '18:30', 'piano', 'Conservatoire'),
  ],
  5: [
    c('08:00', '08:55', 'svt', 'Labo 2'),
    c('08:55', '09:50', 'ma', 'B05'),
    c('10:05', '11:00', 'fr', 'B12'),
    c('11:00', '11:55', 'hg', 'C21'),
    c('13:30', '14:25', 'an', 'B14'),
    c('14:30', '15:15', 'ortho', 'Cabinet d’orthophonie'),
    c('15:35', '16:30', 'ap', 'Arts'),
  ],
};

// Identifiant d'une série de démonstration : jour, heure, matière. Les séries
// créées ensuite ont un UUID.
export const DEMO_SERIES = Object.entries(SEMAINE_TYPE).flatMap(([jour, liste]) => liste.map((x) => ({
  id: `s${jour}-${x.debut.replace(':', '')}-${x.cle || 'creneau'}`,
  jour: Number(jour),
  cle: x.cle,
  titre: x.titre ?? null,
  picto: x.picto ?? null,
  salle: x.salle,
  debut: x.debut,
  fin: x.fin,
  semaine: x.semaine ?? null,
  valideDu: null,
  valideAu: null,
})));

let categories = new Map();
let seriesParJour = new Map();
let toutesLesSeries = [];

export function definirEmploiDuTemps({ categories: listeCategories, series }) {
  categories = new Map(listeCategories.map((x) => [x.cle, x]));
  toutesLesSeries = series;
  seriesParJour = new Map();
  for (const x of series) {
    if (!seriesParJour.has(x.jour)) seriesParJour.set(x.jour, []);
    seriesParJour.get(x.jour).push(x);
  }
}
definirEmploiDuTemps({ categories: DEMO_CATEGORIES, series: DEMO_SERIES });

export function categorie(cle) {
  return categories.get(cle) ?? null;
}

const parOrdre = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr');
export const matieres = () => [...categories.values()].filter((x) => x.nature === 'ecole').sort(parOrdre);
export const activites = () => [...categories.values()].filter((x) => x.nature === 'perso').sort(parOrdre);
export const series = () => toutesLesSeries;
// La semaine type (cours, créneaux, activités régulières) et l'agenda
// (événements datés, uniques ou répétés quelques semaines).
export const semaineType = () => toutesLesSeries.filter((x) => x.type !== 'evenement');
export const evenements = () => toutesLesSeries.filter((x) => x.type === 'evenement');

// Un événement à titre libre (« Dentiste ») porte lui-même ce qu'une
// catégorie donnerait : nom, pictogramme, couleur, confidentialité.
function categorieDeSerie(serie) {
  const c = categorie(serie.cle);
  if (c || serie.type !== 'evenement') return c;
  return {
    cle: '', nature: 'perso', nom: serie.titre || 'Événement', court: serie.titre || 'Événement',
    picto: serie.picto || '📌', couleur: serie.couleur || '#5f7380',
    confidentialite: serie.confidentialite || 'visible', garderCouleur: true,
  };
}

// Dates d'un événement répété : de valideDu à valideAu, toutes les `intervalle` semaines.
export function datesEvenement(serie, limite = 60) {
  if (!serie.valideDu) return [];
  const fin = serie.valideAu ? dateDepuisIso(serie.valideAu) : dateDepuisIso(serie.valideDu);
  const dates = [];
  for (let d = dateDepuisIso(serie.valideDu); d <= fin && dates.length < limite; d = ajouterJours(d, 7 * (serie.intervalle || 1))) {
    dates.push(d);
  }
  return dates;
}

// --- Dates ---

export function debutJour(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// setDate gère les changements d'heure, contrairement à l'ajout de 24 h.
export function ajouterJours(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function lundi(date) {
  const d = debutJour(date);
  return ajouterJours(d, -((d.getDay() + 6) % 7));
}

export function ecartJours(a, b) {
  return Math.round((debutJour(b) - debutJour(a)) / JOUR);
}

export const memeJour = (a, b) => ecartJours(a, b) === 0;

// Numéro de semaine ISO 8601 (celui des agendas et de MyDevoirs) et son année,
// qui peut différer de l'année civile autour du 1er janvier.
export function numeroSemaine(date) {
  const jeudi = ajouterJours(lundi(date), 3); // le jeudi décide de l'année
  const annee = jeudi.getFullYear();
  const premierJeudi = ajouterJours(lundi(new Date(annee, 0, 4)), 3);
  return { semaine: Math.round((jeudi - premierJeudi) / (7 * JOUR)) + 1, annee };
}

// Lundi de la semaine ISO `semaine` de `annee` ; null si elle n'existe pas.
export function lundiDeSemaine(annee, semaine) {
  const resultat = ajouterJours(lundi(new Date(annee, 0, 4)), (semaine - 1) * 7);
  const n = numeroSemaine(resultat);
  return n.semaine === semaine && n.annee === annee ? resultat : null;
}

// Comme MyDevoirs : « cette semaine », « semaine prochaine », « dans 3 semaines »…
export function semaineRelative(date, maintenant) {
  const ecart = Math.round((lundi(date) - lundi(maintenant)) / (7 * JOUR));
  if (ecart === 0) return 'cette semaine';
  if (ecart === 1) return 'semaine prochaine';
  if (ecart === -1) return 'semaine dernière';
  return ecart > 1 ? `dans ${ecart} semaines` : `il y a ${-ecart} semaines`;
}

// Cycle de semaines (A/B, ou 1/2/3…) : la semaine de `reference` porte le
// premier libellé. Désactivé, il n'y a pas de lettre et les cours réservés
// à une semaine ont lieu toutes les semaines.
let cycle = { actif: true, libelles: LIBELLES_AB, reference: REFERENCE_AB };

export function definirCycle({ actif = true, libelles = LIBELLES_AB, reference = REFERENCE_AB } = {}) {
  cycle = { actif: Boolean(actif) && libelles.length > 0, libelles, reference: lundi(reference) };
}
export const cycleActuel = () => cycle;

export function lettreSemaine(date, reference = cycle.reference, libelles = cycle.libelles) {
  if (!cycle.actif) return '';
  const semaines = Math.round((lundi(date) - lundi(reference)) / (7 * JOUR));
  const n = libelles.length;
  return libelles[((semaines % n) + n) % n];
}

function aHeure(jour, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = debutJour(jour);
  d.setHours(h, m, 0, 0);
  return d;
}

const hhmm = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export function isoLocal(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// « 2026-11-23 » -> minuit, heure locale (new Date("2026-11-23") serait en UTC).
export function dateDepuisIso(texte) {
  const [a, m, j] = texte.split('-').map(Number);
  return new Date(a, m - 1, j);
}

// --- Jours sans cours : vacances, jours fériés, périodes ajoutées ---
// { nom, du, au (AAAA-MM-JJ, inclus), nature: 'vacances' | 'ferie' | 'autre' }
// Ces jours-là, les cours n'ont pas lieu ; les événements de l'agenda, si ;
// les activités aussi, sauf celles qui s'arrêtent pendant les vacances.

let periodes = [];

export function definirPeriodes(liste) {
  periodes = [...liste].sort((a, b) => a.du.localeCompare(b.du));
}
export const toutesLesPeriodes = () => periodes;

export function periodeDe(date) {
  const d = isoLocal(date);
  return periodes.find((p) => p.du <= d && d <= p.au) ?? null;
}

// Dimanche de Pâques (algorithme de Meeus, Jones et Butcher).
export function paques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(annee, mois - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

export function joursFeries(annee) {
  const p = paques(annee);
  const f = (nom, d) => ({ nom, du: isoLocal(d), au: isoLocal(d), nature: 'ferie' });
  return [
    f('Jour de l’an', new Date(annee, 0, 1)),
    f('Lundi de Pâques', ajouterJours(p, 1)),
    f('Fête du Travail', new Date(annee, 4, 1)),
    f('Victoire de 1945', new Date(annee, 4, 8)),
    f('Ascension', ajouterJours(p, 39)),
    f('Lundi de Pentecôte', ajouterJours(p, 50)),
    f('Fête nationale', new Date(annee, 6, 14)),
    f('Assomption', new Date(annee, 7, 15)),
    f('Toussaint', new Date(annee, 10, 1)),
    f('Armistice de 1918', new Date(annee, 10, 11)),
    f('Noël', new Date(annee, 11, 25)),
  ];
}

// --- Exceptions ---
// { serie, dateOrigine (AAAA-MM-JJ), statut: 'annule' | 'deplace', motif,
//   nouvelleDate, debut, fin (pour un déplacement) }

let exceptions = [];

export function definirExceptions(liste) {
  exceptions = liste;
}

const exceptionDe = (serie, dateOrigine) =>
  exceptions.find((e) => e.serie === serie && e.dateOrigine === dateOrigine);

// --- Occurrences ---

function occurrence(serie, jour) {
  const cat = categorieDeSerie(serie);
  const dateOrigine = isoLocal(jour);
  return {
    id: `${serie.id}@${dateOrigine}`,
    serie: serie.id,
    dateOrigine,
    cle: serie.cle,
    categorie: cat,
    nature: cat?.nature ?? 'creneau',
    titre: serie.titre ?? cat?.nom ?? '',
    picto: serie.picto ?? cat?.picto ?? '',
    salle: serie.salle,
    type: serie.type ?? 'cours',
    debut: aHeure(jour, serie.debut),
    fin: aHeure(jour, serie.fin),
    statut: 'normal',
  };
}

function occurrencesDuMotif(jour) {
  const lettre = lettreSemaine(jour);
  const date = isoLocal(jour);
  const sansCours = periodeDe(jour);
  return (seriesParJour.get(jour.getDay()) ?? [])
    .filter((x) => !sansCours || x.type === 'evenement'
      || (categorie(x.cle)?.nature === 'perso' && !categorie(x.cle).pauseVacances))
    .filter((x) => (!x.semaine || !lettre || x.semaine === lettre)
      && (!x.valideDu || x.valideDu <= date) && (!x.valideAu || date <= x.valideAu)
      // Toutes les N semaines, à compter de la première date.
      && (!(x.intervalle > 1) || !x.valideDu
        || Math.round((lundi(jour) - lundi(dateDepuisIso(x.valideDu))) / (7 * JOUR)) % x.intervalle === 0))
    .map((x) => occurrence(x, jour));
}

function appliquerException(o) {
  const e = exceptionDe(o.serie, o.dateOrigine);
  if (!e) return o;
  if (e.statut === 'annule') return { ...o, statut: 'annule', motif: e.motif };
  // Déplacé : l'occurrence vit à sa nouvelle place ; on garde l'ancienne pour l'affichage.
  const jour = dateDepuisIso(e.nouvelleDate);
  return {
    ...o,
    statut: 'deplace',
    motif: e.motif,
    origine: { debut: o.debut, fin: o.fin },
    debut: aHeure(jour, e.debut ?? hhmm(o.debut)),
    fin: aHeure(jour, e.fin ?? hhmm(o.fin)),
  };
}

// Tout ce qui concerne ce jour, pour l'affichage : séances normales, annulées,
// déplacées vers ce jour, et séances parties ailleurs (statut 'parti').
export function occurrencesDuJour(jour) {
  const liste = [];
  for (const o of occurrencesDuMotif(jour)) {
    const r = appliquerException(o);
    if (r.statut === 'deplace' && !memeJour(r.debut, jour)) {
      liste.push({ ...o, statut: 'parti', motif: r.motif, versDebut: r.debut, id: `${o.id}#parti` });
    } else {
      liste.push(r);
    }
  }
  for (const e of exceptions) {
    if (e.statut !== 'deplace' || e.nouvelleDate !== isoLocal(jour) || e.dateOrigine === e.nouvelleDate) continue;
    const o = trouverOccurrence(e.serie, e.dateOrigine);
    if (o) liste.push(o);
  }
  return liste.sort((a, b) => a.debut - b.debut);
}

// Séances qui ont vraiment lieu ce jour (ni annulées, ni parties ailleurs).
export function coursDuJour(jour, filtre = () => true) {
  return occurrencesDuJour(jour).filter((o) => (o.statut === 'normal' || o.statut === 'deplace') && filtre(o));
}

// L'occurrence d'une série à une date d'origine, exceptions appliquées.
export function trouverOccurrence(serie, dateOrigine) {
  const jour = dateDepuisIso(dateOrigine);
  const o = occurrencesDuMotif(jour).find((x) => x.serie === serie);
  return o ? appliquerException(o) : null;
}

// Les `nombre` prochaines séances qui ont lieu après `apres` et passent le filtre.
export function prochainesOccurrences(apres, filtre, nombre = 1, limiteJours = 35) {
  const resultat = [];
  for (let i = 0; i <= limiteJours && resultat.length < nombre; i++) {
    const jour = ajouterJours(debutJour(apres), i);
    for (const o of coursDuJour(jour, filtre)) {
      if (o.debut > apres && resultat.length < nombre) resultat.push(o);
    }
  }
  return resultat;
}

export const estEcole = (o) => o.nature !== 'perso';

// Limite : au-delà des grandes vacances.
export function prochainJourDeCours(apres, filtre = () => true, limite = 75) {
  for (let i = 1; i <= limite; i++) {
    const jour = ajouterJours(debutJour(apres), i);
    const cours = coursDuJour(jour, filtre);
    if (cours.some(estEcole)) return { jour, cours };
  }
  return null;
}

// Heures de classe du jour : du début du premier cours à la fin du dernier.
export function heuresDeClasse(jour) {
  const cours = coursDuJour(jour, estEcole);
  return cours.length ? { debut: cours[0].debut, fin: cours.reduce((m, o) => (o.fin > m ? o.fin : m), cours[0].fin) } : null;
}

const borner = (x) => Math.min(1, Math.max(0, x));

// Où en est-on de la journée ? Quatre états : avant, cours, pause, fini.
// `fraction` est la part de temps qui reste (1 = tout, 0 = c'est l'heure).
export function situation(maintenant, filtre = () => true) {
  const cours = coursDuJour(maintenant, filtre);
  const actuel = cours.find((o) => o.debut <= maintenant && maintenant < o.fin);
  if (actuel) {
    return {
      etat: 'cours',
      cours,
      actuel,
      suivant: cours.find((o) => o.debut >= actuel.fin) ?? null,
      restant: actuel.fin - maintenant,
      fraction: borner((actuel.fin - maintenant) / (actuel.fin - actuel.debut)),
    };
  }
  const suivant = cours.find((o) => o.debut > maintenant);
  if (suivant) {
    const precedent = cours.findLast((o) => o.fin <= maintenant) ?? null;
    // Avant le premier cours, la barre couvre l'heure qui précède.
    const depart = precedent ? precedent.fin : new Date(suivant.debut - 60 * MINUTE);
    return {
      etat: precedent ? 'pause' : 'avant',
      cours,
      precedent,
      suivant,
      restant: suivant.debut - maintenant,
      fraction: borner((suivant.debut - maintenant) / (suivant.debut - depart)),
    };
  }
  return { etat: 'fini', cours, demain: prochainJourDeCours(maintenant, filtre) };
}

// --- Démonstration ---

// Exceptions et devoirs de démonstration, calculés à partir d'un jour de
// référence pour tomber dans les jours qui suivent.
// Un rendez-vous ponctuel dans l'agenda : dentiste, le mercredi suivant.
export function evenementsDemo(reference) {
  const mercredi = ajouterJours(lundi(ajouterJours(reference, 7)), 2);
  return [{
    id: 'e-dentiste', type: 'evenement', jour: 3, cle: '', titre: 'Dentiste', picto: '🦷', couleur: '#00838f',
    confidentialite: 'visible', salle: 'Cabinet dentaire', debut: '16:30', fin: '17:15', semaine: null,
    valideDu: isoLocal(mercredi), valideAu: isoLocal(mercredi), intervalle: null,
  }];
}

export function exceptionsDemo(reference) {
  const liste = [];
  const [svt] = prochainesOccurrences(debutJour(ajouterJours(reference, 1)), (o) => o.cle === 'svt');
  if (svt) liste.push({ serie: svt.serie, dateOrigine: svt.dateOrigine, statut: 'annule', motif: 'professeur absent' });
  const [hg] = prochainesOccurrences(debutJour(ajouterJours(reference, 1)), (o) => o.cle === 'hg');
  if (hg) {
    const cible = prochainJourDeCours(hg.debut);
    if (cible) {
      liste.push({
        serie: hg.serie, dateOrigine: hg.dateOrigine, statut: 'deplace', motif: 'sortie au musée',
        nouvelleDate: isoLocal(cible.jour), debut: '16:35', fin: '17:30',
      });
    }
  }
  return liste;
}

const CONSIGNE_FRANCAIS = `<p><strong>Lire le chapitre 3</strong> de <em>Vendredi ou la vie sauvage</em> (p. 45 à 62).</p>
<p>Pendant la lecture :</p>
<ul>
  <li>relever <u>au moins cinq mots</u> que vous ne connaissez pas et chercher leur sens dans le dictionnaire ;</li>
  <li>noter sur une fiche les étapes de la construction du radeau.</li>
</ul>
<p>Puis répondre aux questions 1 à 4 p. 63, <strong>en faisant des phrases complètes</strong>.</p>
<ol>
  <li>Pourquoi Robinson veut-il quitter l’île ?</li>
  <li>Quels outils utilise-t-il ?</li>
  <li>Que se passe-t-il au moment de la mise à l’eau ?</li>
  <li>Que ressent-il à la fin du chapitre ? Justifiez avec une citation.</li>
</ol>
<p>Le questionnaire sera ramassé et noté. Les fiches de vocabulaire sont sur <a href="https://exemple.fr/vocabulaire">la page de la classe</a>.</p>`;

export function devoirsDemo(reference) {
  const apres = debutJour(ajouterJours(reference, 1));
  const prochain = (filtre, rang = 0) => prochainesOccurrences(apres, filtre, rang + 1)[rang] ?? null;
  const parMatiere = (cle) => (o) => o.cle === cle;
  const liste = [
    { matiere: 'ma', texte: 'Exercices 12 et 13 p. 84', occ: prochain(parMatiere('ma')) },
    // Texte long et mis en forme, comme le donne un professeur sur l'ENT.
    { matiere: 'fr', texte: 'Lire le chapitre 3 du roman', contenu: CONSIGNE_FRANCAIS, occ: prochain(parMatiere('fr'), 1) },
    { matiere: 'an', texte: 'Apprendre le vocabulaire de l’unité 4', occ: prochain(parMatiere('an')) },
    { matiere: 'ma', texte: 'Réviser les fractions', occ: prochain((o) => o.nature === 'creneau') },
    { matiere: 'svt', texte: 'Finir le schéma du cœur', occ: prochain(parMatiere('svt')) },
    { matiere: 'hg', texte: 'Apprendre la leçon sur la Révolution', occ: prochain(parMatiere('hg')) },
    // Pour jeudi, à faire mardi : le mercredi après-midi est pris par le sport.
    { matiere: 'pc', texte: 'Exercice 5 p. 112', occ: prochain((o) => o.cle === 'pc' && o.debut.getDay() === 4), avant: 2 },
    { matiere: 'te', texte: 'Rapporter une boîte en carton', occ: prochain(parMatiere('te'), 1) },
  ];
  return liste.filter((d) => d.occ).map((d) => {
    const rendu = debutJour(d.occ.debut);
    const aFaire = d.avant ? ajouterJours(rendu, -d.avant) : null;
    return {
      matiere: d.matiere,
      texte: d.texte,
      contenu: d.contenu ?? null,
      serie: d.occ.serie,
      dateOrigine: d.occ.dateOrigine,
      pour: isoLocal(rendu),
      aFaireLe: aFaire && aFaire >= debutJour(reference) ? isoLocal(aFaire) : null,
    };
  });
}

// --- Aller à une date ---

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const sansAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Parmi l'année d'avant, celle-ci et la suivante, la date la plus proche
// d'aujourd'hui : « 2/1 » tapé en décembre veut dire janvier prochain.
function plusProche(fabriquer, maintenant) {
  const annee = maintenant.getFullYear();
  return [annee - 1, annee, annee + 1]
    .map(fabriquer)
    .filter(Boolean)
    .sort((a, b) => Math.abs(a - maintenant) - Math.abs(b - maintenant))[0] ?? null;
}

function dateValide(annee, mois, jour) {
  const d = new Date(annee, mois - 1, jour);
  return d.getFullYear() === annee && d.getMonth() === mois - 1 && d.getDate() === jour ? d : null;
}

const annee4 = (a) => (a < 100 ? 2000 + a : a);
const ANNEE_MIN = 1900;
const ANNEE_MAX = 2100;

// Date visée par le champ « Aller à » ; lève une erreur au message lisible.
// Formats : semaine (`48`, `s48`, `semaine 48`, `48/2027`), date (`25/12`,
// `25/12/2026`, `2026-12-25`, `25 décembre`), jour (`aujourd'hui`, `demain`,
// `après-demain`, `hier`, `lundi` = le prochain lundi).
export function interpreterSaisie(texte, maintenant) {
  const t = sansAccents(String(texte).trim().toLowerCase()).replace(/[’']/g, '').replace(/\s+/g, ' ');
  const aujourdhui = debutJour(maintenant);
  if (!t) throw new Error('Tapez un numéro de semaine, une date ou un jour.');
  const relatifs = { aujourdhui: 0, auj: 0, demain: 1, 'apres-demain': 2, 'apres demain': 2, hier: -1 };
  if (t in relatifs) return ajouterJours(aujourdhui, relatifs[t]);
  const jourSemaine = JOURS.findIndex((j) => j === t);
  if (jourSemaine >= 0) return ajouterJours(aujourdhui, ((jourSemaine - aujourdhui.getDay() + 6) % 7) + 1);

  const borner = (a) => {
    if (a < ANNEE_MIN || a > ANNEE_MAX) throw new Error(`Année entre ${ANNEE_MIN} et ${ANNEE_MAX}.`);
    return a;
  };
  let m = t.match(/^(?:s|sem|semaine)? ?(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const n = Number(m[1]);
    if (m[2]) {
      const lundiVise = lundiDeSemaine(borner(Number(m[2])), n);
      if (!lundiVise) throw new Error(`${m[2]} n’a pas de semaine ${n}.`);
      return lundiVise;
    }
    const lundiVise = plusProche((a) => lundiDeSemaine(a, n), aujourdhui);
    if (!lundiVise) throw new Error(`Il n’y a pas de semaine ${n}.`);
    return lundiVise;
  }
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (m) {
    const [jour, mois] = [Number(m[1]), Number(m[2])];
    const d = m[3] ? dateValide(borner(annee4(Number(m[3]))), mois, jour) : plusProche((a) => dateValide(a, mois, jour), aujourdhui);
    if (!d) throw new Error(`Le ${jour}/${mois} n’existe pas.`);
    return d;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = dateValide(borner(Number(m[1])), Number(m[2]), Number(m[3]));
    if (!d) throw new Error('Cette date n’existe pas.');
    return d;
  }
  m = t.match(/^(?:[a-z]+ )?(\d{1,2}|1er) ([a-z]+)\.?(?: (\d{4}))?$/);
  if (m) {
    const mois = MOIS.findIndex((nom) => m[2].length >= 3 && sansAccents(nom).startsWith(m[2])) + 1;
    if (mois) {
      const jour = m[1] === '1er' ? 1 : Number(m[1]);
      const d = m[3] ? dateValide(borner(Number(m[3])), mois, jour) : plusProche((a) => dateValide(a, mois, jour), aujourdhui);
      if (!d) throw new Error(`Le ${jour} ${MOIS[mois - 1]} n’existe pas.`);
      return d;
    }
  }
  throw new Error('Non reconnu. Exemples : 48, 25/12, 25 décembre, demain, lundi.');
}

// --- Textes ---

export function heureTexte(date) {
  return `${date.getHours()} h ${String(date.getMinutes()).padStart(2, '0')}`;
}

// Arrondi à la minute supérieure : « encore 1 min » jusqu'à la fin.
export function dureeTexte(ms, motsLongs = false) {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  if (minutes < 60) {
    if (!motsLongs) return `${minutes} min`;
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function dateLongue(date) {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function jourRelatif(date, maintenant) {
  const n = ecartJours(maintenant, date);
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  if (n === 2) return 'après-demain';
  if (n === -1) return 'hier';
  return JOURS[date.getDay()];
}

// « dans 3 jours », ou « dans 3 nuits » pour les plus jeunes.
const dans = (n, nuits) => `dans ${n} ${nuits ? 'nuits' : 'jours'}`;

// Quand, en temps relatif : « demain », « jeudi (dans 3 jours) »,
// « mardi 2 déc. (dans 12 jours) ». Jamais « mardi prochain », ambigu.
export function quandTexte(date, maintenant, { nuits = false } = {}) {
  const n = ecartJours(maintenant, date);
  if (n >= -1 && n <= 2) return jourRelatif(date, maintenant);
  if (n < 0) return `il y a ${-n} jours`;
  if (n <= 6) return `${JOURS[date.getDay()]} (${dans(n, nuits)})`;
  const court = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${court} (${dans(n, nuits)})`;
}

export function echeanceTexte(date, maintenant, options) {
  const n = ecartJours(maintenant, date);
  if (n < 0) return n === -1 ? 'en retard d’un jour' : `en retard de ${-n} jours`;
  return `pour ${quandTexte(date, maintenant, options)}`;
}

// Soirs pour travailler : de ce soir à la veille du rendu.
export function soirsTexte(rendu, maintenant) {
  const n = ecartJours(maintenant, rendu);
  if (n <= 0) return '';
  return n === 1 ? 'il ne reste que ce soir' : `il te reste ${n} soirs`;
}

// En-tête de la vue Jour : « Demain · mardi 21 novembre ».
export function titreJour(jour, maintenant) {
  const n = ecartJours(maintenant, jour);
  const date = dateLongue(jour);
  if (n >= -1 && n <= 2) return `${majuscule(jourRelatif(jour, maintenant))} · ${date}`;
  return `${majuscule(date)} · ${n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`}`;
}

// « 23 – 29 novembre », « 30 novembre – 6 décembre », « 28 déc. 2026 – 3 janv. 2027 »
// (comme plage_de_dates dans MyDevoirs).
export function plageDates(debut, fin) {
  const f = (d, options) => d.toLocaleDateString('fr-FR', options);
  if (debut.getFullYear() !== fin.getFullYear()) {
    const o = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${f(debut, o)} – ${f(fin, o)}`;
  }
  if (debut.getMonth() !== fin.getMonth()) {
    return `${f(debut, { day: 'numeric', month: 'long' })} – ${f(fin, { day: 'numeric', month: 'long' })}`;
  }
  return `${debut.getDate()} – ${f(fin, { day: 'numeric', month: 'long' })}`;
}

export const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Texte noir ou blanc selon la couleur de fond (luminance relative WCAG).
export function texteSur(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#111111' : '#ffffff';
}
