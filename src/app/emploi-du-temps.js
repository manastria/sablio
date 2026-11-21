// Écran « Emploi du temps » : semaine type (cours), matières, activités,
// semaines alternées.

import * as edt from '../emploi-du-temps.js';
import { htmlAgenda } from './agenda.js';
import { $, GRIS, LIBELLE_NEUTRE, NOMS_JOURS, ORDRE_JOURS, PALETTE, PICTOS, PICTO_NEUTRE, appliquerStyles, couleurs, dateCourte, echapper, etat, heureCourte, journaliser, maintenant, pastille, pluriel } from './commun.js';
import { discret, visible } from './discret.js';
import { planifierSauvegarde, rechargerTout, stockage } from './donnees.js';
import { badgeSemaine } from './jour.js';
import { htmlVacances } from './jours-sans-cours.js';
import { rendre } from './rendu.js';
import { bloque } from './verrou.js';

// --- Écran « Emploi du temps » ---
// Saisie de la semaine type (séries), des matières et des activités. Surtout
// pour l'adulte : il est dans l'en-tête, pas dans les onglets de l'élève.

// Une activité non « visible » reste neutre en mode discret, ici aussi.
export function affichageCategorie(c, serie = null) {
  if (!c) return { nom: serie?.titre || 'Créneau', picto: serie?.picto || '📝', couleur: GRIS };
  if (c.nature === 'perso' && etat.discret && c.confidentialite !== 'visible') {
    return { nom: LIBELLE_NEUTRE, picto: PICTO_NEUTRE, couleur: c.garderCouleur ? c.couleur : GRIS, cache: true, masque: c.confidentialite === 'masque' };
  }
  return { nom: c.nom, picto: c.picto, couleur: c.couleur };
}

