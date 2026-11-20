# Sablio : notes de développement

Application web installable (PWA) en JavaScript, sans framework ni étape de construction : les fichiers de `src/` sont servis tels quels. SQLite compilé en WebAssembly dans un worker, stockage privé du navigateur (OPFS). Electron sert seulement aux captures et essais automatiques (et à une version Windows non signée, bloquée par le Contrôle intelligent des applications). Issu de MyDevoirs (`~/projets/mydevoirs`), qui continue à part.

Tout est en français : interface, code (noms, commentaires), documents, messages de commit (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).

## Lancer et vérifier

- `npm install` une fois : copie SQLite dans `src/vendor/sqlite/` (non versionné).
- `python3 -m http.server 8765 --bind 127.0.0.1 -d src`, puis `http://localhost:8765/index.html` dans Edge sous Windows (depuis WSL). `?heure=2026-11-23T10:32&vue=jour&jour=2026-11-24` fige l'horloge.
- **Avant chaque commit : `npm run verifier`** = `npm test` (node:test, logique sans DOM, sans dépendance) + `npm run captures` (Electron sous WSLg : 43 captures dans `captures/` et essais d'interface ; la commande échoue si un essai échoue). Les captures écrivent leurs données dans `captures/donnees`, recréé à chaque fois.
- Une modification de l'interface se vérifie en regardant les captures, pas seulement les essais.

## Repères dans le code

- `src/emploi-du-temps.js` : logique pure (séries, exceptions, occurrences, cycle A/B, vacances, jours fériés, temps relatif, « Aller à »). Testée dans `tests/`.
- `src/app/*.js` : interface en modules ES. `commun.js` est le socle et **ne doit importer aucun autre module de `app/`** (sinon l'ordre d'évaluation casse). Un module ne peut pas réaffecter une variable importée : passer par une fonction du module qui la déclare.
- `src/schema.js` : schéma SQLite et migrations numérotées (`PRAGMA user_version`), partagé avec `tests/schema.test.mjs`. Toute nouvelle colonne = nouvelle migration + test.
- `src/vacances.js` : vacances officielles des zones A, B, C (data.education.gouv.fr), **à mettre à jour chaque année**.
- Identifiants de stockage préfixés `sablio-` (localStorage, IndexedDB, OPFS `.sablio`, cache du service worker, verrou de fenêtre). Changer le nom de la base ou du dossier OPFS fait perdre les données des utilisateurs.
- Chaque nouveau fichier de `src/` doit être ajouté à la liste `FICHIERS` de `src/sw.js`, et `CACHE` incrémenté à chaque publication qui change des fichiers.

## Publier

- `scripts/publier.sh --essai`, puis `npm run publier`, puis `npm run verifier-en-ligne`. Hébergement Infomaniak via rclone, partage `infomaniak-web`, dossier `sites/sablio.manastria.fr` (chemin relatif). Ne jamais synchroniser plus large : d'autres sites sont dans `sites/`.
- `web/.htaccess` (HTTPS, types MIME `.mjs` et `.wasm`, pas de cache pour la page et le service worker, `/secours`) est publié avec le site.

## Git et GitHub

- Dépôt `manastria/sablio` (privé). Claude prépare tout en local et commite à chaque étape ; le mainteneur pousse lui-même.
