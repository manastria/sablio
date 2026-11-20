// Devoirs : lignes de liste, détail, saisie (à rendre quand, matière, texte
// mis en forme), report après une annulation.

import * as edt from '../emploi-du-temps.js';
import { htmlDepuisTexte, nettoyerHtml, texteBrut } from '../contenu.js';
import { $, GRIS, PROFILS, appliquerStyles, couleurs, echapper, etat, journaliser, maintenant, pastille, pluriel, remplirListe } from './commun.js';
import { affichage } from './discret.js';
import { chargerDevoirs, planifierSauvegarde, stockage } from './donnees.js';
import { badgeSemaine, precisionRendu } from './jour.js';
import { rendre } from './rendu.js';

// --- Devoirs ---

// Une ligne de devoir. `precision` : sous le texte ; `droite` : l'échéance.
export function ligneDevoir(d, { precision = '', droite = '', proche = false }) {
  const o = d.seance;
  let alerte = '';
  if (o?.statut === 'annule' && !d.fait) {
    const nom = o.nature === 'creneau' ? o.titre : o.categorie.nom;
    alerte = `<p class="avertissement">⚠ Le cours de ${echapper(nom)} du ${echapper(edt.dateLongue(o.debut))} est annulé${o.motif ? ` (${echapper(o.motif)})` : ''} : à rendre quand ?
      <button type="button" data-reporter="${d.id}">Reporter au prochain cours de ${echapper(nom)}</button></p>`;
  }
  // La case marque le devoir fait ; le reste de la ligne ouvre le devoir.
  return `<li class="devoir${d.fait ? ' fait' : ''}"><div class="devoir-ligne" data-css="${couleurs(d.matiere)}">
      <label class="case" title="Marquer comme fait">
        <input type="checkbox" data-devoir="${d.id}" ${d.fait ? 'checked' : ''} aria-label="Fait : ${echapper(d.texte.split('\n')[0])}">
      </label>
      <button type="button" class="devoir-ouvrir" data-ouvrir="${d.id}" title="Afficher le devoir">
        ${pastille(d.matiere)}
        <span class="texte"><span class="resume">${echapper(d.texte)}</span>${precision ? `<span class="precision">${echapper(precision)}</span>` : ''}</span>
        ${droite ? `<span class="echeance${proche && !d.fait ? ' proche' : ''}">${echapper(droite)}</span>` : ''}
      </button>
    </div>${alerte}</li>`;
}

// --- Détail d'un devoir ---

export function afficherDetail(id) {
  const d = etat.devoirs?.find((x) => x.id === id);
  if (!d) return;
  etat.detail = id;
  const n = maintenant();
  const profil = PROFILS[etat.profil];
  $('#detail-pastille').innerHTML = pastille(d.matiere);
  appliquerStyles($('#detail-pastille'));
  $('#detail-titre').textContent = d.matiere.nom;
  const soirs = d.fait ? '' : edt.soirsTexte(d.rendu, n);
  $('#detail-echeance').textContent = [edt.majuscule(edt.echeanceTexte(d.rendu, n, profil)), soirs].filter(Boolean).join(' · ');
  $('#detail-contenu').innerHTML = nettoyerHtml(d.contenu ?? htmlDepuisTexte(d.texte));
  const o = d.seance;
  const infos = [['À rendre', [edt.majuscule(edt.dateLongue(d.rendu)), precisionRendu(d, n)].filter(Boolean).join(', ')]];
  if (o?.statut === 'annule') infos.push(['Attention', `cours annulé${o.motif ? ` (${o.motif})` : ''}`]);
  if (o?.statut === 'deplace') infos.push(['Cours déplacé', `prévu ${edt.dateLongue(o.origine.debut)} à ${edt.heureTexte(o.origine.debut)}`]);
  if (!o) infos.push(['Rattaché', 'à une date (pas à un cours)']);
  if (d.aFaireLe) infos.push(['À faire', edt.quandTexte(d.aFaireLe, n, profil)]);
  remplirListe($('#detail-infos'), infos);
  const fait = $('#detail-fait');
  fait.checked = d.fait;
  fait.dataset.devoir = d.id;
  if (!$('#detail').open) $('#detail').showModal();
}

