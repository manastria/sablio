'use strict';

// Processus principal : fenêtre, notifications, essai SQLite, captures d'écran.

const {
  app, BrowserWindow, Menu, Notification, clipboard, dialog, ipcMain, nativeTheme, screen,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Sous Windows, les notifications sont rattachées à cet identifiant.
app.setAppUserModelId('fr.manastria.mydevoirs.prototype');
// Le carillon de rappel doit pouvoir sonner sans clic préalable.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const depuisLancement = () => Math.round(process.uptime() * 1000);
const mesures = {};
const notificationsActives = new Set();
let fenetre = null;
let boundsNormaux = null;

const dossierCaptures = (() => {
  const i = process.argv.indexOf('--captures');
  return i >= 0 ? path.resolve(process.argv[i + 1] ?? 'captures') : null;
})();

// Les captures travaillent sur des données à part, recréées à chaque fois :
// elles ne touchent pas à la base du prototype.
if (dossierCaptures) {
  const donnees = path.join(dossierCaptures, 'donnees');
  fs.rmSync(donnees, { recursive: true, force: true });
  app.setPath('userData', donnees);
}

function creerFenetre() {
  const zone = screen.getPrimaryDisplay().workArea;
  // Les tailles sont en pixels logiques sur toutes les plateformes.
  fenetre = new BrowserWindow({
    width: Math.min(1100, zone.width),
    height: Math.min(760, zone.height),
    minWidth: 320,
    minHeight: 240,
    show: false,
    title: 'MyDevoirs – prototype',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#f6f4ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  fenetre.once('ready-to-show', () => {
    mesures.fenetrePrete = depuisLancement();
    fenetre.show();
  });
  fenetre.on('enter-full-screen', envoyerEtatFenetre);
  fenetre.on('leave-full-screen', envoyerEtatFenetre);
  fenetre.webContents.on('before-input-event', (_e, entree) => {
    if (entree.type === 'keyDown' && entree.key === 'F12') fenetre.webContents.toggleDevTools();
  });
  fenetre.on('closed', () => { fenetre = null; });
  fenetre.loadFile(path.join(__dirname, 'index.html'));
}

function envoyerEtatFenetre() {
  fenetre?.webContents.send('fenetre', {
    pleinEcran: fenetre.isFullScreen(),
    compact: boundsNormaux !== null,
  });
}

function quitterPleinEcran() {
  if (!fenetre.isFullScreen()) return Promise.resolve();
  return new Promise((resolve) => {
    const secours = setTimeout(resolve, 1000);
    fenetre.once('leave-full-screen', () => { clearTimeout(secours); resolve(); });
    fenetre.setFullScreen(false);
  });
}

// Petite fenêtre au premier plan, dans le coin de l'écran.
async function basculerCompact() {
  if (boundsNormaux) {
    fenetre.setAlwaysOnTop(false);
    fenetre.setMinimumSize(320, 240);
    fenetre.setBounds(boundsNormaux);
    boundsNormaux = null;
  } else {
    await quitterPleinEcran();
    if (fenetre.isMaximized()) fenetre.unmaximize();
    boundsNormaux = fenetre.getBounds();
    const zone = screen.getDisplayMatching(boundsNormaux).workArea;
    const demande = {
      x: zone.x + zone.width - 360 - 16,
      y: zone.y + zone.height - 180 - 16,
      width: 360,
      height: 180,
    };
    fenetre.setMinimumSize(240, 120);
    fenetre.setBounds(demande);
    fenetre.setAlwaysOnTop(true, 'floating');
    // Certains gestionnaires de fenêtres (Wayland) ignorent la position demandée.
    await new Promise((r) => setTimeout(r, 300));
    mesures.compact = { demande, obtenu: fenetre.getBounds(), premierPlan: fenetre.isAlwaysOnTop() };
  }
  envoyerEtatFenetre();
  return boundsNormaux !== null;
}

function notifier(titre, texte) {
  return new Promise((resolve) => {
    if (!Notification.isSupported()) {
      resolve('non prise en charge par le système');
      return;
    }
    // Le son est joué par l'application, pour être le même partout.
    const n = new Notification({ title: titre, body: texte, silent: true });
    notificationsActives.add(n); // garde une référence tant qu'elle est affichée
    const fin = (resultat) => { clearTimeout(minuterie); resolve(resultat); };
    const minuterie = setTimeout(() => fin('envoyée, sans confirmation d’affichage'), 3000);
    n.once('show', () => fin('affichée'));
    n.once('failed', (_e, erreur) => fin(`échec : ${erreur || 'aucun service de notification ne répond'}`));
    n.once('close', () => notificationsActives.delete(n));
    n.show();
  });
}

// Écrit 1000 lignes dans un fichier temporaire, le renomme (écriture atomique),
// relit le résultat puis efface le fichier.
function testerSqlite(dossier) {
  const final = path.join(dossier, 'mydevoirs-essai.sqlite');
  const temporaire = `${final}.tmp`;
  const debut = performance.now();
  try {
    fs.rmSync(temporaire, { force: true });
    const db = new DatabaseSync(temporaire);
    db.exec(`PRAGMA journal_mode = DELETE;
      CREATE TABLE devoir (
        id TEXT PRIMARY KEY, texte TEXT NOT NULL,
        modifie_le INTEGER NOT NULL, supprime INTEGER NOT NULL DEFAULT 0)`);
    const inserer = db.prepare('INSERT INTO devoir (id, texte, modifie_le) VALUES (?, ?, ?)');
    db.exec('BEGIN');
    for (let i = 0; i < 1000; i++) inserer.run(crypto.randomUUID(), `Devoir ${i}`, Date.now());
    db.exec('COMMIT');
    const { journal_mode: journal } = db.prepare('PRAGMA journal_mode').get();
    db.close();
    fs.renameSync(temporaire, final);
    const lecture = new DatabaseSync(final, { readOnly: true });
    const { n } = lecture.prepare('SELECT count(*) AS n FROM devoir').get();
    lecture.close();
    fs.rmSync(final, { force: true });
    return { ok: n === 1000, dossier, lignes: n, journal, ms: Math.round(performance.now() - debut) };
  } catch (e) {
    try { fs.rmSync(temporaire, { force: true }); } catch { /* rien à nettoyer */ }
    return { ok: false, dossier, erreur: e.message };
  }
}

function environnement() {
  const ecran = screen.getDisplayMatching(fenetre.getBounds());
  const sqlite = new DatabaseSync(':memory:');
  const { v: versionSqlite } = sqlite.prepare('SELECT sqlite_version() AS v').get();
  sqlite.close();
  return {
    systeme: `${os.type()} ${os.release()} (${process.platform}, ${process.arch})`,
    nomSysteme: typeof os.version === 'function' ? os.version() : '',
    wsl: Boolean(process.env.WSL_DISTRO_NAME),
    sessionGraphique: process.env.XDG_SESSION_TYPE
      || (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : ''),
    versions: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      sqlite: versionSqlite,
    },
    ecran: {
      taille: ecran.size,
      zoneUtile: ecran.workArea,
      facteur: ecran.scaleFactor,
      nombre: screen.getAllDisplays().length,
    },
    fenetre: { contenu: fenetre.getContentSize(), pleinEcran: fenetre.isFullScreen() },
    notifications: Notification.isSupported(),
    dossierDonnees: app.getPath('userData'),
    mesures,
  };
}

