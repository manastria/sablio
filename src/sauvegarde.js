// Sauvegardes datées dans un dossier choisi par l'utilisateur (clé USB,
// dossier OneDrive…), avec l'API d'accès aux fichiers d'Edge et de Chrome.
//
// Un fichier par jour (« sablio-2026-11-20.sqlite »), réécrit dans la journée ;
// on garde les GARDER derniers. Une mauvaise manipulation (base vidée,
// abîmée) n'écrase donc que la sauvegarde du jour : celles des jours
// précédents restent intactes.
//
// Le « handle » du dossier est gardé dans IndexedDB : on le retrouve d'une
// session à l'autre, mais le navigateur peut redemander l'autorisation.

const BASE = 'mydevoirs-reglages';
const MAGASIN = 'reglages';
const CLE = 'dossier-sauvegarde';
export const GARDER = 10;
const MOTIF = /^sablio-(\d{4}-\d{2}-\d{2})\.sqlite$/;

export const disponible = 'showDirectoryPicker' in window;

function magasin(mode, action) {
  return new Promise((resolve, reject) => {
    const ouverture = indexedDB.open(BASE, 1);
    ouverture.onupgradeneeded = () => ouverture.result.createObjectStore(MAGASIN);
    ouverture.onerror = () => reject(ouverture.error);
    ouverture.onsuccess = () => {
      const transaction = ouverture.result.transaction(MAGASIN, mode);
      const requete = action(transaction.objectStore(MAGASIN));
      transaction.oncomplete = () => { ouverture.result.close(); resolve(requete?.result); };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

export const dossierEnregistre = () => magasin('readonly', (m) => m.get(CLE));

export async function choisirDossier() {
  const dossier = await showDirectoryPicker({ id: 'sablio-sauvegardes', mode: 'readwrite' });
  await magasin('readwrite', (m) => m.put(dossier, CLE));
  return dossier;
}

// « granted », « prompt » ou « denied ». Avec `demander`, le navigateur peut
// afficher sa question : il faut alors être dans un clic de l'utilisateur.
export async function autorisation(dossier, demander = false) {
  const options = { mode: 'readwrite' };
  if (!dossier.queryPermission) return 'granted'; // stockage privé (essais)
  const etat = await dossier.queryPermission(options);
  if (etat === 'granted' || !demander) return etat;
  return dossier.requestPermission(options);
}

const nomDuJour = (iso) => `sablio-${iso}.sqlite`;

// Les sauvegardes du dossier, de la plus récente à la plus ancienne.
export async function lister(dossier) {
  const liste = [];
  for await (const [nom, entree] of dossier.entries()) {
    const m = nom.match(MOTIF);
    if (m && entree.kind === 'file') {
      const fichier = await entree.getFile();
      liste.push({ nom, date: m[1], taille: fichier.size, modifie: new Date(fichier.lastModified) });
    }
  }
  return liste.sort((a, b) => b.date.localeCompare(a.date));
}

// createWritable écrit dans un fichier temporaire et ne remplace l'original
// qu'à la fermeture : une coupure en cours d'écriture n'abîme pas la sauvegarde.
export async function ecrireDuJour(dossier, octets, iso) {
  const fichier = await dossier.getFileHandle(nomDuJour(iso), { create: true });
  const flux = await fichier.createWritable();
  await flux.write(octets);
  await flux.close();
  // On ne garde que les GARDER plus récentes.
  const anciennes = (await lister(dossier)).slice(GARDER);
  for (const s of anciennes) await dossier.removeEntry(s.nom);
  return { nom: nomDuJour(iso), supprimees: anciennes.length };
}

export async function lire(dossier, nom) {
  const fichier = await (await dossier.getFileHandle(nom)).getFile();
  return new Uint8Array(await fichier.arrayBuffer());
}

// Restaurer depuis n'importe quel fichier (une autre clé USB, un envoi…).
export async function lireFichierChoisi() {
  const [fichier] = await showOpenFilePicker({
    types: [{ description: 'Sauvegarde Sablio', accept: { 'application/x-sqlite3': ['.sqlite', '.sqlite3'] } }],
  });
  const contenu = await fichier.getFile();
  return { nom: contenu.name, octets: new Uint8Array(await contenu.arrayBuffer()) };
}