export function construireEdt(n) {
  const zone = $('#vue-edt');
  const series = edt.semaineType();
  const verrou = 'disabled title="Désactivez le mode discret pour modifier"';
  const cartes = ORDRE_JOURS.map((j) => {
    const lignes = series.filter((x) => x.jour === j).sort((a, b) => a.debut.localeCompare(b.debut)).map((x) => {
      const a = affichageCategorie(edt.categorie(x.cle), x);
      if (a.masque) return '';
      const details = [
        a.cache ? '' : x.salle, x.semaine ? `semaine ${x.semaine}` : '',
        x.valideDu ? `dès le ${dateCourte(x.valideDu)}` : '', x.valideAu ? `jusqu’au ${dateCourte(x.valideAu)}` : '',
      ].filter(Boolean).join(' · ');
      return `<li><button type="button" class="ligne-edt" data-serie="${x.id}" data-css="${couleurs(a)}" ${a.cache ? verrou : ''}>
        <span class="horaire">${heureCourte(x.debut)}<br>${heureCourte(x.fin)}</span>${pastille(a)}
        <span><strong>${echapper(a.nom)}</strong>${details ? `<span class="precision">${echapper(details)}</span>` : ''}</span></button></li>`;
    }).join('');
    return `<section class="carte" aria-label="${NOMS_JOURS[j]}">
      <div class="entete-carte"><p class="etiquette">${edt.majuscule(NOMS_JOURS[j])}</p>
        <button type="button" class="lien" data-action="serie-nouvelle" data-jour="${j}">+ Ajouter</button></div>
      ${lignes ? `<ul class="liste-edt">${lignes}</ul>` : '<p class="vide">Rien.</p>'}</section>`;
  }).join('');
  const ligneCategorie = (c) => {
    const a = affichageCategorie(c);
    if (a.masque) return '';
    const nb = series.filter((x) => x.cle === c.cle).length;
    const conf = { visible: 'visible en mode discret', discret: `« ${LIBELLE_NEUTRE} » en mode discret`, masque: 'masqué en mode discret' };
    const details = [
      `${pluriel(nb, 'séance')} par semaine`,
      c.nature === 'ecole' && c.materiel ? `+ ${c.materiel}` : '',
      c.nature === 'perso' && !a.cache ? conf[c.confidentialite ?? 'discret'] : '',
    ].filter(Boolean).join(' · ');
    return `<li><button type="button" class="ligne-edt" data-categorie="${c.cle}" data-css="${couleurs(a)}" ${a.cache ? verrou : ''}>
      ${pastille(a)}<span><strong>${echapper(a.nom)}</strong><span class="precision">${echapper(details)}</span></span></button></li>`;
  };
  zone.innerHTML = `
    <div class="afaire-entete">
      <h2>Emploi du temps${etat.eleve ? ` de ${echapper(etat.eleve)}` : ''}</h2>
      <button type="button" class="lien" data-action="eleve-nommer">${etat.eleve ? 'Changer le prénom' : 'Indiquer le prénom de l’élève'}</button>
      <p class="afaire-resume">Semaine type. Pour une seule séance (annulée, déplacée), passez par la vue Jour.</p>
    </div>
    <div class="ligne">
      <button type="button" data-action="edt-exporter" title="Pour le préparer sur un autre ordinateur et l’envoyer (ergothérapeute, parent)">Exporter l’emploi du temps</button>
      <button type="button" data-action="edt-importer">Importer un emploi du temps…</button>
      <button type="button" data-action="edt-vider">Nouvel emploi du temps (vide)…</button>
    </div>
    <details class="notice">
      <summary>Préparer l’emploi du temps d’un ou plusieurs élèves (ergothérapeute, enseignant)</summary>
      <ol>
        <li><strong>Nouvel élève</strong> : « Nouvel emploi du temps (vide) », puis indiquez son prénom. Les matières sont gardées ; cours, activités, événements et vacances repartent de zéro.</li>
        <li>Saisissez les cours, les activités (orthophonie, psychologue…) avec leur confidentialité, la zone de vacances et les semaines alternées.</li>
        <li>« Exporter l’emploi du temps » : le fichier porte le prénom (<code>sablio-emploi-du-temps-leo-….json</code>). Envoyez-le à la famille, qui l’importe dans son Sablio.</li>
        <li><strong>Élève suivant, ou retouche plus tard</strong> : « Importer un emploi du temps… » avec son fichier, en le <em>remplaçant</em> ; modifiez, puis exportez de nouveau. Gardez un fichier par élève.</li>
      </ol>
      <p>Le fichier contient l’emploi du temps seulement : ni devoirs, ni code du verrou. Il peut contenir des rendez-vous de soin : transmettez-le comme une donnée de santé.</p>
    </details>
    <div class="ligne cycle-resume">
      ${badgeSemaine(n, n)}
      <span>${edt.cycleActuel().actif
    ? `Semaines alternées : ${echapper(edt.cycleActuel().libelles.join(', '))}. Cette semaine est la semaine ${echapper(edt.lettreSemaine(n))}.`
    : 'Pas de semaines alternées.'}</span>
      <button type="button" class="lien" data-action="cycle-modifier">Modifier</button>
    </div>
    ${etat.discret ? '<p class="avertissement">Mode discret actif : les activités personnelles ne sont pas modifiables.</p>' : ''}
    <div class="grille-edt">${cartes}</div>
    <div class="grille-edt">
      <section class="carte">
        <div class="entete-carte"><p class="etiquette">Matières</p>
          <button type="button" class="lien" data-action="categorie-nouvelle" data-nature="ecole">+ Matière</button></div>
        <ul class="liste-edt">${edt.matieres().map(ligneCategorie).join('')}</ul>
      </section>
      <section class="carte">
        <div class="entete-carte"><p class="etiquette">Vacances et jours sans cours</p>
          <button type="button" class="lien" data-action="periode-nouvelle">+ Période</button></div>
        ${htmlVacances(n)}
      </section>
      <section class="carte">
        <div class="entete-carte"><p class="etiquette">Agenda</p>
          <button type="button" class="lien" data-action="evenement-nouveau" data-date="${edt.isoLocal(n)}">+ Événement</button></div>
        ${htmlAgenda(n)}
      </section>
      <section class="carte">
        <div class="entete-carte"><p class="etiquette">Activités personnelles</p>
          <button type="button" class="lien" data-action="categorie-nouvelle" data-nature="perso">+ Activité</button></div>
        <ul class="liste-edt">${edt.activites().map(ligneCategorie).join('') || '<li class="vide">Aucune.</li>'}</ul>
      </section>
    </div>`;
  appliquerStyles(zone);
}

// --- Cycle de semaines (comme MyDevoirs : libellés et semaine en cours) ---

export const lireLibelles = () => [...new Set($('#cycle-libelles').value.split(/[,;]/).map((x) => x.trim()).filter(Boolean))];

