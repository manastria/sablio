// Copie SQLite WebAssembly de node_modules vers src/vendor/sqlite, pour que la
// page le serve elle-même (aucun CDN : l'application doit marcher hors ligne).
// Lancé automatiquement après `npm install`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(racine, 'node_modules', '@sqlite.org', 'sqlite-wasm', 'dist');
const destination = path.join(racine, 'src', 'vendor', 'sqlite');

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
for (const fichier of ['index.mjs', 'sqlite3.wasm']) {
  fs.copyFileSync(path.join(source, fichier), path.join(destination, fichier));
}
console.log(`SQLite WebAssembly copié dans ${path.relative(racine, destination)}`);
