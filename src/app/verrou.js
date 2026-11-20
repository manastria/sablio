// Verrou facultatif de la configuration : code adulte, mode adulte, code de
// secours en cas d'oubli.

import * as edt from '../emploi-du-temps.js';
import { codeSecours, lisible, nouvelleDemande } from '../secours.js';
import { $, MINUTE, etat, journaliser } from './commun.js';
import { planifierSauvegarde, stockage } from './donnees.js';
import { rendre } from './rendu.js';

// --- Verrou de la configuration (facultatif) ---
// Un code à 4 chiffres, dont on ne garde que l'empreinte (SHA-256 salée).
// Ce n'est pas une vraie sécurité (les données sont locales) : il évite les
// modifications par erreur ou par jeu. Le code ouvre le « mode adulte » pour
// 10 minutes, prolongées à chaque action.

export const DUREE_ADULTE = 10 * MINUTE;
export const adulte = () => etat.adulteJusqua > Date.now();
export const verrouActif = () => Boolean(etat.verrou) && !adulte();

export async function empreinte(code, sel) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sel}:${code}`));
  return [...new Uint8Array(octets)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function prolongerAdulte() {
  if (etat.verrou && adulte()) etat.adulteJusqua = Date.now() + DUREE_ADULTE;
}

export let resoudreVerrou = null;
export let demandeSecours = null; // code de demande affiché après « Code oublié ? »

// Le code de secours du jour (la veille et le lendemain aussi, pour minuit).
export async function estCodeSecours(code) {
  if (!demandeSecours || !/^\d{6}$/.test(code)) return false;
  const jours = [-1, 0, 1].map((k) => edt.isoLocal(edt.ajouterJours(new Date(), k)));
  return (await Promise.all(jours.map((j) => codeSecours(demandeSecours, j)))).includes(code);
}
export function demanderCode(raison) {
  return new Promise((resolve) => {
    resoudreVerrou = resolve;
    $('#verrou-raison').textContent = `${raison} : le code adulte est demandé.`;
    $('#verrou-code').value = '';
    $('#verrou-erreur').hidden = true;
    $('#verrou-secours').hidden = true;
    demandeSecours = null;
    $('#verrou').showModal();
  });
}
$('#verrou').addEventListener('close', () => {
  resoudreVerrou?.(adulte());
  resoudreVerrou = null;
});
$('#verrou form').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault(); // la vérification est asynchrone : on ferme nous-mêmes
  const code = $('#verrou-code').value;
  const secours = await estCodeSecours(code);
  if (etat.verrou && (secours || await empreinte(code, etat.verrou.sel) === etat.verrou.empreinte)) {
    etat.adulteJusqua = Date.now() + DUREE_ADULTE;
    journaliser(secours ? 'Mode adulte ouvert avec le code de secours' : 'Mode adulte ouvert');
    $('#verrou').close();
    rendre(true);
    // Code oublié : on propose tout de suite d'en choisir un nouveau.
    if (secours) ouvrirReglageVerrou();
  } else {
    $('#verrou-erreur').hidden = false;
    $('#verrou-code').select();
  }
});

// « Code oublié ? » : un code de demande, à saisir sur la page de secours.
export function afficherCodeOublie() {
  demandeSecours = nouvelleDemande();
  $('#verrou-demande').textContent = lisible(demandeSecours);
  $('#verrou-secours').hidden = false;
  $('#verrou-code').focus();
}

// À placer au début d'une action verrouillée : si le verrou est actif, on
// demande le code, on refait l'action s'il est bon, et on renvoie true
// (l'action en cours doit s'arrêter). Sans verrou, l'action continue.
export function bloque(raison, reprendre) {
  if (!verrouActif()) {
    prolongerAdulte();
    return false;
  }
  demanderCode(raison).then((ok) => { if (ok) reprendre(); });
  return true;
}

export function verrouiller() {
  etat.adulteJusqua = 0;
  journaliser('Configuration verrouillée');
  rendre(true);
}

export function majVerrou() {
  const ouvert = Boolean(etat.verrou) && adulte();
  for (const b of document.querySelectorAll('[data-action="verrouiller"]')) b.hidden = !ouvert;
  $('[data-action="deverrouiller"]').hidden = !etat.verrou || ouvert;
  $('#profil').disabled = verrouActif();
  $('#profil').title = verrouActif() ? 'Verrouillé : mode adulte nécessaire' : '';
  $('#verrou-etat').textContent = etat.verrou
    ? `Verrou actif${ouvert ? ' (mode adulte ouvert)' : ''}.` : 'Pas de verrou : tout le monde peut tout modifier.';
  $('#verrou-definir').textContent = etat.verrou ? 'Changer le code…' : 'Choisir un code…';
  $('#verrou-retirer').hidden = !etat.verrou;
}

export function ouvrirReglageVerrou() {
  if (bloque('Changer le code', ouvrirReglageVerrou)) return;
  $('#verrou-nouveau').value = '';
  $('#verrou-confirmation').value = '';
  $('#verrou-reglage-erreur').hidden = true;
  $('#verrou-reglage').showModal();
}

export let verrouEnCours = Promise.resolve();
export async function enregistrerVerrou(code) {
  const sel = crypto.randomUUID();
  const valeur = code ? { sel, empreinte: await empreinte(code, sel) } : null;
  await stockage.enregistrerReglage('verrou', valeur);
  etat.verrou = valeur;
  // Celui qui vient de choisir le code garde la main quelques minutes.
  etat.adulteJusqua = valeur ? Date.now() + DUREE_ADULTE : 0;
  planifierSauvegarde();
  journaliser(valeur ? 'Verrou : code enregistré' : 'Verrou retiré');
  rendre(true);
}
$('#verrou-reglage form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  const code = $('#verrou-nouveau').value;
  const erreur = (texte) => {
    e.preventDefault();
    $('#verrou-reglage-erreur').textContent = texte;
    $('#verrou-reglage-erreur').hidden = false;
  };
  if (!/^\d{4}$/.test(code)) return erreur('Le code doit avoir quatre chiffres.');
  if (code !== $('#verrou-confirmation').value) return erreur('Les deux codes sont différents.');
  verrouEnCours = enregistrerVerrou(code);
});

export async function retirerVerrou() {
  if (bloque('Retirer le verrou', retirerVerrou)) return;
  if (!confirm('Retirer le verrou ? Tout le monde pourra modifier la configuration.')) return;
  verrouEnCours = enregistrerVerrou(null);
  await verrouEnCours;
}
