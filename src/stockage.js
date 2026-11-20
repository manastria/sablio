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

function stockageMemoire(raison) {
  const devoirs = [];
  const indisponible = async () => { throw new Error(`indisponible (${raison})`); };
  return {
    info: { mode: `mémoire seulement, rien n'est enregistré (${raison})`, persistant: false, nombre: devoirs.length },
    devoirs: async () => devoirs.map((d) => ({ ...d })),
    marquer: async (id, fait) => { const d = devoirs.find((x) => x.id === id); if (d) d.fait = fait ? 1 : 0; },
    ajouter: async (devoir) => { devoirs.push({ ...devoir, fait: 0 }); },
    rattacher: async (id, champs) => { Object.assign(devoirs.find((x) => x.id === id) ?? {}, champs); },
    reinitialiser: indisponible,
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
    return stockageMemoire(e.message);
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
      rattacher: (id, champs) => appeler('rattacher', { id, ...champs }),
      reinitialiser: (graine) => appeler('reinitialiser', { graine }),
      exporter: () => appeler('exporter'),
      importer: (octets) => appeler('importer', { octets }, [octets.buffer]),
      effacer: () => appeler('effacer'),
    };
  } catch (e) {
    worker.terminate();
    return stockageMemoire(e.message);
  }
}