export async function supprimerDevoir() {
  const d = etat.devoirs?.find((x) => x.id === etat.detail);
  if (!d || !confirm(`Supprimer ce devoir ?\n\n${d.matiere.nom} : ${d.texte.split('\n')[0]}`)) return;
  $('#detail').close();
  try {
    await stockage.supprimer(d.id);
    await chargerDevoirs();
    planifierSauvegarde();
    journaliser(`Devoir supprimé : ${d.texte.split('\n')[0]}`);
  } catch (e) {
    journaliser(`Suppression : échec (${e.message})`);
  }
}

// Échéance relative et soirs restants, pour les listes de devoirs à faire.
export function ligneAFaire(d, n, profil) {
  const ecart = edt.ecartJours(n, d.rendu);
  const precision = [
    d.aFaireLe && ecart > 0
      ? `${edt.ecartJours(n, d.aFaireLe) < 0 ? 'prévu' : 'à faire'} ${edt.quandTexte(d.aFaireLe, n, profil)}` : '',
    !d.fait && !d.aFaireLe ? edt.soirsTexte(d.rendu, n) : '',
  ].filter(Boolean).join(' · ');
  return ligneDevoir(d, { precision, droite: edt.echeanceTexte(d.rendu, n, profil), proche: ecart <= 1 });
}

export function htmlDevoirs(n, profil) {
  if (!etat.devoirs) return `<p class="etiquette">Devoirs à faire</p><p class="vide">${echapper(etat.messageDevoirs ?? 'Chargement…')}</p>`;
  const tous = [...etat.devoirs].sort((a, b) => a.rendu - b.rendu);
  const aFaire = tous.filter((d) => !d.fait);
  const faits = tous.filter((d) => d.fait);
  const visibles = aFaire.slice(0, profil.devoirs);
  const caches = aFaire.length - visibles.length;
  return `
    <div class="entete-carte"><p class="etiquette">Devoirs à faire</p>
      <button type="button" class="lien" data-action="ajouter">+ Ajouter un devoir</button></div>
    ${visibles.length ? `<ul class="liste-devoirs">${visibles.map((d) => ligneAFaire(d, n, profil)).join('')}</ul>` : '<p class="vide">Tout est fait. Bravo !</p>'}
    ${caches > 0 ? `<p class="vide">Et ${caches} autre${caches > 1 ? 's' : ''} plus tard. <button type="button" class="lien" data-action="vue" data-vue="afaire">Tout voir</button></p>` : ''}
    ${faits.length ? `<details class="faits"><summary>${pluriel(faits.length, 'devoir')} fait${faits.length > 1 ? 's' : ''}</summary>
      <ul class="liste-devoirs">${faits.map((d) => ligneDevoir(d, { droite: edt.echeanceTexte(d.rendu, n, profil) })).join('')}</ul></details>` : ''}`;
}

// --- Saisie d'un devoir ---
// On choisit d'abord QUAND le rendre : un jour, puis un cours de ce jour.
// La matière se déduit du cours ; on ne la choisit que pour un créneau sans
// matière fixe (DS) ou pour un devoir sans cours précis.

export const saisie = { jour: null, seance: null };
export const cleSeance = (o) => `o|${o.serie}|${o.dateOrigine}`;

export function seanceChoisie() {
  if (!saisie.seance?.startsWith('o|')) return null;
  const [, serie, dateOrigine] = saisie.seance.split('|');
  return edt.trouverOccurrence(serie, dateOrigine);
}

