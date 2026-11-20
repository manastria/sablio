// Couche « plateforme » : Electron fournit window.sablio (voir preload.js) ;
// dans un navigateur ou une fois installée en PWA, on utilise les API du web.
// Aussi : son des rappels, installation de la PWA, service worker.

import { $, journaliser } from './commun.js';
import { affichage } from './discret.js';
import { stockage } from './donnees.js';

export const dansElectron = Boolean(window.sablio);
export const enPWA = !dansElectron && 'serviceWorker' in navigator && location.protocol.startsWith('http');

export async function notifierNavigateur(titre, texte) {
  if (!('Notification' in window)) return 'non prise en charge';
  if (Notification.permission !== 'granted') {
    return Notification.permission === 'denied' ? 'refusée par l’utilisateur' : 'pas encore autorisée';
  }
  const options = { body: texte, icon: 'icones/icone-192.png', tag: titre };
  // Passer par le service worker permet de revenir à l'application d'un clic.
  const enregistrement = enPWA ? await navigator.serviceWorker.getRegistration() : null;
  if (enregistrement) {
    await enregistrement.showNotification(titre, options);
    return 'affichée (service worker)';
  }
  new Notification(titre, options);
  return 'affichée (page)';
}

export async function environnementNavigateur() {
  const stockage = navigator.storage;
  const estimation = await stockage?.estimate?.();
  const mo = (octets) => `${(octets / 1e6).toFixed(1)} Mo`;
  return {
    systeme: navigator.userAgent,
    versions: {},
    mesures: {},
    navigateur: {
      'Mode d’affichage': matchMedia('(display-mode: standalone)').matches
        ? 'application installée (fenêtre dédiée)' : 'onglet du navigateur',
      'Service worker': navigator.serviceWorker?.controller ? 'actif (hors ligne possible)' : 'inactif',
      'Réseau': navigator.onLine ? 'en ligne' : 'hors ligne',
      'Stockage persistant': (await stockage?.persisted?.()) ? 'oui' : 'non (le navigateur peut effacer les données)',
      'Stockage utilisé': estimation ? `${mo(estimation.usage)} sur ${mo(estimation.quota)} autorisés` : '?',
      'Notifications': 'Notification' in window ? `autorisation : ${Notification.permission}` : 'non prises en charge',
      'Incrustation (compact)': 'documentPictureInPicture' in window ? 'disponible' : 'indisponible',
    },
  };
}

export const api = window.sablio ?? {
  environnement: environnementNavigateur,
  notifier: notifierNavigateur,
  testerSqlite: async () => ({ ok: false, erreur: 'pas encore dans la version navigateur' }),
  testerSqliteDossier: async () => ({ ok: false, erreur: 'pas encore dans la version navigateur' }),
  basculerPleinEcran: async () => (document.fullscreenElement
    ? document.exitFullscreen() : document.documentElement.requestFullscreen()),
  basculerCompact: null, // à faire : incrustation de document (Document Picture-in-Picture)
  copier: (texte) => navigator.clipboard.writeText(texte),
  premierRendu: () => {},
  surFenetre: () => {},
};
// Les navigateurs n'autorisent le son qu'après une première interaction :
// on prépare le contexte audio au premier clic ou à la première touche.
export let audio = null;
export function deverrouillerSon() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* pas de son disponible */ }
}
document.addEventListener('pointerdown', deverrouillerSon, { once: true });
document.addEventListener('keydown', deverrouillerSon, { once: true });

export function jouerCarillon() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime + 0.05;
    for (const [frequence, decalage] of [[659.25, 0], [880, 0.2]]) {
      const oscillateur = audio.createOscillator();
      const volume = audio.createGain();
      oscillateur.type = 'sine';
      oscillateur.frequency.value = frequence;
      volume.gain.setValueAtTime(0.0001, t + decalage);
      volume.gain.exponentialRampToValueAtTime(0.25, t + decalage + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + decalage + 0.9);
      oscillateur.connect(volume).connect(audio.destination);
      oscillateur.start(t + decalage);
      oscillateur.stop(t + decalage + 1);
    }
    return `joué (état audio : ${audio.state})`;
  } catch (e) {
    return `échec : ${e.message}`;
  }
}
// --- Version navigateur : installation, hors-ligne, rappels ---

export let invitationInstallation = null;

export async function installer() {
  if (!invitationInstallation) return;
  invitationInstallation.prompt();
  const { outcome } = await invitationInstallation.userChoice;
  journaliser(`Installation : ${outcome === 'accepted' ? 'acceptée' : 'refusée'}`);
  invitationInstallation = null;
  $('[data-action="installer"]').hidden = true;
}

// Les navigateurs n'acceptent de demander l'autorisation qu'après un clic.
export async function activerRappels() {
  const reponse = await Notification.requestPermission();
  journaliser(`Autorisation des notifications : ${reponse}`);
  $('[data-action="activer-rappels"]').hidden = reponse !== 'default';
}

export function preparerNavigateur() {
  // Fonctions propres à Electron, absentes de la version navigateur.
  for (const bouton of document.querySelectorAll('[data-action="compact"], [data-action^="test-sqlite"]')) bouton.hidden = true;
  if ('Notification' in window && Notification.permission === 'default') {
    $('[data-action="activer-rappels"]').hidden = false;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // on garde l'invitation pour notre propre bouton
    invitationInstallation = e;
    $('[data-action="installer"]').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    $('[data-action="installer"]').hidden = true;
    journaliser('Application installée');
  });
  if (!enPWA) return;
  // Une nouvelle version du service worker a pris la main : on recharge une fois.
  const avaitUnServiceWorker = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (avaitUnServiceWorker) location.reload();
  });
  navigator.serviceWorker.register('./sw.js')
    .catch((e) => journaliser(`Service worker : échec (${e.message})`));
  // Demande au navigateur de ne pas effacer les données de lui-même.
  navigator.storage?.persist?.().then((ok) => journaliser(`Stockage persistant : ${ok ? 'accordé' : 'refusé'}`));
}
