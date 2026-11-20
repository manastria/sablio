// Point d'entrée de Sablio (prototype) : charge les modules de l'interface
// (chacun pose ses écouteurs), branche les actions des données et démarre.
// Les modules sont dans app/ ; la logique sans DOM dans emploi-du-temps.js,
// contenu.js, secours.js, vacances.js.

import * as edt from './emploi-du-temps.js';
import { actions } from './app/actions.js';
import { $, etat, horloge, journaliser, maintenant } from './app/commun.js';
import { actionsDonnees, demarrerStockage } from './app/donnees.js';
import { changerProfil } from './app/outils.js';
import { api, dansElectron, preparerNavigateur } from './app/plateforme.js';
import { planifier } from './app/rendu.js';
import { semaineParDefaut } from './app/semaine.js';
import './app/afaire.js';
import './app/agenda.js';
import './app/devoirs.js';
import './app/discret.js';
import './app/echange.js';
import './app/emploi-du-temps.js';
import './app/essais.js';
import './app/fenetres.js';
import './app/jour.js';
import './app/jours-sans-cours.js';
import './app/sac.js';
import './app/seance.js';
import './app/verrou.js';

if (!dansElectron) preparerNavigateur();
Object.assign(actions, actionsDonnees);
actions.recharger = () => location.reload();
// Paramètres d'adresse, pour les essais dans un navigateur :
// index.html?heure=2026-11-23T10:32&profil=primaire&vue=jour (heure figée).
// Lus avant d'ouvrir la base : la démonstration se cale sur l'heure simulée.
const parametres = new URLSearchParams(location.search);
if (parametres.get('heure')) {
  Object.assign(horloge, { reelBase: Date.now(), simBase: new Date(parametres.get('heure')).getTime(), vitesse: 0, simulee: true });
}
if (parametres.get('vue') === 'jour') {
  etat.vue = 'jour';
  etat.jour = parametres.get('jour') ? edt.dateDepuisIso(parametres.get('jour')) : edt.debutJour(maintenant());
}
if (parametres.get('vue') === 'afaire') etat.vue = 'afaire';
if (parametres.get('vue') === 'edt') etat.vue = 'edt';
if (parametres.get('vue') === 'semaine') {
  etat.vue = 'semaine';
  etat.semaine = parametres.get('jour') ? edt.lundi(edt.dateDepuisIso(parametres.get('jour'))) : semaineParDefaut(maintenant());
}
changerProfil(parametres.get('profil') ?? etat.profil);
planifier();
demarrerStockage().catch((e) => journaliser(`Stockage : échec (${e.message})`));
requestAnimationFrame(() => api.premierRendu());