// Sans argument : nouveau devoir. Avec un devoir : modification.
// Avec une séance (bouton « + » d'un cours) : devoir à rendre à ce cours.
export function ouvrirAjout(devoir = null, occurrence = null) {
  if (!etat.devoirs) return;
  etat.edition = devoir?.id ?? null;
  const n = maintenant();
  const matiere = $('#ajout-matiere');
  // Reconstruite à chaque fois : les matières peuvent avoir changé.
  matiere.innerHTML = edt.matieres()
    .map((m) => `<option value="${m.cle}">${m.picto} ${echapper(m.nom)}</option>`).join('');
  // Matière par défaut : celle du cours en cours ou qui vient de finir,
  // puisqu'on note le travail à la fin du cours.
  const s = edt.situation(n, edt.estEcole);
  const recent = s.actuel ?? s.precedent ?? (s.etat === 'fini' ? s.cours.at(-1) : null);
  if (recent?.nature === 'ecole') matiere.value = recent.cle;

  if (devoir) {
    matiere.value = devoir.matiere.cle;
    saisie.jour = devoir.rendu;
    saisie.seance = devoir.seance ? cleSeance(devoir.seance) : 'date';
  } else if (occurrence) {
    saisie.jour = edt.debutJour(occurrence.debut);
    saisie.seance = cleSeance(occurrence);
  } else if (etat.vue === 'jour' && etat.jour && edt.ecartJours(n, etat.jour) > 0
    && edt.coursDuJour(etat.jour, edt.estEcole).length) {
    // Vue Jour sur un jour à venir : on propose ce jour ; reste à choisir le cours.
    saisie.jour = etat.jour;
    saisie.seance = null;
  } else {
    // Sinon : le prochain cours de la matière qui vient de finir.
    const [prochain] = recent?.nature === 'ecole' ? edt.prochainesOccurrences(n, (o) => o.cle === recent.cle, 1) : [];
    saisie.jour = prochain ? edt.debutJour(prochain.debut)
      : edt.prochainJourDeCours(n)?.jour ?? edt.ajouterJours(edt.debutJour(n), 1);
    saisie.seance = prochain ? cleSeance(prochain) : null;
  }

  const editeur = $('#ajout-texte');
  editeur.innerHTML = devoir ? nettoyerHtml(devoir.contenu ?? htmlDepuisTexte(devoir.texte)) : '';
  $('#ajout-erreur').hidden = true;
  $('#ajout-erreur-rendu').hidden = true;
  $('#ajout-afaire').value = devoir?.aFaireLe ? edt.isoLocal(devoir.aFaireLe) : '';
  $('#ajout-champ-afaire').hidden = !etat.reglages.aFaireLe && !devoir?.aFaireLe;
  $('#ajout-titre').textContent = devoir ? 'Modifier le devoir' : 'Nouveau devoir';
  $('#ajout-valider').textContent = devoir ? 'Enregistrer' : 'Ajouter';
  remplirJours();
  remplirSeances();
  const dialogue = $('#ajout');
  dialogue.returnValue = '';
  dialogue.showModal();
  // Cours déjà choisi : on passe directement au travail à faire.
  if (!saisie.seance) {
    $('#ajout-jours input:checked')?.focus();
    return;
  }
  editeur.focus();
  const plage = document.createRange(); // curseur à la fin du texte existant
  plage.selectNodeContents(editeur);
  plage.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(plage);
}

export const devoirEnEdition = () => (etat.edition ? etat.devoirs?.find((d) => d.id === etat.edition) : null);