export function ouvrirCycle() {
  if (bloque('Modifier les semaines alternées', ouvrirCycle)) return;
  const n = maintenant();
  const { actif, libelles } = edt.cycleActuel();
  $('#cycle-actif').checked = actif;
  $('#cycle-libelles').value = libelles.join(', ');
  $('#cycle-legende').textContent = `Cette semaine (semaine ${edt.numeroSemaine(n).semaine}) est la semaine`;
  $('#cycle-erreur').hidden = true;
  majCycle(actif ? edt.lettreSemaine(n) : libelles[0]);
  $('#edt-cycle').showModal();
}

// Libellés modifiés : on reconstruit le choix de la semaine en cours, l'aperçu
// des semaines suivantes et l'alerte sur les cours dont la semaine disparaît.
export function majCycle(courante = document.querySelector('input[name="cycle-courante"]:checked')?.value) {
  const actif = $('#cycle-actif').checked;
  $('#cycle-details').hidden = !actif;
  const libelles = lireLibelles();
  const choisie = libelles.includes(courante) ? courante : libelles[0];
  $('#cycle-courante').innerHTML = libelles.map((x) => `<label class="choix-seance">
    <input type="radio" name="cycle-courante" value="${echapper(x)}" ${x === choisie ? 'checked' : ''}><span><strong>${echapper(x)}</strong></span></label>`).join('');
  const n = maintenant();
  const i = libelles.indexOf(choisie);
  $('#cycle-apercu').textContent = libelles.length > 1
    ? [1, 2, 3].map((k) => `semaine ${edt.numeroSemaine(edt.ajouterJours(n, 7 * k)).semaine} : ${libelles[(i + k) % libelles.length]}`).join(' · ')
    : '';
  const orphelins = actif ? edt.semaineType().filter((x) => x.semaine && !libelles.includes(x.semaine)) : [];
  const reserves = actif ? [] : edt.semaineType().filter((x) => x.semaine);
  const alerte = $('#cycle-orphelins');
  alerte.hidden = !orphelins.length && !reserves.length;
  alerte.textContent = orphelins.length
    ? `${pluriel(orphelins.length, 'cours')} ${orphelins.length > 1 ? 'utilisent' : 'utilise'} une semaine qui n’existera plus (${[...new Set(orphelins.map((x) => x.semaine))].join(', ')}) : ${orphelins.length > 1 ? 'ils n’auront plus lieu' : 'il n’aura plus lieu'}. Modifiez-${orphelins.length > 1 ? 'les' : 'le'} ensuite.`
    : `${pluriel(reserves.length, 'cours')} ${reserves.length > 1 ? 'sont réservés' : 'est réservé'} à une semaine : sans alternance, ${reserves.length > 1 ? 'ils auront' : 'il aura'} lieu chaque semaine.`;
}

export async function enregistrerCycle() {
  const n = maintenant();
  const libelles = lireLibelles();
  const actif = $('#cycle-actif').checked && libelles.length > 0;
  const courante = document.querySelector('input[name="cycle-courante"]:checked')?.value ?? libelles[0];
  // La semaine de référence porte le premier libellé.
  const reference = edt.ajouterJours(edt.lundi(n), -7 * Math.max(0, libelles.indexOf(courante)));
  const valeur = { actif, libelles: libelles.length ? libelles : edt.cycleActuel().libelles, reference: edt.isoLocal(reference) };
  try {
    await stockage.enregistrerReglage('cycle', valeur);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`Cycle : ${actif ? `${libelles.join(', ')}, cette semaine ${courante}` : 'pas d’alternance'}`);
  } catch (e) {
    journaliser(`Cycle : échec (${e.message})`);
  }
}

export let cycleEnCours = Promise.resolve();
$('#edt-cycle form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  if ($('#cycle-actif').checked && lireLibelles().length < 2) {
    e.preventDefault();
    $('#cycle-erreur').textContent = 'Il faut au moins deux libellés, par exemple « A, B ».';
    $('#cycle-erreur').hidden = false;
    return;
  }
  cycleEnCours = enregistrerCycle();
});
$('#edt-cycle').addEventListener('input', (e) => { if (e.target.id === 'cycle-libelles') majCycle(); });
$('#edt-cycle').addEventListener('change', (e) => { if (e.target.id === 'cycle-actif') majCycle(); });

// Un cours de la semaine type.
export let serieEditee = null;

