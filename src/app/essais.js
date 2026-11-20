// Essais d'interface pour les captures automatiques (main.js) et accès
// window.sablioEssais. Propre au prototype.

import * as edt from '../emploi-du-temps.js';
import * as sauvegarde from '../sauvegarde.js';
import { nettoyerHtml } from '../contenu.js';
import { codeSecours, lisible } from '../secours.js';
import { actions } from './actions.js';
import { evenementEnCours, majChampsEvenement, ouvrirEvenement, supprimerEvenementEdite } from './agenda.js';
import { $, etat, journaliser, maintenant } from './commun.js';
import { afficherDetail, ajoutEnCours, cleSeance, ouvrirAjout, reporter, saisie } from './devoirs.js';
import { basculerDiscret, changerModeDiscret, discret } from './discret.js';
import { actionsDonnees, preparerDemo, rafraichirDemoPerimee, rechargerTout, stockage } from './donnees.js';
import { exportEmploiDuTemps, importEnCours, proposerImport, viderEmploiDuTemps } from './echange.js';
import { categorieEnCours, cycleEnCours, majChampsSerie, majCycle, ouvrirCategorie, ouvrirCycle, ouvrirSerie, serieEnCours, supprimerCategorieEditee, supprimerSerieEditee } from './emploi-du-temps.js';
import { allerAuJour, texteSemaine } from './jour.js';
import { ouvrirVacances, vacancesEnCours } from './jours-sans-cours.js';
import { changerProfil, lancerTests, rapport } from './outils.js';
import { reglerHorloge, rendre } from './rendu.js';
import { majChampsSeance, ouvrirSeance, seanceEnCours } from './seance.js';
import { DUREE_ADULTE, adulte, demandeSecours, enregistrerVerrou, ouvrirReglageVerrou, verrouEnCours, verrouiller } from './verrou.js';