// Les dix prochains jours de classe, en puces groupées par semaine.
export function remplirJours() {
  const n = maintenant();
  const jours = [];
  let j = edt.debutJour(n);
  for (let i = 0; i < 75 && jours.length < 10; i++, j = edt.ajouterJours(j, 1)) {
    if (edt.coursDuJour(j, edt.estEcole).some((o) => i > 0 || o.debut > n)) jours.push(j);
  }
  if (saisie.jour && !jours.some((x) => edt.memeJour(x, saisie.jour))) {
    jours.push(saisie.jour);
    jours.sort((a, b) => a - b);
  }
  let semaine = null;
  const html = [];
  for (const x of jours) {
    const s = edt.numeroSemaine(x).semaine;
    if (s !== semaine) {
      html.push(badgeSemaine(x, n, 'petit'));
      semaine = s;
    }
    const ecart = edt.ecartJours(n, x);
    const nom = ecart === 0 ? 'auj.' : ecart === 1 ? 'demain' : x.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    const choisi = saisie.jour && edt.memeJour(x, saisie.jour);
    html.push(`<label class="puce-choix" title="${echapper(edt.dateLongue(x))}">
      <input type="radio" name="rendu-jour" value="${edt.isoLocal(x)}" ${choisi ? 'checked' : ''}>
      <span class="jour-nom">${echapper(nom)}</span><span class="jour-num">${x.getDate()}</span></label>`);
  }
  $('#ajout-jours').innerHTML = html.join('');
  $('#ajout-date').value = saisie.jour ? edt.isoLocal(saisie.jour) : '';
}

// Les cours du jour choisi (et les créneaux comme le DS), plus « Sans cours précis ».
export function remplirSeances() {
  const zone = $('#ajout-seances');
  if (!saisie.jour) {
    zone.innerHTML = '';
    return;
  }
  const seances = edt.coursDuJour(saisie.jour, edt.estEcole);
  // En modification, la séance actuelle reste proposée, même annulée.
  const actuelle = seanceChoisie();
  if (actuelle && edt.memeJour(actuelle.debut, saisie.jour) && !seances.some((o) => cleSeance(o) === saisie.seance)) {
    seances.push(actuelle);
    seances.sort((a, b) => a.debut - b.debut);
  }
  const options = seances.map((o) => {
    const a = o.nature === 'creneau' ? { nom: `${o.titre} (matière au choix)`, picto: o.picto, couleur: GRIS } : affichage(o);
    const statut = o.statut === 'annule' ? ' · annulé' : o.statut === 'deplace' ? ' · déplacé' : '';
    return `<label class="choix-seance" data-css="${couleurs(a)}">
      <input type="radio" name="rendu-seance" value="${cleSeance(o)}" ${cleSeance(o) === saisie.seance ? 'checked' : ''}>
      ${pastille(a)}<span><strong>${echapper(a.nom)}</strong><span class="precision">${edt.heureTexte(o.debut)}${statut}</span></span></label>`;
  });
  options.push(`<label class="choix-seance sans-cours">
      <input type="radio" name="rendu-seance" value="date" ${saisie.seance === 'date' ? 'checked' : ''}>
      <span><strong>Sans cours précis</strong><span class="precision">seulement la date</span></span></label>`);
  zone.innerHTML = `${seances.length ? '' : '<p class="vide">Pas de cours ce jour-là.</p>'}${options.join('')}`;
  appliquerStyles(zone);
  majMatiere();
}

// La matière vient du cours choisi ; le champ ne sert que sinon.
export function majMatiere() {
  const o = seanceChoisie();
  $('#ajout-champ-matiere').hidden = o?.nature === 'ecole';
  if (o?.nature === 'ecole') $('#ajout-matiere').value = o.cle;
}

// Nouveau jour : on présélectionne le cours de la matière en cours, s'il y en a un.
export function choisirJourSaisie(jour) {
  saisie.jour = edt.debutJour(jour);
  const cle = $('#ajout-matiere').value;
  const cours = edt.coursDuJour(saisie.jour, (o) => o.cle === cle);
  saisie.seance = cours.length === 1 ? cleSeance(cours[0]) : null;
  $('#ajout-erreur-rendu').hidden = true;
  remplirJours();
  remplirSeances();
}