export function ouvrirSerie(id = null, jour = 1) {
  if (bloque('Modifier l’emploi du temps', () => ouvrirSerie(id, jour))) return;
  const x = id ? edt.series().find((s) => s.id === id) : null;
  serieEditee = x;
  const option = (c) => `<option value="${c.cle}">${c.picto} ${echapper(c.nom)}</option>`;
  const choix = $('#serie-categorie');
  choix.innerHTML = `<optgroup label="Matières">${edt.matieres().map(option).join('')}</optgroup>
    <optgroup label="Activités personnelles">${edt.activites().map(option).join('')}</optgroup>
    <option value="">📝 Créneau sans matière fixe (DS…)</option>`;
  choix.value = x ? x.cle : edt.matieres()[0]?.cle ?? '';
  $('#serie-titre').value = x?.titre ?? 'DS';
  $('#serie-jour').innerHTML = ORDRE_JOURS.map((j) => `<option value="${j}">${edt.majuscule(NOMS_JOURS[j])}</option>`).join('');
  $('#serie-jour').value = String(x?.jour ?? jour);
  // Nouveau cours : le premier horaire connu encore libre ce jour-là ; sinon,
  // il commence à la fin du dernier cours de ce jour.
  const dernier = edt.semaineType().filter((s) => s.jour === Number(jour)).sort((a, b) => b.fin.localeCompare(a.fin))[0];
  const libre = edt.creneauxConnus(Number(jour)).find((c) => !c.occupe);
  const debut = x?.debut ?? libre?.debut ?? dernier?.fin ?? '08:00';
  const [h, m] = debut.split(':').map(Number);
  const finDefaut = `${String(Math.min(23, h + Math.floor((m + 55) / 60))).padStart(2, '0')}:${String((m + 55) % 60).padStart(2, '0')}`;
  $('#serie-debut').value = debut;
  $('#serie-fin').value = x?.fin ?? libre?.fin ?? finDefaut;
  majCreneauxConnus();
  $('#serie-salle').value = x?.salle ?? '';
  // Les semaines possibles viennent du cycle (A/B, 1/2/3…).
  const { actif, libelles } = edt.cycleActuel();
  const valeurs = ['', ...(actif ? libelles : [])];
  if (x?.semaine && !valeurs.includes(x.semaine)) valeurs.push(x.semaine); // libellé disparu
  $('#serie-semaines').innerHTML = valeurs.map((v) => `<label class="choix-seance">
    <input type="radio" name="serie-semaine" value="${echapper(v)}" ${(x?.semaine ?? '') === v ? 'checked' : ''}>
    <span><strong>${v ? `Semaine ${echapper(v)}` : 'Toutes'}</strong>${v ? `<span class="precision">${!libelles.includes(v) || !actif ? 'n’existe plus' : `une semaine sur ${libelles.length}`}</span>` : ''}</span></label>`).join('');
  $('#serie-champ-semaines').hidden = valeurs.length === 1;
  $('#serie-du').value = x?.valideDu ?? '';
  $('#serie-au').value = x?.valideAu ?? '';
  $('#serie-supprimer').hidden = !x;
  $('#serie-titre-dialogue').textContent = x ? 'Modifier le cours' : 'Nouveau cours';
  $('#serie-erreur').hidden = true;
  majChampsSerie();
  $('#edt-serie').showModal();
}

// Les horaires déjà saisis, à côté de « De » et « à » : un clic remplit les
// deux heures. Barrés : déjà pris ce jour-là (restent cliquables, pour les
// semaines A/B).
export function majCreneauxConnus() {
  const creneaux = edt.creneauxConnus(Number($('#serie-jour').value), serieEditee?.id);
  const debut = $('#serie-debut').value;
  const fin = $('#serie-fin').value;
  $('#serie-creneaux').hidden = creneaux.length === 0;
  $('#serie-creneaux-liste').innerHTML = creneaux.map((c) => `<button type="button" class="creneau-connu${c.occupe ? ' occupe' : ''}"
    data-debut="${c.debut}" data-fin="${c.fin}" aria-pressed="${c.debut === debut && c.fin === fin}"
    ${c.occupe ? 'title="Déjà un cours à cette heure ce jour-là"' : ''}>${heureCourte(c.debut)} – ${heureCourte(c.fin)}</button>`).join('');
}
$('#serie-creneaux-liste').addEventListener('click', (e) => {
  const bouton = e.target.closest('button[data-debut]');
  if (!bouton) return;
  $('#serie-debut').value = bouton.dataset.debut;
  $('#serie-fin').value = bouton.dataset.fin;
  majCreneauxConnus();
});
for (const id of ['#serie-jour', '#serie-debut', '#serie-fin']) $(id).addEventListener('input', majCreneauxConnus);

