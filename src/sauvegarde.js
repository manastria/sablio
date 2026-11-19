// Sauvegarde dans un fichier choisi par l'utilisateur (clé USB, dossier
// OneDrive…), avec l'API d'accès aux fichiers d'Edge et de Chrome.
// Le « handle » du fichier est gardé dans IndexedDB : on le retrouve d'une
// session à l'autre, mais le navigateur peut redemander l'autorisation.

const BASE = 'mydevoirs-reglages';
const MAGASIN = 'reglages';
const CLE = 'fichier-sauvegarde';

export const disponible = 'showSaveFilePicker' in window;

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

export const fichierEnregistre = () => magasin('readonly', (m) => m.get(CLE));

export async function choisirFichier() {
  const fichier = await showSaveFilePicker({
    suggestedName: 'mydevoirs-sauvegarde.sqlite',
    types: [{ description: 'Sauvegarde MyDevoirs', accept: { 'application/x-sqlite3': ['.sqlite'] } }],
  });
  await magasin('readwrite', (m) => m.put(fichier, CLE));
  return fichier;
}

// « granted », « prompt » ou « denied ». Avec `demander`, le navigateur peut
// afficher sa question : il faut alors être dans un clic de l'utilisateur.
export async function autorisation(fichier, demander = false) {
  const options = { mode: 'readwrite' };
  const etat = await fichier.queryPermission(options);
  if (etat === 'granted' || !demander) return etat;
  return fichier.requestPermission(options);
}

// createWritable écrit dans un fichier temporaire et ne remplace l'original
// qu'à la fermeture : une coupure en cours d'écriture n'abîme pas la sauvegarde.
export async function ecrire(fichier, octets) {
  const flux = await fichier.createWritable();
  await flux.write(octets);
  await flux.close();
}

export async function lireFichierChoisi() {
  const [fichier] = await showOpenFilePicker({
    types: [{ description: 'Sauvegarde MyDevoirs', accept: { 'application/x-sqlite3': ['.sqlite'] } }],
  });
  const contenu = await fichier.getFile();
  return { nom: contenu.name, octets: new Uint8Array(await contenu.arrayBuffer()) };
}
