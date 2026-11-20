// Vérifie la version en ligne dans Chromium (Electron) : pas d'erreur dans la
// console, base SQLite ouverte dans le stockage privé, service worker actif
// (hors ligne possible), page de secours. Données à part, effacées à chaque fois.
//
//   npx electron scripts/verifier-en-ligne.js [adresse]
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const adresse = process.argv.find((a) => a.startsWith('https://')) ?? 'https://sablio.manastria.fr/';
const donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'sablio-en-ligne-'));
app.setPath('userData', donnees);

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const fenetre = new BrowserWindow({ width: 1100, height: 720, show: false });
  const erreurs = [];
  fenetre.webContents.on('console-message', (e) => {
    const { level, message } = e;
    if (level === 'error' || level === 3) erreurs.push(message);
  });
  const page = (code) => fenetre.webContents.executeJavaScript(code);
  const resultats = [];
  const verifier = (nom, ok, detail = '') => resultats.push(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ` : ${detail}` : ''}`);

  await fenetre.loadURL(`${adresse}?heure=2026-11-23T10:32&vue=jour&jour=2026-11-24`);
  await attendre(4000);
  const journal = await page(`document.querySelector('#journal').textContent`);
  verifier('base SQLite dans le stockage privé', /Base : OPFS/.test(journal), journal.match(/Base : [^\\n]*/)?.[0]?.slice(0, 80));
  verifier('vue Jour affichée', await page(`!!document.querySelector('#jour-edt .seance')`));
  verifier('devoirs chargés', await page(`!document.querySelector('#jour-devoirs').textContent.includes('Chargement')`));

  // Au deuxième chargement, le service worker contrôle la page : hors ligne possible.
  await fenetre.loadURL(adresse);
  await attendre(3000);
  verifier('service worker actif', await page(`!!navigator.serviceWorker.controller`));
  const image = await fenetre.webContents.capturePage();
  fs.mkdirSync('captures', { recursive: true });
  fs.writeFileSync('captures/en-ligne.png', image.toPNG());

  await fenetre.loadURL(new URL('secours', adresse).href);
  await attendre(1000);
  verifier('page de secours', await page(`document.title`) === 'Sablio – code oublié');

  verifier('aucune erreur dans la console', erreurs.length === 0, erreurs.join(' | ').slice(0, 300));
  console.log(resultats.join('\n'));
  fs.rmSync(donnees, { recursive: true, force: true });
  app.exit(resultats.some((r) => r.startsWith('ÉCHEC')) ? 1 : 0);
});