export function majChampsSerie() {
  const creneau = $('#serie-categorie').value === '';
  $('#serie-champ-titre').hidden = !creneau;
  $('#serie-titre').required = creneau;
}

export async function enregistrerSerieFormulaire() {
  const cle = $('#serie-categorie').value;
  const serie = {
    id: serieEditee?.id ?? crypto.randomUUID(),
    cle,
    titre: cle ? null : $('#serie-titre').value.trim(),
    picto: cle ? null : serieEditee?.picto ?? '📝',
    salle: $('#serie-salle').value.trim() || null,
    jour: Number($('#serie-jour').value),
    debut: $('#serie-debut').value,
    fin: $('#serie-fin').value,
    semaine: document.querySelector('input[name="serie-semaine"]:checked')?.value || null,
    valideDu: $('#serie-du').value || null,
    valideAu: $('#serie-au').value || null,
  };
  try {
    await stockage.enregistrerSerie(serie);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`Cours ${serieEditee ? 'modifié' : 'ajouté'} : ${edt.categorie(cle)?.nom ?? serie.titre}, ${NOMS_JOURS[serie.jour]} ${serie.debut}`);
  } catch (e) {
    journaliser(`Cours : échec (${e.message})`);
  }
}

export let serieEnCours = Promise.resolve();
$('#edt-serie form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  const erreur = (texte) => {
    e.preventDefault();
    $('#serie-erreur').textContent = texte;
    $('#serie-erreur').hidden = false;
  };
  if ($('#serie-fin').value <= $('#serie-debut').value) return erreur('L’heure de fin doit être après l’heure de début.');
  if ($('#serie-du').value && $('#serie-au').value && $('#serie-au').value < $('#serie-du').value) {
    return erreur('La date de fin doit être après la date de début.');
  }
  serieEnCours = enregistrerSerieFormulaire();
});

