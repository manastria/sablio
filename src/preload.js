'use strict';

// Seul pont entre la page et le système : la page n'a pas accès à Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mydevoirs', {
  environnement: () => ipcRenderer.invoke('environnement'),
  notifier: (titre, texte) => ipcRenderer.invoke('notifier', titre, texte),
  testerSqlite: () => ipcRenderer.invoke('tester-sqlite'),
  testerSqliteDossier: () => ipcRenderer.invoke('tester-sqlite-dossier'),
  basculerPleinEcran: () => ipcRenderer.invoke('basculer-plein-ecran'),
  basculerCompact: () => ipcRenderer.invoke('basculer-compact'),
  copier: (texte) => ipcRenderer.invoke('copier', texte),
  premierRendu: () => ipcRenderer.send('premier-rendu'),
  surFenetre: (rappel) => ipcRenderer.on('fenetre', (_e, etat) => rappel(etat)),
});