export async function enregistrerAjout() {
  const o = seanceChoisie();
  const serie = o?.serie ?? null;
  const dateOrigine = o?.dateOrigine ?? null;
  const pour = edt.isoLocal(o ? o.debut : saisie.jour);
  // Le contenu mis en forme est nettoyé ; `texte` en garde la version brute.
  const contenu = nettoyerHtml($('#ajout-texte').innerHTML);
  const edition = etat.edition;
  const devoir = {
    id: edition ?? crypto.randomUUID(),
    matiere: o?.nature === 'ecole' ? o.cle : $('#ajout-matiere').value,
    texte: texteBrut(contenu),
    contenu,
    pour,
    serie,
    dateOrigine,
    aFaireLe: (!$('#ajout-champ-afaire').hidden && $('#ajout-afaire').value) || null,
  };
  etat.edition = null;
  if (!devoir.texte || !pour) return;
  try {
    if (edition) await stockage.modifier(devoir);
    else await stockage.ajouter(devoir);
    await chargerDevoirs();
    planifierSauvegarde();
    journaliser(`Devoir ${edition ? 'modifié' : 'ajouté'} : ${devoir.texte.split('\n')[0]} (${serie ? 'rattaché au cours' : 'rattaché à une date'})`);
    if (edition) afficherDetail(edition);
  } catch (e) {
    journaliser(`${edition ? 'Modification' : 'Ajout'} : échec (${e.message})`);
  }
}

// Coller depuis l'ENT : on garde la mise en forme utile, nettoyée.
$('#ajout-texte').addEventListener('paste', (e) => {
  const html = e.clipboardData?.getData('text/html');
  const texte = e.clipboardData?.getData('text/plain') ?? '';
  e.preventDefault();
  if (html) document.execCommand('insertHTML', false, nettoyerHtml(html));
  else document.execCommand('insertText', false, texte);
});
// Un glisser-déposer pourrait apporter des images ou du HTML non nettoyé.
$('#ajout-texte').addEventListener('drop', (e) => e.preventDefault());
// Les boutons de mise en forme ne doivent pas prendre le focus de l'éditeur.
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('[data-format]')) e.preventDefault();
});
// Cours annulé : on rattache le devoir à la séance suivante de la même série
// de cours (même matière, ou même créneau pour un DS).
export async function reporter(id) {
  const d = etat.devoirs?.find((x) => x.id === id);
  const o = d?.seance;
  if (!o) return;
  const filtre = o.nature === 'creneau' ? (x) => x.serie === o.serie : (x) => x.cle === o.cle;
  const [suivante] = edt.prochainesOccurrences(o.fin, filtre, 1);
  if (!suivante) {
    journaliser('Report : pas de cours suivant dans les cinq semaines');
    return;
  }
  try {
    await stockage.rattacher(id, { serie: suivante.serie, dateOrigine: suivante.dateOrigine, pour: edt.isoLocal(suivante.debut) });
    await chargerDevoirs();
    planifierSauvegarde();
    journaliser(`Report : « ${d.texte} » pour ${edt.dateLongue(suivante.debut)}`);
  } catch (e) {
    journaliser(`Report : échec (${e.message})`);
  }
}
// L'événement « submit » part tout de suite et dit quel bouton a servi ;
// « close » part plus tard, et deux fermetures rapprochées se confondent.
export let ajoutEnCours = Promise.resolve();
$('#ajout form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') {
    etat.edition = null;
    return;
  }
  if (!saisie.seance) {
    e.preventDefault();
    $('#ajout-erreur-rendu').hidden = false;
    $('#ajout-seances input')?.focus();
    return;
  }
  // L'éditeur n'est pas un champ de formulaire : on vérifie nous-mêmes.
  if (!texteBrut($('#ajout-texte').innerHTML)) {
    e.preventDefault();
    $('#ajout-erreur').hidden = false;
    $('#ajout-texte').focus();
    return;
  }
  ajoutEnCours = enregistrerAjout();
});
$('#ajout').addEventListener('cancel', () => { etat.edition = null; });
// Quelle que soit la façon de fermer (clic à côté compris). L'enregistrement
// a déjà lu `etat.edition` : il le fait avant toute attente.
$('#ajout').addEventListener('close', () => { etat.edition = null; });
