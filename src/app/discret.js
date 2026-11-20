// Mode discret et affichage d'une séance (nom, pictogramme, couleur) selon
// la confidentialité des activités personnelles.

import * as edt from '../emploi-du-temps.js';
import { $, DISCRET_PAUSE, GRIS, LIBELLE_NEUTRE, MODES_DISCRET, PICTO_NEUTRE, ecrirePreference, etat, lirePreference, maintenant } from './commun.js';
import { rendre } from './rendu.js';

// --- Mode discret ---
// manuel : inactif sauf si on l'active ; automatique : actif pendant les heures
// de classe, le bouton force l'inverse jusqu'au prochain basculement ;
// toujours : actif, le bouton le suspend 30 minutes (ou jusqu'à la réouverture).

export const discret = {
  // Le choix manuel est retenu : un élève qui l'a activé en classe ne doit
  // pas le voir disparaître parce que l'application a redémarré.
  manuel: lirePreference('sablio-discret-manuel', '0') === '1',
  forcage: null, // { valeur, base } (automatique) ou { jusqua } (toujours)
};

export function discretDeBase(n) {
  if (etat.reglages.discret === 'toujours') return true;
  if (etat.reglages.discret === 'manuel') return discret.manuel;
  const classe = edt.heuresDeClasse(n);
  return Boolean(classe) && classe.debut <= n && n < classe.fin;
}

export function discretActif(n) {
  const base = discretDeBase(n);
  const f = discret.forcage;
  if (f && etat.reglages.discret === 'automatique') {
    if (f.base === base) return f.valeur;
    discret.forcage = null; // basculement automatique : le forçage s'arrête
  }
  if (f && etat.reglages.discret === 'toujours') {
    if (n < f.jusqua) return false;
    discret.forcage = null;
  }
  return base;
}

export function basculerDiscret() {
  const n = maintenant();
  const actif = discretActif(n);
  if (etat.reglages.discret === 'manuel') {
    discret.manuel = !actif;
    ecrirePreference('sablio-discret-manuel', discret.manuel ? '1' : '0');
  } else if (etat.reglages.discret === 'automatique') {
    discret.forcage = { valeur: !actif, base: discretDeBase(n) };
  } else {
    discret.forcage = actif ? { jusqua: new Date(n.getTime() + DISCRET_PAUSE) } : null;
  }
  rendre(true);
}

export function changerModeDiscret(mode) {
  if (!MODES_DISCRET.includes(mode)) return;
  etat.reglages.discret = mode;
  discret.forcage = null;
  ecrirePreference('sablio-discret', mode);
  rendre(true);
}

// Une activité masquée n'apparaît pas du tout en mode discret.
export const visible = (o) => !(etat.discret && o.nature === 'perso' && o.categorie.confidentialite === 'masque');

// --- Affichage d'une séance : nom, pictogramme, couleur ---

export const devoirsDe = (o) => (etat.devoirs ?? []).filter((d) => d.serie === o.serie && d.dateOrigine === o.dateOrigine);

// `prudent` : pour les notifications, qui s'affichent par-dessus tout, même en
// classe : une activité non « visible » y est toujours neutre.
export function affichage(o, { prudent = false } = {}) {
  const lieu = o.salle ? `Salle ${o.salle}` : '';
  if (o.nature === 'ecole') {
    const m = o.categorie;
    return { nom: m.nom, court: m.court, picto: m.picto, couleur: m.couleur, lieu };
  }
  if (o.nature === 'creneau') {
    // Un créneau à matière variable (DS) prend la matière du devoir qui lui est rattaché.
    const m = devoirsDe(o)[0]?.matiere;
    if (m) return { nom: `${o.titre} · ${m.nom}`, court: `${o.titre} ${m.court}`, picto: m.picto, couleur: m.couleur, lieu };
    return { nom: o.titre, court: o.titre, picto: o.picto, couleur: GRIS, lieu };
  }
  const a = o.categorie;
  const neutre = a.confidentialite !== 'visible' && (prudent || etat.discret);
  if (!neutre) return { nom: a.nom, court: a.court, picto: a.picto, couleur: a.couleur, lieu: o.salle ?? '', perso: true };
  return {
    nom: LIBELLE_NEUTRE, court: LIBELLE_NEUTRE, picto: PICTO_NEUTRE,
    couleur: a.garderCouleur ? a.couleur : GRIS, lieu: '', perso: true,
  };
}
