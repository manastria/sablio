# Prototype jetable : « Maintenant / Ensuite »

But : juger la pile technique (Electron, interface web, SQLite intégré) et l'ergonomie de la vue principale avant d'écrire l'application. Le code n'est pas destiné à être conservé tel quel.

Données en dur : une semaine type de collégien avec semaines A/B, six devoirs. Rien n'est enregistré, sauf le profil choisi.

## Lancer

```sh
cd refonte/prototype
npm install
npm start            # fenêtre normale
npm run captures     # 8 captures d'écran + rapport.txt dans captures/, puis quitte
```

Dans la fenêtre :

- **Profil** : Primaire, Collège, Supérieur (taille, vocabulaire, nombre de devoirs affichés).
- **Mode compact** : petite fenêtre au premier plan, dans le coin de l'écran.
- **Plein écran** : bouton ou `F11`. `F12` ouvre les outils de développement.
- **Outils** : heure simulée (avance rapide, vitesse × 60), essais (notification, son, SQLite, fluidité), relevé de l'environnement, copie du rapport.

Un rappel (notification + carillon) part 5 minutes avant chaque cours.

## Version navigateur, installable (PWA)

La même page fonctionne sans Electron. Il faut la servir en HTTP : les modules ES ne se chargent pas depuis `file://`, et le *service worker* exige HTTPS ou `localhost`.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 -d src
```

Depuis WSL, le serveur est joignable par Edge sous Windows à l'adresse `http://localhost:8765/index.html`.

- **Installer l'application** (bouton dans l'en-tête, ou icône dans la barre d'adresse d'Edge) : elle obtient sa fenêtre et une entrée dans le menu Démarrer.
- **Activer les rappels** : le navigateur demande l'autorisation d'afficher des notifications.
- **Hors ligne** : une fois la page ouverte une première fois, elle fonctionne serveur arrêté.
- Les devoirs cochés et le profil sont gardés d'une session à l'autre.
- `?heure=2026-11-23T10:32&profil=primaire` fige l'horloge et choisit le profil.
- SQLite et le mode compact ne sont pas encore disponibles dans cette version.

Les données sont liées à l'adresse : celles de `http://localhost:8765` ne seront pas visibles depuis une autre adresse.

## Version Windows portable

```sh
npm run preparer-windows   # dist/windows/MyDevoirs-prototype.exe (358 Mo décompressé)
```

L'exécutable n'est **pas signé** : le Contrôle intelligent des applications de Windows 11 le bloque (voir `docs/refonte/faisabilite.md`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/main.js` | Processus principal : fenêtre, mode compact, notifications, essai SQLite, captures |
| `src/preload.js` | Pont minimal entre la page et le système |
| `src/emploi-du-temps.js` | Données et calculs de temps, sans DOM (semaines A/B, états de la journée, textes) |
| `src/app.js` | Interface |
| `src/index.html`, `src/style.css` | Page et styles (thème clair et sombre) |
| `src/manifest.json`, `src/icones/` | Rendent la page installable (nom, icônes, fenêtre dédiée) |
| `src/sw.js` | *Service worker* : hors-ligne, retour à l'application au clic sur une notification |
| `scripts/preparer-windows.mjs` | Assemble la version Windows portable depuis Linux |
| `scripts/icones.py` | Dessine les icônes (Pillow) |
