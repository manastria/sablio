// Service worker : garde l'application en cache pour qu'elle fonctionne hors ligne.
//
// Stratégie du prototype : le réseau d'abord (les modifications sont visibles
// tout de suite pendant la mise au point), le cache si le réseau ne répond pas.
// L'application définitive mettra plutôt tout en cache d'un bloc, par version.

const CACHE = 'mydevoirs-prototype-5';
const DELAI_RESEAU = 3000;
const FICHIERS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './emploi-du-temps.js',
  './contenu.js',
  './vacances.js',
  './stockage.js',
  './stockage-worker.js',
  './sauvegarde.js',
  './vendor/sqlite/index.mjs',
  './vendor/sqlite/sqlite3.wasm',
  './manifest.json',
  './icones/favicon.png',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/icone-maskable-512.png',
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FICHIERS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil((async () => {
    for (const nom of await caches.keys()) {
      if (nom !== CACHE) await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

function avecDelai(promesse, ms) {
  return new Promise((resolve, reject) => {
    const minuterie = setTimeout(() => reject(new Error('délai dépassé')), ms);
    promesse.then(
      (valeur) => { clearTimeout(minuterie); resolve(valeur); },
      (erreur) => { clearTimeout(minuterie); reject(erreur); },
    );
  });
}

async function reseauPuisCache(requete) {
  const cache = await caches.open(CACHE);
  // Une seule entrée par fichier, quels que soient les paramètres (?heure=…).
  const cle = new URL(requete.url);
  cle.search = '';
  try {
    const reponse = await avecDelai(fetch(requete), DELAI_RESEAU);
    if (reponse.ok) await cache.put(cle.href, reponse.clone());
    return reponse;
  } catch {
    return (await cache.match(cle.href)) ?? Response.error();
  }
}

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET' || new URL(requete.url).origin !== self.location.origin) return;
  evenement.respondWith(reseauPuisCache(requete));
});

// Un clic sur une notification ramène la fenêtre de l'application au premier plan.
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  evenement.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (fenetres.length) return fenetres[0].focus();
    return self.clients.openWindow('./index.html');
  })());
});
