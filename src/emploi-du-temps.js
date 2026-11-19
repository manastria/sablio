// Données de démonstration et calculs de temps.
// Aucun accès au DOM : ce module se teste seul et pourra être repris.

const MINUTE = 60_000;
const JOUR = 86_400_000;

// Lundi de référence de la semaine A (même convention que mydevoirs/alternance.py).
export const REFERENCE_AB = new Date(2025, 11, 29);
export const LIBELLES_AB = ['A', 'B'];

export const MATIERES = {
  fr: { nom: 'Français', court: 'Fr', couleur: '#c8553d' },
  ma: { nom: 'Mathématiques', court: 'Ma', couleur: '#2f6fbf' },
  hg: { nom: 'Histoire-géographie', court: 'HG', couleur: '#8a6d3b' },
  an: { nom: 'Anglais', court: 'An', couleur: '#7b4fa0' },
  svt: { nom: 'SVT', court: 'SVT', couleur: '#3c8d40' },
  pc: { nom: 'Physique-chimie', court: 'PC', couleur: '#0f7f81' },
  eps: { nom: 'EPS', court: 'EPS', couleur: '#e0a100' },
  ap: { nom: 'Arts plastiques', court: 'AP', couleur: '#c2457a' },
  mu: { nom: 'Musique', court: 'Mu', couleur: '#6d6aa8' },
  te: { nom: 'Technologie', court: 'Te', couleur: '#5f7380' },
};

// Semaine type d'un collégien : [début, fin, matière, salle, semaine (A/B, facultatif)].
// Clé : jour de la semaine au sens de Date.getDay() (1 = lundi).
const SEMAINE_TYPE = {
  1: [
    ['08:00', '08:55', 'fr', 'B12'],
    ['08:55', '09:50', 'ma', 'B05'],
    ['10:05', '11:00', 'hg', 'C21'],
    ['11:00', '11:55', 'an', 'B14'],
    ['13:30', '14:25', 'svt', 'Labo 2', 'A'],
    ['13:30', '14:25', 'pc', 'Labo 1', 'B'],
    ['14:25', '16:20', 'eps', 'Gymnase'],
  ],
  2: [
    ['08:00', '09:50', 'te', 'Atelier'],
    ['10:05', '11:00', 'ma', 'B05'],
    ['11:00', '11:55', 'fr', 'B12'],
    ['13:30', '14:25', 'an', 'B14'],
    ['14:25', '15:20', 'mu', 'Musique'],
  ],
  3: [
    ['08:00', '08:55', 'ma', 'B05'],
    ['08:55', '09:50', 'fr', 'B12'],
    ['10:05', '11:55', 'ap', 'Arts', 'A'],
    ['10:05', '11:00', 'hg', 'C21', 'B'],
  ],
  4: [
    ['08:00', '08:55', 'an', 'B14'],
    ['08:55', '09:50', 'hg', 'C21'],
    ['10:05', '11:00', 'fr', 'B12'],
    ['11:00', '11:55', 'ma', 'B05'],
    ['13:30', '15:20', 'eps', 'Gymnase'],
    ['15:35', '16:30', 'pc', 'Labo 1'],
  ],
  5: [
    ['08:00', '08:55', 'svt', 'Labo 2'],
    ['08:55', '09:50', 'ma', 'B05'],
    ['10:05', '11:00', 'fr', 'B12'],
    ['11:00', '11:55', 'hg', 'C21'],
    ['13:30', '14:25', 'an', 'B14'],
  ],
};

// Devoirs de démonstration, à rendre dans `dans` jours à partir d'aujourd'hui.
export const DEVOIRS = [
  { id: 1, matiere: 'ma', texte: 'Exercices 12 et 13 p. 84', dans: 1 },
  { id: 2, matiere: 'fr', texte: 'Lire le chapitre 3 du roman', dans: 1 },
  { id: 3, matiere: 'an', texte: 'Apprendre le vocabulaire de l’unité 4', dans: 2 },
  { id: 4, matiere: 'hg', texte: 'Contrôle : la Révolution française', dans: 4 },
  { id: 5, matiere: 'svt', texte: 'Finir le schéma du cœur', dans: 7 },
  { id: 6, matiere: 'te', texte: 'Rapporter une boîte en carton', dans: 8 },
];

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

function isoLocal(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// --- Emploi du temps ---

export function coursDuJour(jour) {
  const lettre = lettreSemaine(jour);
  return (SEMAINE_TYPE[jour.getDay()] ?? [])
    .filter(([, , , , semaine]) => !semaine || semaine === lettre)
    .map(([debut, fin, cle, salle]) => ({
      id: `${isoLocal(jour)}-${debut}-${cle}`,
      cle,
      matiere: MATIERES[cle],
      salle,
      debut: aHeure(jour, debut),
      fin: aHeure(jour, fin),
    }))
    .sort((a, b) => a.debut - b.debut);
}

export function prochainJourDeCours(apres, limite = 14) {
  for (let i = 1; i <= limite; i++) {
    const jour = ajouterJours(debutJour(apres), i);
    const cours = coursDuJour(jour);
    if (cours.length) return { jour, cours };
  }
  return null;
}

const borner = (x) => Math.min(1, Math.max(0, x));

// Où en est-on de la journée ? Quatre états : avant, cours, pause, fini.
// `fraction` est la part de temps qui reste (1 = tout, 0 = c'est l'heure).
export function situation(maintenant) {
  const cours = coursDuJour(maintenant);
  const actuel = cours.find((c) => c.debut <= maintenant && maintenant < c.fin);
  if (actuel) {
    return {
      etat: 'cours',
      cours,
      actuel,
      suivant: cours.find((c) => c.debut >= actuel.fin) ?? null,
      restant: actuel.fin - maintenant,
      fraction: borner((actuel.fin - maintenant) / (actuel.fin - actuel.debut)),
    };
  }
  const suivant = cours.find((c) => c.debut > maintenant);
  if (suivant) {
    const precedent = cours.findLast((c) => c.fin <= maintenant) ?? null;
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
  return { etat: 'fini', cours, demain: prochainJourDeCours(maintenant) };
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
  return JOURS[date.getDay()];
}

export function echeanceTexte(date, maintenant) {
  const n = ecartJours(maintenant, date);
  if (n < 0) return n === -1 ? 'en retard d’un jour' : `en retard de ${-n} jours`;
  if (n <= 2) return `pour ${jourRelatif(date, maintenant)}`;
  if (n <= 6) return `pour ${JOURS[date.getDay()]} (dans ${n} jours)`;
  const court = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `pour ${court} (dans ${n} jours)`;
}

export const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Texte noir ou blanc selon la couleur de fond (luminance relative WCAG).
export function texteSur(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#111111' : '#ffffff';
}