export async function supprimerSerieEditee(x = serieEditee) {
  if (!x) return;
  const occurrences = (etat.devoirs ?? []).filter((d) => d.serie === x.id && !d.fait).length;
  const message = `Supprimer ce cours de la semaine type ?${occurrences ? `\n\n${pluriel(occurrences, 'devoir')} à lui rendre ${occurrences > 1 ? 'resteront rattachés' : 'restera rattaché'} à ${occurrences > 1 ? 'leur' : 'sa'} date.` : ''}`;
  if (!confirm(message)) return;
  $('#edt-serie').close();
  await stockage.supprimerSerie(x.id);
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Cours supprimé : ${edt.categorie(x.cle)?.nom ?? x.titre}, ${NOMS_JOURS[x.jour]} ${x.debut}`);
}

// Une matière ou une activité.
export let categorieEditee = null;
export let natureEditee = 'ecole';

export function ouvrirCategorie(cle = null, nature = 'ecole') {
  if (bloque('Modifier les matières et activités', () => ouvrirCategorie(cle, nature))) return;
  const c = cle ? edt.categorie(cle) : null;
  categorieEditee = c;
  natureEditee = c?.nature ?? nature;
  const perso = natureEditee === 'perso';
  $('#categorie-titre-dialogue').textContent = c
    ? (perso ? 'Modifier l’activité' : 'Modifier la matière') : (perso ? 'Nouvelle activité' : 'Nouvelle matière');
  $('#cat-nom').value = c?.nom ?? '';
  $('#cat-court').value = c?.court ?? '';
  const pictos = c?.picto && !PICTOS.includes(c.picto) ? [c.picto, ...PICTOS] : PICTOS;
  const picto = c?.picto ?? pictos[0];
  $('#cat-pictos').innerHTML = pictos.map((p) => `<label class="puce-picto"><input type="radio" name="cat-picto" value="${p}" ${p === picto ? 'checked' : ''}><span>${p}</span></label>`).join('');
  // Nouvelle catégorie : la première couleur encore libre.
  const prises = new Set([...edt.matieres(), ...edt.activites()].map((x) => x.couleur));
  const couleur = c?.couleur ?? PALETTE.find((x) => !prises.has(x)) ?? PALETTE[0];
  const palette = PALETTE.includes(couleur) ? PALETTE : [couleur, ...PALETTE];
  $('#cat-couleurs').innerHTML = palette.map((x) => `<label class="puce-couleur" title="${prises.has(x) && x !== c?.couleur ? 'Déjà utilisée' : 'Libre'}" data-css="--couleur:${x}">
    <input type="radio" name="cat-couleur" value="${x}" ${x === couleur ? 'checked' : ''} aria-label="Couleur ${x}${prises.has(x) && x !== c?.couleur ? ', déjà utilisée' : ''}">
    <span>${prises.has(x) && x !== c?.couleur ? '•' : ''}</span></label>`).join('');
  appliquerStyles($('#cat-couleurs'));
  $('#cat-champ-materiel').hidden = perso;
  $('#cat-materiel').value = c?.materiel ?? '';
  $('#cat-champ-confidentialite').hidden = !perso;
  document.querySelector(`input[name="cat-confidentialite"][value="${c?.confidentialite ?? 'discret'}"]`).checked = true;
  $('#cat-garder').checked = c?.garderCouleur ?? true;
  $('#cat-champ-vacances').hidden = !perso;
  $('#cat-pause-vacances').checked = c?.pauseVacances ?? false;
  $('#cat-supprimer').hidden = !c;
  $('#cat-erreur').hidden = true;
  $('#edt-categorie').showModal();
}

export async function enregistrerCategorieFormulaire() {
  const perso = natureEditee === 'perso';
  const nom = $('#cat-nom').value.trim();
  const toutes = [...edt.matieres(), ...edt.activites()];
  const categorie = {
    cle: categorieEditee?.cle ?? crypto.randomUUID(),
    nature: natureEditee,
    nom,
    court: $('#cat-court').value.trim() || nom.slice(0, 4),
    picto: document.querySelector('input[name="cat-picto"]:checked').value,
    couleur: document.querySelector('input[name="cat-couleur"]:checked').value,
    materiel: perso ? null : $('#cat-materiel').value.trim() || null,
    confidentialite: perso ? document.querySelector('input[name="cat-confidentialite"]:checked').value : null,
    garderCouleur: perso && $('#cat-garder').checked,
    pauseVacances: perso && $('#cat-pause-vacances').checked,
    ordre: categorieEditee?.ordre ?? Math.max(-1, ...toutes.map((x) => x.ordre ?? 0)) + 1,
  };
  try {
    await stockage.enregistrerCategorie(categorie);
    await rechargerTout();
    planifierSauvegarde();
    journaliser(`${perso ? 'Activité' : 'Matière'} ${categorieEditee ? 'modifiée' : 'ajoutée'} : ${nom}`);
  } catch (e) {
    journaliser(`${perso ? 'Activité' : 'Matière'} : échec (${e.message})`);
  }
}

export let categorieEnCours = Promise.resolve();
$('#edt-categorie form').addEventListener('submit', (e) => {
  if (e.submitter?.value === 'ok') categorieEnCours = enregistrerCategorieFormulaire();
});

// On ne supprime pas une matière encore utilisée : ses cours et ses devoirs
// n'auraient plus ni nom ni couleur.
export async function supprimerCategorieEditee() {
  const c = categorieEditee;
  if (!c) return;
  const cours = edt.series().filter((x) => x.cle === c.cle).length; // cours et événements
  const devoirs = (etat.devoirs ?? []).filter((d) => d.matiere.cle === c.cle).length;
  if (cours || devoirs) {
    $('#cat-erreur').textContent = `Impossible : ${[cours ? pluriel(cours, 'cours') : '', devoirs ? pluriel(devoirs, 'devoir') : ''].filter(Boolean).join(' et ')} ${cours + devoirs > 1 ? 'l’utilisent' : 'l’utilise'}. Supprimez-les ou changez-les d’abord.`;
    $('#cat-erreur').hidden = false;
    return;
  }
  if (!confirm(`Supprimer « ${c.nom} » ?`)) return;
  $('#edt-categorie').close();
  await stockage.supprimerCategorie(c.cle);
  await rechargerTout();
  planifierSauvegarde();
  journaliser(`Supprimé : ${c.nom}`);
}
