// Données de démonstration et calculs de temps.
// Aucun accès au DOM : ce module se teste seul et pourra être repris.
//
// Vocabulaire (voir docs/refonte/modele-recurrence.md et specification.md) :
// - une série est un motif qui revient (« maths, lundi 8 h 55 ») ;
// - une occurrence est une séance précise : série + date d'origine ;
// - une exception annule ou déplace une occurrence.

const MINUTE = 60_000;
const JOUR = 86_400_000;

// Lundi de référence de la semaine A (même convention que mydevoirs/alternance.py).
export const REFERENCE_AB = new Date(2025, 11, 29);
export const LIBELLES_AB = ['A', 'B'];

// Matières (école) : la même couleur et le même pictogramme pour les cours
// et pour les devoirs. `materiel` sert à « Préparer le sac ».
export const MATIERES = {
  fr: { nom: 'Français', court: 'Fr', picto: '📖', couleur: '#c8553d' },
  ma: { nom: 'Mathématiques', court: 'Ma', picto: '📐', couleur: '#2f6fbf', materiel: 'calculatrice, équerre' },
  hg: { nom: 'Histoire-géographie', court: 'HG', picto: '🌍', couleur: '#8a6d3b' },
  an: { nom: 'Anglais', court: 'An', picto: '💬', couleur: '#7b4fa0' },
  svt: { nom: 'SVT', court: 'SVT', picto: '🌱', couleur: '#3c8d40' },
  pc: { nom: 'Physique-chimie', court: 'PC', picto: '🧪', couleur: '#0f7f81', materiel: 'blouse' },
  eps: { nom: 'EPS', court: 'EPS', picto: '🏃', couleur: '#e0a100', materiel: 'tenue de sport' },
  ap: { nom: 'Arts plastiques', court: 'AP', picto: '🎨', couleur: '#c2457a', materiel: 'pochette de dessin' },
  mu: { nom: 'Musique', court: 'Mu', picto: '🎵', couleur: '#6d6aa8' },
  te: { nom: 'Technologie', court: 'Te', picto: '⚙️', couleur: '#5f7380' },
};

// Activités personnelles : jamais de devoir, et une confidentialité
// (visible, discret, masque) appliquée par le mode discret.
export const ACTIVITES = {
  sport: { nom: 'Football', court: 'Foot', picto: '⚽', couleur: '#2e7d32', confidentialite: 'visible' },
  psy: { nom: 'Psychologue', court: 'Psy', picto: '💭', couleur: '#c62828', confidentialite: 'discret', garderCouleur: true },
  ortho: { nom: 'Orthophonie', court: 'Ortho', picto: '🗣️', couleur: '#d9822b', confidentialite: 'discret', garderCouleur: false },
  piano: { nom: 'Piano', court: 'Piano', picto: '🎹', couleur: '#3949ab', confidentialite: 'visible' },
};

for (const [cle, m] of Object.entries(MATIERES)) Object.assign(m, { cle, nature: 'ecole' });
for (const [cle, a] of Object.entries(ACTIVITES)) Object.assign(a, { cle, nature: 'perso' });

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

// Identifiant stable d'une série : jour de la semaine, heure, matière.
for (const [jour, liste] of Object.entries(SEMAINE_TYPE)) {
  for (const s of liste) s.id = `s${jour}-${s.debut.replace(':', '')}-${s.cle || 'creneau'}`;
}

export function categorie(cle) {
  return MATIERES[cle] ?? ACTIVITES[cle] ?? null;
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

export function lettreSemaine(date, reference = REFERENCE_AB, libelles = LIBELLES_AB) {
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
  const cat = categorie(serie.cle);
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
    debut: aHeure(jour, serie.debut),
    fin: aHeure(jour, serie.fin),
    statut: 'normal',
  };
}

function occurrencesDuMotif(jour) {
  const lettre = lettreSemaine(jour);
  return (SEMAINE_TYPE[jour.getDay()] ?? [])
    .filter((s) => !s.semaine || s.semaine === lettre)
    .map((s) => occurrence(s, jour));
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

export function prochainJourDeCours(apres, filtre = () => true, limite = 14) {
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
