# Prototype jetable de Sablio : « Maintenant / Ensuite » et vue Jour

But : juger la pile technique (Electron, interface web, SQLite intégré) et l'ergonomie des vues avant d'écrire l'application. Le code n'est pas destiné à être conservé tel quel. Les fonctions sont décrites dans `docs/refonte/specification.md`.

Emploi du temps de démonstration, modifiable : une semaine type de collégien avec semaines A/B, un créneau « DS » sans matière fixe (mercredi matin) et quatre activités personnelles (football, psychologue, orthophonie, piano). Les devoirs sont enregistrés (voir plus bas).

## Lancer

```sh
cd refonte/prototype
npm install
npm start            # fenêtre normale
npm run captures     # 39 captures d'écran + rapport.txt (avec des essais d'interface) dans captures/, puis quitte
```

Dans la fenêtre :

- **Plein écran** : icône de l'en-tête ou `F11`. `F12` ouvre les outils de développement.
- Dans le **menu** (☰) :
  - **Profil** : Primaire, Collège, Supérieur (taille, vocabulaire, nombre de devoirs affichés) ;
  - **Mode compact** : petite fenêtre au premier plan, dans le coin de l'écran ;
  - **Réglages et outils** : réglages du profil, heure simulée (avance rapide, vitesse × 60), données et sauvegarde, essais (notification, son, SQLite, fluidité), relevé de l'environnement, copie du rapport.

Un rappel (notification + carillon) part 5 minutes avant chaque cours.

## Vues

- **Maintenant** (accueil) : séance en cours, temps restant, séance suivante, frise du jour, devoirs à faire. Après le dernier cours, la frise laisse la place à « Préparer le sac » pour le prochain jour de classe.
- **Jour** : emploi du temps du jour avec le repère « Vous êtes ici », devoirs à rendre ce jour (avec leur progression), travail du soir, sac à préparer. Pour changer de jour : les boutons `←` `Aujourd’hui` `→`, les touches `←` `→`, ou la bande des jours de la semaine (`«` `»` pour changer de semaine). Le champ **Aller à** accepte un numéro de semaine (`48`, `48/2027`), une date (`25/12`, `25 décembre`) ou un jour (`demain`, `lundi`).