ipcMain.handle('environnement', () => environnement());
ipcMain.handle('notifier', (_e, titre, texte) => notifier(String(titre), String(texte)));
ipcMain.handle('tester-sqlite', () => testerSqlite(app.getPath('userData')));
ipcMain.handle('tester-sqlite-dossier', async () => {
  const choix = await dialog.showOpenDialog(fenetre, {
    title: 'Choisir un dossier pour l’essai (clé USB, drive…)',
    properties: ['openDirectory', 'createDirectory'],
  });
  return choix.canceled ? null : testerSqlite(choix.filePaths[0]);
});
ipcMain.handle('basculer-plein-ecran', () => {
  fenetre.setFullScreen(!fenetre.isFullScreen());
  return !fenetre.isFullScreen();
});
ipcMain.handle('basculer-compact', () => basculerCompact());
ipcMain.handle('copier', (_e, texte) => { clipboard.writeText(String(texte)); return true; });
ipcMain.on('premier-rendu', () => { mesures.premierRendu ??= depuisLancement(); });

// --- Captures automatiques (npm run captures) ---

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function faireCaptures(dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  const page = fenetre.webContents;
  const proto = (code) => page.executeJavaScript(`window.prototypeMyDevoirs.${code}`);
  const capturer = async (nom) => {
    await attendre(500);
    const image = await page.capturePage();
    fs.writeFileSync(path.join(dossier, `${nom}.png`), image.toPNG());
  };

  fenetre.setContentSize(1100, 720);
  // Lundi 23 novembre 2026 (semaine B).
  const scenarios = [
    ['1-cours-college', '2026-11-23T10:32', 'college'],
    ['2-pause-college', '2026-11-23T12:20', 'college'],
    ['3-fini-college', '2026-11-23T17:40', 'college'],
    ['4-avant-college', '2026-11-24T07:35', 'college'],
    ['5-cours-primaire', '2026-11-23T10:32', 'primaire'],
    ['6-cours-superieur', '2026-11-23T10:57', 'superieur'],
  ];
  for (const [nom, heure, profil] of scenarios) {
    await proto(`scenario(${JSON.stringify(heure)}, ${JSON.stringify(profil)})`);
    await capturer(nom);
  }

  fenetre.setContentSize(420, 720);
  await proto('scenario("2026-11-23T10:32", "college")');
  await capturer('7-etroit');
  fenetre.setContentSize(1100, 720);

  // Vue Jour. Le mode discret est automatique : actif pendant les cours.
  const jours = [
    ['9-jour-lundi-en-cours', '2026-11-23T10:32', '2026-11-23'],
    ['10-jour-mardi-discret', '2026-11-23T10:32', '2026-11-24'],
    ['11-jour-mardi-soir', '2026-11-23T19:00', '2026-11-24'],
    ['12-jour-mercredi-ds', '2026-11-23T19:00', '2026-11-25'],
    ['13-jour-vendredi-annule', '2026-11-23T19:00', '2026-11-27'],
    ['14-jour-lundi-soir', '2026-11-23T19:00', '2026-11-23'],
  ];
  for (const [nom, heure, jour] of jours) {
    await proto(`scenario(${JSON.stringify(heure)}, "college", "jour", ${JSON.stringify(jour)})`);
    await capturer(nom);
  }
  fenetre.setContentSize(420, 900);
  await proto('scenario("2026-11-23T10:32", "primaire", "jour", "2026-11-24")');
  await capturer('15-jour-etroit-primaire');
  fenetre.setContentSize(1100, 720);
  await proto('scenario("2026-11-23T10:58", "college", "jour", "2026-11-23")');
  await proto('ouvrirAjout()');
  await page.executeJavaScript(`document.querySelector('#ajout-texte').innerHTML =
    '<p><strong>Exercices 4 et 5 p. 82</strong></p><ul><li>refaire le schéma</li><li>justifier chaque réponse</li></ul>'`);
  await capturer('16-saisie');
  await proto('fermerAjout()');
  await proto('scenario("2026-11-23T19:00", "college", "jour", "2026-11-24")');
  await capturer('18-jour-texte-long');
  // « + » sur le cours d'anglais du jeudi 3 décembre.
  await proto('scenario("2026-11-23T19:00", "college", "jour", "2026-12-03")');
  await page.executeJavaScript(`document.querySelector('[data-ajouter-seance^="o|s4-0800-an"]').click()`);
  await capturer('20-plus-anglais');
  await proto('fermerAjout()');
  // En plein cours : le repère est dans le cours.
  await proto('scenario("2026-11-23T11:20", "college", "jour", "2026-11-23")');
  await capturer('21-jour-en-cours');
  // Vue Semaine : la semaine en cours (cours déplacé, cours annulé, DS), à 11 h 20.
  await proto('scenario("2026-11-23T11:20", "college", "semaine", "2026-11-23")');
  await capturer('22-semaine');
  await proto('scenario("2026-11-23T11:20", "college", "semaine", "2026-11-30")');
  await capturer('23-semaine-suivante');
  fenetre.setContentSize(420, 900);
  await proto('scenario("2026-11-23T11:20", "primaire", "semaine", "2026-11-23")');
  await capturer('24-semaine-etroit');
  fenetre.setContentSize(1100, 720);
  // Une séance : celle du DS de mercredi, avec son devoir.
  await proto('scenario("2026-11-23T19:00", "college", "jour", "2026-11-25")');
  await proto('ouvrirSeance("o|s3-1005-creneau")');
  await page.executeJavaScript(`document.querySelector('#seance input[value="deplace"]').click()`);
  await capturer('26-seance');
  await proto('fermerSeance()');
  await proto('scenario("2026-11-23T19:00", "college", "edt")');
  await capturer('27-emploi-du-temps');
  await page.executeJavaScript(`document.querySelector('[data-action="cycle-modifier"]').click();
    document.querySelector('#cycle-libelles').value = 'A, B, C';
    document.querySelector('#cycle-libelles').dispatchEvent(new Event('input', { bubbles: true }));`);
  await capturer('34-cycle');
  await page.executeJavaScript(`document.querySelector('#edt-cycle').close()`);
  await page.executeJavaScript(`document.querySelector('[data-serie="s3-1005-creneau"]').click()`);
  await capturer('28-cours');
  await page.executeJavaScript(`document.querySelector('#edt-serie').close()`);
  await page.executeJavaScript(`document.querySelector('[data-categorie="psy"]').click()`);
  await capturer('29-activite');
  await page.executeJavaScript(`document.querySelector('#edt-categorie').close()`);
  // Agenda : le dentiste de la démonstration (le mercredi qui suit le jour de
  // référence, ici le 25 novembre), la liste de l'agenda et la saisie.
  await proto('scenario("2026-11-23T19:00", "college", "jour", "2026-11-25")');
  await capturer('30-jour-dentiste');
  await proto('scenario("2026-11-23T19:00", "college", "edt")');
  await page.executeJavaScript(`document.querySelector('[data-evenement]').scrollIntoView({ block: 'center' })`);
  await capturer('32-agenda');
  await proto('scenario("2026-11-23T19:00", "college", "jour", "2026-11-25")');
  await page.executeJavaScript(`document.querySelector('[data-action="evenement-nouveau"]').click();
    document.querySelector('#evt-categorie').value = 'psy';
    document.querySelector('input[name="evt-repetition"][value="1"]').checked = true;
    document.querySelector('#evt-debut').value = '17:30';
    document.querySelector('#evt-fin').value = '18:15';
    document.querySelector('#evt-categorie').dispatchEvent(new Event('change', { bubbles: true }));`);
  await capturer('31-evenement');
  await page.executeJavaScript(`document.querySelector('#evenement').close()`);
  await proto('scenario("2026-11-26T19:00", "college", "jour", "2026-11-26")');
  await page.executeJavaScript(`document.querySelector('#menu').showPopover()`);
  await capturer('33-menu');
  await page.executeJavaScript(`document.querySelector('#menu').hidePopover()`);
  // Vacances de Noël en zone B.
  await proto('zoneVacances("B")');
  await proto('scenario("2026-12-22T10:00", "college")');
  await capturer('35-vacances-maintenant');
  await proto('scenario("2026-12-22T10:00", "college", "jour", "2026-12-22")');
  await capturer('36-vacances-jour');
  await proto('scenario("2026-12-17T19:00", "college", "semaine", "2026-12-21")');
  await capturer('37-vacances-semaine');
  await proto('scenario("2026-12-17T19:00", "college", "edt")');
  await page.executeJavaScript(`document.querySelector('[data-action="vacances-modifier"]').scrollIntoView({ block: 'center' })`);
  await capturer('38-vacances-edt');
  await proto('zoneVacances("")');
  await proto('scenario("2026-11-23T19:00", "college", "edt")');
  await proto('importEssai()');
  await capturer('39-import-emploi-du-temps');
  await page.executeJavaScript(`document.querySelector('#import-edt').close()`);
  await proto('scenario("2026-11-25T19:00", "college", "afaire")');
  await capturer('25-a-faire');
  await proto('scenario("2026-11-23T19:00", "college", "jour", "2026-11-24")');
  await proto('afficherDetail("Lire le chapitre 3")');
  await capturer('19-detail');
  await proto('fermerDetail()');
  await proto('essaisInterface()');
  await proto('scenario("2026-11-23T19:00", "college", "jour", "2026-11-27")');
  await capturer('17-apres-report');
  await proto('scenario("2026-11-23T17:40", "college")');

  await basculerCompact();
  await capturer('8-compact');
  await basculerCompact();

  await proto('lancerTests()');
  await proto('essaiRepartirDeZero()');
  const rapport = await proto('rapport()');
  fs.writeFileSync(path.join(dossier, 'rapport.txt'), rapport);
  console.log(rapport);
  app.quit();
}

// --- Démarrage ---

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    creerFenetre();
    if (dossierCaptures) {
      fenetre.webContents.once('did-finish-load', () => {
        attendre(800).then(() => faireCaptures(dossierCaptures)).catch((e) => {
          console.error(e);
          app.exit(1);
        });
      });
    }
  });
  app.on('window-all-closed', () => app.quit());
}
