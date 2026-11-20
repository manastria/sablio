// Prépare une version Windows portable du prototype dans dist/windows,
// depuis Linux ou WSL : télécharge Electron pour Windows et y copie l'application.
// Aucune installation : on lance dist/windows/Sablio-prototype.exe.

import { downloadArtifact } from '@electron/get';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paquet = JSON.parse(fs.readFileSync(path.join(racine, 'package.json'), 'utf8'));
const version = paquet.devDependencies.electron;
const destination = path.join(racine, 'dist', 'windows');

const archive = await downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: 'x64' });
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
execFileSync('unzip', ['-q', archive, '-d', destination]);
fs.renameSync(path.join(destination, 'electron.exe'), path.join(destination, 'Sablio-prototype.exe'));

const app = path.join(destination, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
fs.cpSync(path.join(racine, 'src'), path.join(app, 'src'), { recursive: true });
fs.copyFileSync(path.join(racine, 'package.json'), path.join(app, 'package.json'));

console.log(`Electron ${version} pour Windows prêt dans ${destination}`);