// Essai des actions sans clic, pour les captures automatiques : saisie,
// report d'un devoir dont le cours est annulé, bouton du mode discret.
export async function essaisInterface() {
  const avant = etat.devoirs.length;
  // Aller à : une semaine, puis une saisie fausse.
  etat.vue = 'jour';
  rendre(true);
  $('#aller-saisie').value = '50';
  $('#aller').requestSubmit();
  const apresSemaine = `${edt.isoLocal(etat.jour)} (${texteSemaine(etat.jour, maintenant())})`;
  $('#aller-saisie').value = '31/02';
  $('#aller').requestSubmit();
  journaliser(`Essai aller à : « 50 » → ${apresSemaine} ; « 31/02 » → ${$('#aller-erreur').hidden ? 'accepté à tort' : `refusé (${$('#aller-erreur').textContent})`}`);
  $('#aller-saisie').value = '';
  $('#aller-erreur').hidden = true;

  // Saisie sur un jour à venir : il faut choisir le cours avant d'enregistrer.
  ouvrirAjout();
  $('#ajout-texte').innerHTML = 'Sans cours choisi';
  $('#ajout form').requestSubmit($('#ajout button[value="ok"]'));
  journaliser(`Essai saisie sans cours : ${$('#ajout').open && !$('#ajout-erreur-rendu').hidden ? 'refusée, la fenêtre reste ouverte' : 'acceptée à tort'}`);
  $('#ajout').close();
  allerAuJour(maintenant());

  // Nettoyage : un contenu dangereux, analysé sans être exécuté.
  const piege = '<p onclick="x()">Texte <b>gras</b><script>alert(1)</script><img src="x" onerror="alert(1)"> <a href="javascript:alert(1)">lien</a> <a href="https://exemple.fr">site</a></p>';
  journaliser(`Essai nettoyage : ${nettoyerHtml(piege)}`);
  ouvrirAjout();
  $('#ajout-texte').innerHTML = '<p>Essai <strong>automatique</strong></p><ul><li>premier point</li><li>second point</li></ul>';
  const choix = $('input[name="rendu-seance"]:checked')?.closest('label').textContent.trim().replace(/\s+/g, ' ');
  $('#ajout form').requestSubmit($('#ajout button[value="ok"]'));
  await ajoutEnCours;
  const ajoute = etat.devoirs.find((d) => d.texte.startsWith('Essai automatique'));
  if (!ajoute) {
    journaliser(`Essai saisie : ÉCHEC, rien n'a été ajouté (choix « ${choix} »)`);
    return;
  }
  journaliser(`Essai texte brut : ${JSON.stringify(ajoute?.texte)}`);
  journaliser(`Essai saisie : ${etat.devoirs.length - avant} devoir ajouté (${ajoute?.matiere.nom}, « ${choix} »), à rendre ${ajoute ? edt.dateLongue(ajoute.rendu) : '?'}, rattaché ${ajoute?.serie ? 'au cours' : 'à une date'}`);
  const annule = etat.devoirs.find((d) => d.seance?.statut === 'annule');
  if (annule) {
    await reporter(annule.id);
    const apres = etat.devoirs.find((d) => d.id === annule.id);
    journaliser(`Essai report : « ${apres.texte} » ${edt.dateLongue(annule.rendu)} → ${edt.dateLongue(apres.rendu)} à ${edt.heureTexte(apres.seance.debut)} (${apres.seance.statut})`);
  } else {
    journaliser('Essai report : aucun devoir sur un cours annulé');
  }
  const etats = [etat.discret];
  basculerDiscret();
  etats.push(etat.discret);
  basculerDiscret();
  etats.push(etat.discret);
  journaliser(`Essai mode discret (${etat.reglages.discret}) : ${etats.map((x) => (x ? 'actif' : 'inactif')).join(' → ')}`);

  // Séance : on déplace celle du DS (un devoir y est rattaché), puis on la rétablit.
  const ds = etat.devoirs.find((d) => d.seance?.nature === 'creneau');
  if (ds) {
    const avantDeplacement = edt.dateLongue(ds.rendu);
    ouvrirSeance(cleSeance(ds.seance));
    $('#seance input[value="deplace"]').checked = true;
    majChampsSeance();
    $('#seance-date').value = edt.isoLocal(edt.ajouterJours(ds.seance.debut, 1));
    $('#seance-debut').value = '14:00';
    $('#seance-fin').value = '15:50';
    $('#seance-motif').value = 'essai';
    $('#seance form').requestSubmit($('#seance button[value="ok"]'));
    await seanceEnCours;
    const deplace = etat.devoirs.find((d) => d.id === ds.id);
    const apresDeplacement = `${edt.dateLongue(deplace.rendu)} à ${edt.heureTexte(deplace.seance.debut)} (${deplace.seance.statut})`;
    ouvrirSeance(cleSeance(deplace.seance));
    $('#seance input[value="normal"]').checked = true;
    $('#seance form').requestSubmit($('#seance button[value="ok"]'));
    await seanceEnCours;
    const retabli = etat.devoirs.find((d) => d.id === ds.id);
    journaliser(`Essai séance : « ${ds.texte} » ${avantDeplacement} → déplacée : ${apresDeplacement} → rétablie : ${edt.dateLongue(retabli.rendu)} (${retabli.seance.statut})`);
  }

  // Emploi du temps : nouvelle activité, cours du samedi, puis suppression.
  ouvrirCategorie(null, 'perso');
  $('#cat-nom').value = 'Équitation';
  document.querySelector('input[name="cat-picto"][value="🐴"]').checked = true;
  $('#edt-categorie form').requestSubmit($('#edt-categorie button[value="ok"]'));
  await categorieEnCours;
  const equitation = edt.activites().find((x) => x.nom === 'Équitation');
  ouvrirSerie(null, 6);
  $('#serie-categorie').value = equitation.cle;
  majChampsSerie();
  $('#serie-debut').value = '10:00';
  $('#serie-fin').value = '11:30';
  $('#serie-salle').value = 'Centre équestre';
  $('#edt-serie form').requestSubmit($('#edt-serie button[value="ok"]'));
  await serieEnCours;
  const samedi = edt.ajouterJours(edt.lundi(maintenant()), 5);
  const auCentre = edt.coursDuJour(samedi).map((o) => `${o.titre} ${edt.heureTexte(o.debut)}`).join(', ');
  ouvrirCategorie(equitation.cle);
  await supprimerCategorieEditee();
  const refus = $('#cat-erreur').hidden ? 'acceptée à tort' : 'refusée';
  $('#edt-categorie').close();
  const confirmer = window.confirm;
  window.confirm = () => true;
  await supprimerSerieEditee(edt.series().find((x) => x.cle === equitation.cle));
  ouvrirCategorie(equitation.cle);
  await supprimerCategorieEditee();
  window.confirm = confirmer;
  journaliser(`Essai emploi du temps : couleur ${equitation.couleur}, samedi ${edt.isoLocal(samedi)} → ${auCentre || 'rien'} ; suppression de l’activité utilisée ${refus} ; après suppression : ${edt.activites().some((x) => x.nom === 'Équitation') ? 'encore là' : 'retirée'}`);

  // Agenda : RDV psy le mercredi suivant à 17 h 30, trois semaines de suite.
  const mercredi = edt.ajouterJours(edt.lundi(edt.ajouterJours(maintenant(), 7)), 2);
  ouvrirEvenement(null, edt.isoLocal(mercredi));
  $('#evt-categorie').value = 'psy';
  document.querySelector('input[name="evt-repetition"][value="1"]').checked = true;
  $('#evt-fois').value = '3';
  $('#evt-debut').value = '17:30';
  $('#evt-fin').value = '18:15';
  majChampsEvenement();
  const resume = $('#evt-resume').textContent;
  $('#evenement form').requestSubmit($('#evenement button[value="ok"]'));
  await evenementEnCours;
  const rdv = [0, 7, 14, 21].map((j) => edt.coursDuJour(edt.ajouterJours(mercredi, j), (o) => o.cle === 'psy').length);
  const confirmerEvt = window.confirm;
  window.confirm = () => true;
  await supprimerEvenementEdite(edt.evenements().find((x) => x.cle === 'psy'));
  window.confirm = confirmerEvt;
  journaliser(`Essai agenda : « ${resume} » ; psy les mercredis ${rdv.join('/')} (attendu 1/1/1/0) ; après suppression : ${edt.evenements().some((x) => x.cle === 'psy') ? 'encore là' : 'retiré'}`);

  // Clic à côté : le détail se ferme ; une saisie modifiée demande d'abord.
  const clicDehors = (dialogue) => {
    for (const type of ['pointerdown', 'click']) {
      dialogue.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 2, clientY: 2 }));
    }
  };
  afficherDetail(etat.devoirs[0].id);
  clicDehors($('#detail'));
  const detailFerme = !$('#detail').open;
  ouvrirAjout();
  $('#ajout').dataset.modifie = '1';
  const confirmerClic = window.confirm;
  window.confirm = () => false;
  clicDehors($('#ajout'));
  const saisieGardee = $('#ajout').open;
  window.confirm = () => true;
  clicDehors($('#ajout'));
  window.confirm = confirmerClic;
  journaliser(`Essai clic à côté : détail ${detailFerme ? 'fermé' : 'resté ouvert'} ; saisie modifiée ${saisieGardee ? 'gardée si on refuse' : 'fermée à tort'}, ${$('#ajout').open ? 'restée ouverte à tort' : 'fermée si on accepte'}`);

  // Cycle : on dit que cette semaine est la A, puis on revient au réglage d'origine.
  const lettreAvant = edt.lettreSemaine(maintenant());
  ouvrirCycle();
  majCycle(lettreAvant === 'A' ? 'B' : 'A');
  $('#edt-cycle form').requestSubmit($('#edt-cycle button[value="ok"]'));
  await cycleEnCours;
  const lettreApres = edt.lettreSemaine(maintenant());
  const lundiSemaine = edt.lundi(maintenant());
  const svtOuPc = edt.coursDuJour(lundiSemaine).filter((o) => o.cle === 'svt' || o.cle === 'pc').map((o) => o.cle).join('+');
  ouvrirCycle();
  majCycle(lettreAvant);
  $('#edt-cycle form').requestSubmit($('#edt-cycle button[value="ok"]'));
  await cycleEnCours;
  journaliser(`Essai cycle : semaine ${lettreAvant} → ${lettreApres} (lundi 13 h 30 : ${svtOuPc}) → ${edt.lettreSemaine(maintenant())}`);

  // Verrou : code 1234, puis on verrouille ; le cycle demande le code.
  ouvrirReglageVerrou();
  $('#verrou-nouveau').value = '1234';
  $('#verrou-confirmation').value = '1234';
  $('#verrou-reglage form').requestSubmit($('#verrou-reglage button[value="ok"]'));
  await verrouEnCours;
  verrouiller();
  ouvrirCycle();
  const codeDemande = $('#verrou').open && !$('#edt-cycle').open;
  $('#verrou-code').value = '0000';
  $('#verrou form').requestSubmit($('#verrou button[value="ok"]'));
  await new Promise((r) => setTimeout(r, 100));
  const mauvaisRefuse = !$('#verrou-erreur').hidden && !$('#edt-cycle').open;
  $('#verrou-code').value = '1234';
  $('#verrou form').requestSubmit($('#verrou button[value="ok"]'));
  await new Promise((r) => setTimeout(r, 100));
  const cycleOuvert = $('#edt-cycle').open;
  $('#edt-cycle').close();
  // Code oublié : code de demande, code de secours calculé comme la page web.
  verrouiller();
  ouvrirCycle();
  actions['code-oublie']();
  const demande = demandeSecours;
  $('#verrou-code').value = await codeSecours(demande, edt.isoLocal(new Date()));
  $('#verrou form').requestSubmit($('#verrou button[value="ok"]'));
  await new Promise((r) => setTimeout(r, 150));
  const secoursOk = adulte() && $('#verrou-reglage').open;
  $('#verrou-reglage').close();
  $('#edt-cycle').close();
  journaliser(`Essai code oublié : demande ${lisible(demande)} → ${secoursOk ? 'mode adulte ouvert, nouveau code proposé' : 'ÉCHEC'}`);
  const evenementLibre = (() => { verrouiller(); ouvrirEvenement(null); const ok = $('#evenement').open; $('#evenement').close(); return ok; })();
  // Un événement ajouté par l'élève (sous verrou) se modifie sans code ;
  // celui de l'adulte (le dentiste de la démonstration) demande le code.
  verrouiller();
  ouvrirEvenement(null, edt.isoLocal(maintenant()));
  $('#evt-titre').value = 'Anniversaire de Léa';
  $('#evenement form').requestSubmit($('#evenement button[value="ok"]'));
  await evenementEnCours;
  const anniversaire = edt.evenements().find((x) => x.titre === 'Anniversaire de Léa');
  ouvrirEvenement(anniversaire.id);
  const sienLibre = $('#evenement').open && !$('#verrou').open;
  $('#evenement').close();
  ouvrirEvenement('e-dentiste');
  const adulteProtege = $('#verrou').open && !$('#evenement').open;
  $('#verrou').close();
  // L'événement « close » arrive après : on l'attend, sinon l'ouverture du
  // mode adulte qui suit ferait rejouer l'action refusée.
  await new Promise((r) => setTimeout(r, 50));
  etat.adulteJusqua = Date.now() + DUREE_ADULTE;
  await stockage.supprimerSerie(anniversaire.id);
  await rechargerTout();
  journaliser(`Essai événements de l’élève : auteur « ${anniversaire.auteur} » ; le sien ${sienLibre ? 'modifiable sans code' : 'BLOQUÉ'} ; celui de l’adulte ${adulteProtege ? 'demande le code' : 'NON protégé'}`);
  await enregistrerVerrou(null);
  journaliser(`Essai verrou : code demandé ${codeDemande ? 'oui' : 'NON'} ; mauvais code ${mauvaisRefuse ? 'refusé' : 'accepté à tort'} ; bon code → cycle ${cycleOuvert ? 'ouvert' : 'NON ouvert'} ; ajout d’événement libre ${evenementLibre ? 'oui' : 'NON'} ; verrou retiré ${etat.verrou ? 'NON' : 'oui'}`);

  // Vacances : zone B ; le 22 décembre 2026 (Noël) n'a plus de cours, le psy
  // continue, le foot s'arrête ; puis on revient à « aucune zone ».
  ouvrirVacances();
  document.querySelector('input[name="vacances-zone"][value="B"]').checked = true;
  $('#edt-vacances form').requestSubmit($('#edt-vacances button[value="ok"]'));
  await vacancesEnCours;
  const noel = (d) => edt.coursDuJour(edt.dateDepuisIso(d)).map((o) => o.cle || o.titre).join('+') || 'rien';
  const pendant = `mar. 22/12 : ${noel('2026-12-22')} ; mer. 23/12 : ${noel('2026-12-23')}`;
  const reprise = edt.isoLocal(edt.prochainJourDeCours(edt.dateDepuisIso('2026-12-21'), edt.estEcole).jour);
  ouvrirVacances();
  document.querySelector('input[name="vacances-zone"][value=""]').checked = true;
  $('#edt-vacances form').requestSubmit($('#edt-vacances button[value="ok"]'));
  await vacancesEnCours;
  journaliser(`Essai vacances : ${pendant} (attendu psy, puis rien) ; reprise ${reprise} (attendu 2027-01-04) ; 11 novembre : ${noel('2026-11-11')} (férié)`);

  // Sauvegardes datées : 12 jours écrits dans un dossier d'essai (stockage
  // privé, même API qu'un vrai dossier) ; on doit en garder 10, les plus récentes.
  try {
    const racine = await navigator.storage.getDirectory();
    const dossierEssai = await racine.getDirectoryHandle('essai-sauvegardes', { create: true });
    const octets = await stockage.exporter();
    for (let i = 0; i < 12; i++) {
      await sauvegarde.ecrireDuJour(dossierEssai, octets, edt.isoLocal(edt.ajouterJours(new Date(2026, 10, 1), i)));
    }
    await sauvegarde.ecrireDuJour(dossierEssai, octets, '2026-11-12'); // même jour : réécrit
    const liste = await sauvegarde.lister(dossierEssai);
    const relu = await sauvegarde.lire(dossierEssai, liste[0].nom);
    await racine.removeEntry('essai-sauvegardes', { recursive: true });
    journaliser(`Essai sauvegardes datées : ${liste.length} gardées (attendu ${sauvegarde.GARDER}), de ${liste.at(-1).date} à ${liste[0].date} ; relecture ${relu.length === octets.length ? 'identique' : 'DIFFÉRENTE'}`);
  } catch (e) {
    journaliser(`Essai sauvegardes datées : échec (${e.message})`);
  }

  // Échange de l'emploi du temps : export, puis import d'un fichier « préparé
  // ailleurs » (identifiants différents, une matière en plus) en ajout, puis
  // réimport de l'export d'origine en remplacement.
  const exporte = await exportEmploiDuTemps();
  const ailleurs = structuredClone(exporte);
  for (const c of ailleurs.categories) c.cle = `ergo-${c.cle}`;
  for (const x of ailleurs.series) { x.id = `ergo-${x.id}`; if (x.cle) x.cle = `ergo-${x.cle}`; }
  ailleurs.categories.push({ cle: 'ergo-latin', nature: 'ecole', nom: 'Latin', court: 'Lat', picto: '📜', couleur: '#6d4c41', ordre: 99 });
  ailleurs.series.push({ id: 'ergo-latin-1', cle: 'ergo-latin', jour: 6, debut: '09:00', fin: '10:00', salle: 'L1' });
  proposerImport(ailleurs, 'essai.json');
  const resumeImport = $('#import-edt-resume').textContent;
  document.querySelector('input[name="import-mode"][value="ajouter"]').checked = true;
  $('#import-edt form').requestSubmit($('#import-edt button[value="ok"]'));
  await importEnCours;
  const apresAjout = `${edt.matieres().length} matières (dont Latin : ${edt.matieres().some((m) => m.nom === 'Latin') ? 'oui' : 'non'}), ${edt.semaineType().length} cours`;
  proposerImport(exporte, 'origine.json');
  $('#import-edt form').requestSubmit($('#import-edt button[value="ok"]'));
  await importEnCours;
  const apresRemplacement = `${edt.matieres().length} matières, ${edt.semaineType().length} cours`;
  // Nouvel élève : on vide (matières gardées), on nomme, on exporte, puis on
  // réimporte l'export d'origine (prénom absent → retiré).
  await viderEmploiDuTemps(false);
  const apresVide = `${edt.matieres().length} matières, ${edt.activites().length} activités, ${edt.series().length} cours et événements`;
  await stockage.enregistrerReglage('eleve', { nom: 'Léo' });
  await rechargerTout();
  const exportLeo = await exportEmploiDuTemps();
  proposerImport(exportLeo, 'leo.json');
  const resumeLeo = $('#import-edt-resume').textContent;
  $('#import-edt').close();
  proposerImport(exporte, 'origine.json');
  $('#import-edt form').requestSubmit($('#import-edt button[value="ok"]'));
  await importEnCours;
  journaliser(`Essai nouvel élève : après « vide » → ${apresVide} ; export « ${exportLeo.eleve} » (« ${resumeLeo.slice(0, 40)}… ») ; après réimport : prénom « ${etat.eleve} », ${edt.semaineType().length} cours`);
  journaliser(`Essai échange d’emploi du temps : « ${resumeImport.slice(0, 90)}… » ; ajout → ${apresAjout} ; remplacement par l’export → ${apresRemplacement} (attendu ${exporte.categories.filter((c) => c.nature === 'ecole').length} matières, ${exporte.series.filter((x) => x.type !== 'evenement').length} cours)`);

  // Modification : on ouvre le devoir, on le modifie, on enregistre.
  afficherDetail(ajoute.id);
  actions['modifier-devoir']();
  $('#ajout-texte').innerHTML += '<p>Ligne ajoutée</p>';
  $('#ajout form').requestSubmit($('#ajout button[value="ok"]'));
  await ajoutEnCours;
  const modifie = etat.devoirs.find((d) => d.id === ajoute.id);
  journaliser(`Essai modification : ${etat.devoirs.length} devoirs, texte ${JSON.stringify(modifie?.texte)}, détail ${$('#detail').open ? 'rouvert' : 'fermé'}`);
  $('#detail').close();
}
// Accès pour les captures automatiques (main.js).
window.sablioEssais = {
  scenario(iso, profil, vue = 'maintenant', jour = null) {
    changerProfil(profil);
    etat.vue = vue;
    etat.jour = jour ? edt.dateDepuisIso(jour) : edt.debutJour(new Date(iso));
    etat.semaine = edt.lundi(etat.jour);
    reglerHorloge({ date: new Date(iso), vitesse: 0 });
  },
  modeDiscret: changerModeDiscret,
  ouvrirAjout,
  fermerAjout: () => $('#ajout').close(),
  essaisInterface,
  ouvrirSeance: (debutCle) => ouvrirSeance(document.querySelector(`[data-seance^="${debutCle}"]`).dataset.seance),
  fermerSeance: () => $('#seance').close(),
  afficherDetail: (texte) => afficherDetail(etat.devoirs.find((d) => d.texte.startsWith(texte))?.id),
  fermerDetail: () => $('#detail').close(),
  // Dernier essai (il efface tout) : « Repartir de zéro ».
  async essaiRepartirDeZero() {
    // Démonstration intacte et vieille de 10 jours : recalculée au démarrage.
    const aujourdhui = edt.isoLocal(edt.debutJour(maintenant()));
    await stockage.reinitialiser(preparerDemo(edt.ajouterJours(edt.debutJour(maintenant()), -10)));
    await rechargerTout();
    await rafraichirDemoPerimee();
    const recalculee = etat.demo?.demo?.reference === aujourdhui;
    const bandeauDemo = !$('#bandeau-demo').hidden;
    const pointEnDemo = !$('[data-champ="point-menu"]').hidden;
    // « Garder ce qui est saisi » : la base devient réelle, le bandeau part.
    $('#usage-reel').showModal();
    $('#usage-reel form').requestSubmit($('#usage-reel button[value="garder"]'));
    await new Promise((r) => setTimeout(r, 300));
    journaliser(`Essai démonstration : périmée → ${recalculee ? 'recalculée pour aujourd’hui' : 'NON recalculée'} ; bandeau ${bandeauDemo ? 'affiché' : 'NON affiché'} ; point rouge en démonstration ${pointEnDemo ? 'affiché à tort' : 'absent'} ; « garder » → ${etat.demo?.reelle && $('#bandeau-demo').hidden ? 'usage réel, bandeau retiré' : 'ÉCHEC'}`);
    const confirmer = window.confirm;
    window.confirm = () => true;
    await actionsDonnees['repartir-zero']();
    window.confirm = confirmer;
    const d = await stockage.emploiDuTemps();
    journaliser(`Essai repartir de zéro : ${etat.devoirs.length} devoirs, ${edt.matieres().length} matières, ${edt.activites().length} activités, ${edt.series().length} cours et événements, base marquée réelle : ${d.reglages?.base?.reelle ? 'oui' : 'NON'}`);
  },
  // Pour les captures : la fenêtre d'import avec l'emploi du temps actuel.
  async importEssai() {
    proposerImport(await exportEmploiDuTemps(), 'sablio-emploi-du-temps-ergo.json');
  },
  // Pour les captures : choisir la zone de vacances sans passer par la fenêtre.
  async zoneVacances(zone) {
    await stockage.enregistrerReglage('vacances', { zone, feries: true });
    await rechargerTout();
  },
  lancerTests,
  rapport,
};
