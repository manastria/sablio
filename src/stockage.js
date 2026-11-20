// Accès aux données depuis la page. La base vit dans un worker
// (stockage-worker.js) ; si le worker ne démarre pas, on garde les données
// en mémoire pour que l'application reste utilisable.

const DELAI_OUVERTURE = 15_000;

function client(worker) {
  let suivant = 0;
  const enAttente = new Map();
  worker.addEventListener('message', ({ data }) => {
    const promesse = enAttente.get(data.id);
    if (!promesse) return;
    enAttente.delete(data.id);
    if (data.erreur) promesse.reject(new Error(data.erreur));
    else promesse.resolve(data.resultat);
  });
  worker.addEventListener('error', (e) => {
    for (const promesse of enAttente.values()) promesse.reject(new Error(e.message || 'le worker de stockage a échoué'));
    enAttente.clear();
  });
  return (op, args, transfert = []) => new Promise((resolve, reject) => {
    suivant += 1;
    enAttente.set(suivant, { resolve, reject });
    worker.postMessage({ id: suivant, op, args }, transfert);
  });
}

function stockageMemoire(raison, graine) {
  const devoirs = [];
  const edt = { categories: graine?.categories ?? [], series: graine?.series ?? [], exceptions: graine?.exceptions ?? [], reglages: {}, periodes: [] };
  const remplacer = (liste, cle, x) => {
    const i = liste.findIndex((y) => cle(y) === cle(x));
    if (i >= 0) liste[i] = x; else liste.push(x);
  };
  const retirer = (liste, test) => { const i = liste.findIndex(test); if (i >= 0) liste.splice(i, 1); };
  const indisponible = async () => { throw new Error(`indisponible (${raison})`); };
  return {
    info: { mode: `mémoire seulement, rien n'est enregistré (${raison})`, persistant: false, nombre: devoirs.length },
    devoirs: async () => devoirs.map((d) => ({ ...d })),
    marquer: async (id, fait) => { const d = devoirs.find((x) => x.id === id); if (d) d.fait = fait ? 1 : 0; },
    ajouter: async (devoir) => { devoirs.push({ ...devoir, fait: 0 }); },
    modifier: async (devoir) => { Object.assign(devoirs.find((x) => x.id === devoir.id) ?? {}, devoir); },
    supprimer: async (id) => { const i = devoirs.findIndex((x) => x.id === id); if (i >= 0) devoirs.splice(i, 1); },
    rattacher: async (id, champs) => { Object.assign(devoirs.find((x) => x.id === id) ?? {}, champs); },
    reinitialiser: indisponible,
    emploiDuTemps: async () => structuredClone(edt),
    enregistrerReglage: async (cle, valeur) => { edt.reglages[cle] = valeur; },
    enregistrerPeriode: async (x) => remplacer(edt.periodes, (y) => y.id, x),
    supprimerPeriode: async (id) => retirer(edt.periodes, (y) => y.id === id),
    importerEmploiDuTemps: indisponible,
    enregistrerCategorie: async (x) => remplacer(edt.categories, (y) => y.cle, x),
    enregistrerSerie: async (x) => remplacer(edt.series, (y) => y.id, x),
    enregistrerException: async (x) => remplacer(edt.exceptions, (y) => `${y.serie}@${y.dateOrigine}`, x),
    supprimerCategorie: async (cle) => retirer(edt.categories, (y) => y.cle === cle),
    supprimerSerie: async (id) => retirer(edt.series, (y) => y.id === id),
    supprimerException: async (serie, dateOrigine) => retirer(edt.exceptions, (y) => y.serie === serie && y.dateOrigine === dateOrigine),
    exporter: indisponible,
    importer: indisponible,
    effacer: async () => { devoirs.length = 0; return { nombre: 0 }; },
  };
}

export async function ouvrirStockage(graine) {
  let worker;
  try {
    worker = new Worker(new URL('./stockage-worker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    return stockageMemoire(e.message, graine);
  }
  const appeler = client(worker);
  try {
    const info = await Promise.race([
      appeler('ouvrir', { graine }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), DELAI_OUVERTURE)),
    ]);
    return {
      info,
      devoirs: () => appeler('devoirs'),
      marquer: (id, fait) => appeler('marquer', { id, fait }),
      ajouter: (devoir) => appeler('ajouter', { devoir }),
      modifier: (devoir) => appeler('modifier', { devoir }),
      supprimer: (id) => appeler('supprimer', { id }),
      rattacher: (id, champs) => appeler('rattacher', { id, ...champs }),
      reinitialiser: (graine) => appeler('reinitialiser', { graine }),
      emploiDuTemps: () => appeler('emploiDuTemps'),
      enregistrerReglage: (cle, valeur) => appeler('enregistrerReglage', { cle, valeur }),
      enregistrerPeriode: (periode) => appeler('enregistrerPeriode', { periode }),
      supprimerPeriode: (id) => appeler('supprimerPeriode', { id }),
      importerEmploiDuTemps: (edt, remplacer) => appeler('importerEmploiDuTemps', { edt, remplacer }),
      enregistrerCategorie: (categorie) => appeler('enregistrerCategorie', { categorie }),
      enregistrerSerie: (serie) => appeler('enregistrerSerie', { serie }),
      enregistrerException: (exception) => appeler('enregistrerException', { exception }),
      supprimerCategorie: (cle) => appeler('supprimerCategorie', { cle }),
      supprimerSerie: (id) => appeler('supprimerSerie', { id }),
      supprimerException: (serie, dateOrigine) => appeler('supprimerException', { serie, dateOrigine }),
      exporter: () => appeler('exporter'),
      importer: (octets) => appeler('importer', { octets }, [octets.buffer]),
      effacer: () => appeler('effacer'),
    };
  } catch (e) {
    worker.terminate();
    return stockageMemoire(e.message, graine);
  }
}