- **À faire** : tous les devoirs non faits, groupés par échéance (en retard, aujourd'hui, demain, cette semaine, la semaine prochaine, plus tard).
- **Semaine** : une ligne par jour, les séances en bandes de couleur sur une échelle horaire commune, les devoirs à rendre et leur progression. Un clic sur un jour ouvre la vue Jour. Le week-end, la semaine suivante s'affiche directement.

**Menu → Emploi du temps et agenda** ouvre la saisie de la semaine type (cours, semaines alternées réglables comme dans MyDevoirs, période de validité), des matières (pictogramme, couleur, matériel) et des activités personnelles (confidentialité en mode discret).

**+ Événement** (vues Jour et Semaine, écran Emploi du temps) ajoute un rendez-vous à l'agenda : une activité (le psychologue) ou un titre libre (le dentiste), une date, des heures, et éventuellement une répétition (« chaque semaine, 3 fois »). La démonstration contient un rendez-vous chez le dentiste.

**Pour l'ergothérapeute** : dans l'écran Emploi du temps, **Exporter l'emploi du temps** produit un fichier JSON (matières, activités, cours, événements, vacances, semaines alternées) ; **Importer un emploi du temps…** le reprend sur l'ordinateur de la famille, en remplacement ou en ajout, sans doublon. Le prénom de l'élève figure dans le titre et le nom du fichier ; **Nouvel emploi du temps (vide)** prépare l'élève suivant. Notice : `docs/refonte/notice-professionnel.md`.

**Verrou** (facultatif) : dans **Réglages et outils → Verrou de la configuration**, un code à 4 chiffres protège l'emploi du temps, les séances, les réglages et les données. L'élève garde ses devoirs, peut ajouter des événements et basculer le mode discret. Le code ouvre le mode adulte pour 10 minutes. Code oublié : la fenêtre du code donne un code de demande ; la page `secours.html` (servie avec l'application, à publier sur sablio.manastria.fr/secours) en déduit un code de secours valable le jour même.

**Vacances** : dans l'écran Emploi du temps, section « Vacances et jours sans cours », choisir la zone (dates officielles 2026-2028 incluses), les jours fériés, et ajouter des périodes (stage, examens). Ces jours-là, les cours disparaissent ; les activités continuent, sauf celles qui « s'arrêtent pendant les vacances ».

Un clic sur une séance de la vue Jour permet de la dire annulée ou déplacée (avec un motif), puis de la rétablir ; ses devoirs la suivent.

Un clic sur un devoir l'ouvre (texte complet, échéance, cours, boutons **Modifier** et **Supprimer**) ; seule la case le marque fait. Le devoir de français de la démonstration montre une longue consigne mise en forme, comme sur l'ENT.

Ce que la démonstration montre :

- **le devoir suit son cours** : le cours d'histoire-géographie du premier lundi est déplacé au lendemain 16 h 35, et son devoir le suit ;
- **cours annulé** : la SVT du vendredi suivant est annulée ; son devoir affiche un avertissement et un bouton « Reporter au prochain cours de SVT » ;
- **créneau à matière variable** : le DS du mercredi prend la matière et la couleur du devoir qui lui est rattaché (« DS · Mathématiques ») ;
- **« à faire le »** : l'exercice de physique pour jeudi est prévu le mardi (le mercredi après-midi est pris par le football) ;
- **mode discret** (bouton dans l'en-tête) : le psychologue et l'orthophonie deviennent « Rendez-vous ». Le psychologue garde sa couleur, l'orthophonie passe en gris. Les notifications sont toujours neutres pour ces activités.

**+ Devoir**, ou **+** sur un cours de l'emploi du temps, ouvre la saisie. On choisit d'abord **à rendre quand** : un jour (les dix prochains jours de classe, ou une autre date), puis un cours de ce jour ; la matière s'en déduit (sauf pour le DS ou « Sans cours précis »). Le travail s'écrit dans une zone de texte riche (gras, italique, souligné, listes) ; un texte collé depuis l'ENT garde sa mise en forme, nettoyée (`src/contenu.js`).

L'en-tête ne garde que l'essentiel : onglets, **Mode discret**, plein écran et **menu** (☰). Le menu contient l'emploi du temps et l'agenda, le profil, le mode compact, les réglages et outils, et les actions ponctuelles (installer, activer les rappels, reprendre la sauvegarde). Un point rouge sur l'icône signale les rappels à activer ou la sauvegarde à reprendre.

Dans **Menu → Réglages et outils → Réglages du profil** : mode discret manuel, automatique (pendant les cours, par défaut) ou toujours actif (une désactivation dure 30 minutes, ou jusqu'à la réouverture) ; champ « à faire le » proposé ou non ; sac préparé la veille au soir (par défaut) ou le matin même.

**Menu → Réglages et outils → Repartir de zéro (usage réel)** efface tout (devoirs, cours, activités, événements, vacances, réglages, code du verrou) et ne garde que la liste des matières ; la démonstration ne revient plus ensuite, même après un rechargement. Les sauvegardes des jours précédents restent dans le dossier.

**Menu → Réglages et outils → Réinitialiser la démonstration** remplace les devoirs par ceux de la démonstration, calculés à partir d'aujourd'hui. C'est utile avec une base créée par une version précédente du prototype : ses devoirs sont conservés, mais rattachés à une date et non à un cours.

## Version navigateur, installable (PWA)

La même page fonctionne sans Electron. Il faut la servir en HTTP : les modules ES ne se chargent pas depuis `file://`, et le *service worker* exige HTTPS ou `localhost`.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 -d src
```

Depuis WSL, le serveur est joignable par Edge sous Windows à l'adresse `http://localhost:8765/index.html`.

- **Installer l'application** (bouton dans l'en-tête, ou icône dans la barre d'adresse d'Edge) : elle obtient sa fenêtre et une entrée dans le menu Démarrer.
- **Activer les rappels** : le navigateur demande l'autorisation d'afficher des notifications.
- **Hors ligne** : une fois la page ouverte une première fois, elle fonctionne serveur arrêté.
- `?heure=2026-11-23T10:32&profil=primaire` fige l'horloge et choisit le profil ; `&vue=jour&jour=2026-11-24` ouvre la vue Jour sur ce jour (`&vue=semaine` : la vue Semaine).
- Le mode compact n'est pas encore disponible dans cette version.

## Données et sauvegarde

Les devoirs sont dans une base SQLite (WebAssembly) enregistrée dans le stockage privé du navigateur (OPFS), dans Electron comme dans Edge. Le schéma est en version 3 (`PRAGMA user_version`) : une base plus ancienne est migrée à l'ouverture, et une base plus récente que le prototype est refusée. `npm install` copie SQLite dans `src/vendor/sqlite/` (fichiers non versionnés) : il faut l'avoir lancé avant de servir `src/`.

Dans **Menu → Réglages et outils → Données** :

- **Choisir le dossier de sauvegarde** : ensuite, chaque modification est sauvegardée au bout de 2 secondes, dans un fichier par jour (`sablio-2026-11-20.sqlite`) ; les 10 derniers jours sont gardés. Une mauvaise manipulation n'écrase que la sauvegarde du jour, et une base vide n'est jamais sauvegardée. Tant qu'aucun dossier n'est choisi, le menu le propose avec un point rouge ;
- **Restaurer celle-ci** : remplace les données par une des sauvegardes datées du dossier ; **Restaurer depuis un autre fichier** : depuis n'importe quel fichier (un fichier invalide est refusé) ;
- **Simuler une perte de données** : vide la base du navigateur, sans toucher au fichier. La sauvegarde automatique est alors suspendue, pour ne pas écraser le fichier avec une base vide.

Si le navigateur demande de nouveau l'autorisation d'écrire dans le dossier, **Reprendre la sauvegarde** apparaît dans le menu (point rouge sur l'icône).

Une seule fenêtre à la fois peut ouvrir la base ; les autres affichent un avertissement.

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
| `src/emploi-du-temps.js` | Données et calculs de temps, sans DOM : séries, exceptions, occurrences, semaines A/B, états de la journée, temps relatif, démonstration |
| `src/app.js` | Point d'entrée de l'interface : charge les modules, démarre |
| `src/app/commun.js` | Socle : constantes, état, horloge, préférences, utilitaires (ne dépend d'aucun autre module) |
| `src/app/rendu.js`, `discret.js`, `plateforme.js` | Rendu et accueil, mode discret, couche plateforme (Electron ou navigateur) |
| `src/app/jour.js`, `semaine.js`, `afaire.js`, `sac.js`, `seance.js` | Vues Jour, Semaine, À faire ; sac ; fenêtre d'une séance |
| `src/app/devoirs.js` | Devoirs : listes, détail, saisie, report |
| `src/app/emploi-du-temps.js`, `agenda.js`, `jours-sans-cours.js`, `echange.js` | Écran Emploi du temps : cours, matières, activités, cycle ; agenda ; vacances ; export et import |
| `src/app/verrou.js`, `donnees.js`, `outils.js`, `actions.js`, `fenetres.js` | Verrou, base et sauvegardes, panneau d'outils, actions et clavier, fenêtres |
| `src/app/essais.js` | Essais d'interface lancés par les captures (propre au prototype) |
| `src/secours.js`, `src/secours.html`, `src/secours-page.js` | Code adulte oublié : code de demande et code de secours du jour |
| `src/vacances.js` | Vacances scolaires officielles (zones A, B, C), à mettre à jour chaque année |
| `src/contenu.js` | Nettoyage du texte mis en forme d'un devoir, version brute |
| `src/index.html`, `src/style.css` | Page et styles (thème clair et sombre) |
| `src/stockage.js`, `src/stockage-worker.js` | Base SQLite (WebAssembly, OPFS) dans un worker, avec repli en mémoire |
| `src/sauvegarde.js` | Sauvegarde et restauration dans un fichier choisi |
| `scripts/copier-sqlite.mjs` | Copie SQLite WebAssembly dans `src/vendor/` (après `npm install`) |
| `src/manifest.json`, `src/icones/` | Rendent la page installable (nom, icônes, fenêtre dédiée) |
| `src/sw.js` | *Service worker* : hors-ligne, retour à l'application au clic sur une notification |
| `scripts/preparer-windows.mjs` | Assemble la version Windows portable depuis Linux |
| `scripts/icones.py` | Dessine les icônes (Pillow) |
