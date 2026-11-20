# Sablio : spécification des fonctions

État : **en cours de rédaction**. Décisions du 20 novembre 2026. Les points marqués « à valider » sont des propositions.

Voir aussi [faisabilite.md](faisabilite.md) (contraintes, choix techniques) et [modele-recurrence.md](modele-recurrence.md) (séries, exceptions).

## Principe

L'environnement de l'enfant varie beaucoup : âge, activités, présence d'un adulte pour la saisie. Une fonction utile à l'un encombre l'autre. Règle générale : **rien n'impose une saisie de plus**. Les fonctions qui en demandent une sont facultatives et se règlent par profil. Ce que l'application peut déduire de l'emploi du temps, elle le déduit.

## Écrans

| Écran | Rôle |
|---|---|
| **Maintenant / Ensuite** | **Écran d'accueil.** Cours en cours, temps restant, cours suivant, frise du jour. Après le dernier cours : « Préparer le sac » et le travail du soir. |
| **Jour** | Emploi du temps du jour et devoirs du jour. Navigation jour par jour. |
| **Semaine** | Vue d'ensemble, légère : pastilles et progression par jour. Un clic sur un jour ouvre la vue Jour. |
| **À faire** | Devoirs non faits, groupés par échéance : en retard, pour aujourd'hui, pour demain, cette semaine, la semaine prochaine, plus tard ; devoirs faits repliés. En temps relatif (liste « À faire » de MyDevoirs). |
| **Emploi du temps** | Saisie de la semaine type (cours, créneaux, activités), des matières et des activités. Surtout pour l'adulte : bouton dans l'en-tête, pas dans les onglets de l'élève. |
| **Réglages** | Profil, sauvegarde. |

**Fenêtres** (détail d'un devoir, saisie, séance…) : elles se ferment par un clic à côté, par Échap ou par leur bouton. Une fenêtre de saisie déjà modifiée demande d'abord « Abandonner les modifications ? ».

**En-tête allégé** : l'heure et la date empilées, avec à côté un carré de semaine de la même hauteur (« sem. 48 » et la lettre du cycle), les onglets (Maintenant, Jour, Semaine, À faire), le bouton « Mode discret » (il doit rester à un clic) et deux icônes : plein écran et menu. Le reste est dans le **menu** : emploi du temps et agenda, profil, mode compact, réglages et outils, et les actions ponctuelles (installer l'application, activer les rappels, reprendre la sauvegarde). Un point rouge sur l'icône du menu signale seulement les actions importantes (rappels, sauvegarde) : Edge propose « Installer » dans tout onglet, même quand l'application est déjà installée.

### Vue Jour

```
← Demain · mardi 21 novembre →                  [Aujourd'hui]
┌ Emploi du temps ─────────┐ ┌ À rendre ce jour ──────── 1/3 ┐
│ 08:00 ▌Maths  📐 B12  •1 │ │ ☑ 📐 Exercices 4 et 5 p. 82   │
│ 09:00 ▌Français 📖       │ │ ☐ 📖 Lire le chapitre 3       │
│ ── vous êtes ici ──      │ │ ☐ 🧪 Finir le schéma          │
│ 14:00 ▌SVT 🧪  (annulé)  │ ├ Ce soir ──────────────────────┤
│ 17:30 ▌Rendez-vous       │ │ ☐ 📖 Lire le chapitre 3       │
└──────────────────────────┘ └───────────────────────────────┘
```

- En-tête en temps relatif (« Demain · mardi 21 novembre »).
- Navigation à gauche, **à une place fixe** quelle que soit la longueur du titre : jour précédent, « Aujourd'hui » (grisé si on y est déjà), jour suivant.
- **Numéro de semaine** (ISO, comme MyDevoirs) et lettre du cycle sous forme d'un **badge** « S48 | B », dans l'en-tête et au début de la bande des jours, plutôt qu'un texte répété. Le texte complet (« Semaine 48 (B) · semaine prochaine ») est dans l'infobulle et pour les lecteurs d'écran.
- **Aller à** : un champ qui accepte un numéro de semaine (`48`, `s48`, `48/2027` : on va au lundi), une date (`25/12`, `25/12/2026`, `2026-12-25`, `25 décembre`) ou un jour (`demain`, `après-demain`, `hier`, `lundi` = le prochain lundi). Sans année, on prend la plus proche d'aujourd'hui : `2` tapé en décembre vise janvier. Une saisie invalide (`31/02`) est refusée avec un message.
- **Bande des jours** de la semaine affichée, sous l'en-tête : un clic pour aller deux ou trois jours plus loin, le nombre de devoirs à rendre sur chaque jour, « « » et « » » pour changer de semaine. Les jours sans cours sont grisés.
- Un cours porte une pastille (`•1`) quand un devoir est à lui rendre.
- Pendant un cours, le repère « Vous êtes ici » est **dans ce cours** : une ligne qui descend avec le temps, et « En cours · encore 35 min ». Entre deux séances, il est entre elles.
- **Un clic sur une séance** l'ouvre : devoirs à lui rendre, et son état : « A lieu », « Annulée » ou « Déplacée » (jour, heures), avec un motif facultatif. Revenir à « A lieu » rétablit la séance. Les devoirs rattachés suivent la séance.
- Chaque cours à venir a un bouton **« + »** : ajouter un devoir à rendre à ce cours. Pour un devoir de la semaine prochaine : aller au jour (bande des jours ou « Aller à »), puis « + » sur le cours.
- Les exceptions se voient : cours annulé barré, cours déplacé avec une pastille.
- « Ce soir » : voir [Jour de travail](#jour-de-travail).
- Écran étroit : les deux colonnes passent l'une sous l'autre.

### Vue Semaine

Elle reste utile pour anticiper, mais MyDevoirs la rend trop chargée. Dans Sablio, **une ligne par jour** :

```
←  [Cette semaine]  →   [S48|B]  Cette semaine · 23 – 29 novembre      Aller à [    ]
7 devoirs à rendre · 0 fait
        8 h    9 h    10 h   11 h   12 h   13 h   14 h   15 h   16 h   17 h
Lun 23  [📖][📐] [┊🌍┊][💬•]|            [🧪][🏃      ]              📐 💬  ▭ 0/2
Mar 24  [⚙️     ] [📐][📖•]          [💬][🎵]       [┊🌍•┊][📍]          🌍 📖  ▭ 0/2
…
Samedi 28 et dimanche 29 : rien de prévu
```

- les séances en **bandes de couleur sur une échelle horaire commune** à la semaine, avec le pictogramme seul ; le détail est dans l'infobulle et dans la vue Jour ;
- une **pastille blanche** sur une séance à laquelle un devoir est à rendre ;
- les exceptions se voient : séance annulée **hachurée**, séance partie ailleurs en **pointillés**, séance arrivée d'ailleurs **bordée de pointillés** ;
- à droite, les devoirs à rendre ce jour (pictogrammes de leurs matières, estompés une fois faits) et la progression ;
- aujourd'hui est encadré, avec une **ligne rouge à l'heure actuelle** ; les séances passées sont estompées ;
- un jour de week-end vide est **replié** en une ligne (« Samedi 28 et dimanche 29 : rien de prévu ») ;
- **un clic sur un jour ouvre la vue Jour** ; le badge de semaine de la vue Jour ouvre la vue Semaine.

Navigation : semaine précédente / « Cette semaine » / suivante (et flèches du clavier), « Aller à » comme dans la vue Jour. Titre en temps relatif (« Semaine prochaine · 30 novembre – 6 décembre »), total des devoirs de la semaine.

Repris de MyDevoirs : semaine suivante affichée le week-end, numéro et lettre de semaine, « semaine prochaine » / « dans 3 semaines », saut à une date. Pas encore repris : le choix du premier jour de la semaine (le prototype commence le lundi).

### Emploi du temps

- **Semaine type**, une carte par jour : chaque cours (matière, activité ou créneau sans matière fixe comme le DS), ses heures, sa salle, ses semaines (toutes, A ou B) et, au besoin, une période de validité (« à partir du », « jusqu'au »). « + Ajouter » sur chaque jour ; le nouveau cours commence à la fin du dernier.
- **Matières** : nom, abrégé, pictogramme (choix dans une liste), couleur (palette de couleurs distinctes ; les couleurs déjà prises sont marquées, la première libre est proposée), matériel pour « Préparer le sac ».
- **Activités personnelles** : mêmes champs, plus la confidentialité en mode discret (visible, discret, masqué) et « garder sa couleur ».
- On ne supprime pas une matière ou une activité encore utilisée par un cours ou un devoir. Supprimer un cours laisse ses devoirs rattachés à leur date.
- Modifier un cours le modifie pour **toute la série**, passé compris. Pour une seule séance : vue Jour (annuler, déplacer). « Celle-ci et les suivantes » reste à faire : pour l'instant, on ferme l'ancien cours (« jusqu'au ») et on en crée un nouveau (« à partir du »).
- En mode discret, les activités non visibles restent neutres et ne sont pas modifiables.
- Enregistré dans la base (tables `categorie`, `serie`, `exception`), avec suppression douce pour la fusion entre appareils.

### Verrou de la configuration

**Facultatif** (pas de verrou par défaut), activé dans « Réglages et outils » avec un **code à 4 chiffres**. On ne garde que son empreinte (SHA-256 salée), dans la base avec les réglages. Ce n'est pas une vraie sécurité (les données sont locales) : il évite les modifications par erreur ou par jeu.

| Libre pour l'élève | Demande le code |
|---|---|
| Devoirs (ajouter, cocher, modifier) | Emploi du temps : cours, matières, activités, semaines alternées |
| Ajouter un événement à l'agenda | Modifier ou supprimer un événement existant |
| Basculer le mode discret | Annuler ou déplacer une séance |
| Regarder une séance et ses devoirs | Profil, réglages et outils (données, sauvegarde, démonstration) |

Le code ouvre le **mode adulte** pour 10 minutes, prolongées à chaque action ; un bouton « 🔓 Mode adulte » dans l'en-tête le referme tout de suite. Le menu propose « Mode adulte (code) » et « Verrouiller maintenant ».

À trancher : que faire d'un code oublié (aujourd'hui, seul l'effacement des données du site le retire).

### Vacances et jours sans cours

- **Vacances scolaires** de la zone choisie (A, B, C ou aucune), embarquées dans l'application : dates officielles 2026-2027 et 2027-2028 (jeu de données ouvert `fr-en-calendrier-scolaire`, data.education.gouv.fr, extrait le 20 novembre 2026, fichier `vacances.js`). L'application étant hors ligne, ces dates sont **à mettre à jour chaque année**.
- **Jours fériés** calculés (Pâques par l'algorithme de Meeus), à prendre en compte ou non.
- **Périodes ajoutées** à la main : stage, examens, grève… (table `periode`).
- Ces jours-là, **les cours n'ont pas lieu** ; les événements de l'agenda, si ; les activités aussi, sauf celles marquées « S'arrête pendant les vacances et les jours fériés » (le foot s'arrête, le psychologue continue).
- Affichage : dans Maintenant, « Vacances de Noël · Reprise dans 13 jours » ; dans la vue Jour, un bandeau (« du sam. 19 déc. au dim. 3 janv. · reprise lundi 4 janvier ») ; jours hachurés dans la bande des jours et la vue Semaine. Le sac à préparer est celui du jour de reprise.
- Réglages dans l'écran Emploi du temps (section « Vacances et jours sans cours »), verrouillés comme le reste de la configuration.

À trancher : les semaines A/B continuent-elles pendant les vacances (calcul actuel) ou la rentrée repart-elle d'une lettre donnée ?

### Semaines alternées

Comme dans MyDevoirs, dans l'écran Emploi du temps (« Modifier » à côté du badge de semaine) :

- alterner ou non les semaines ;
- les libellés, dans l'ordre : « A, B », « 1, 2, 3 »… ;
- « Cette semaine (semaine 48) est la semaine… » : on choisit la lettre de la semaine en cours, les autres s'en déduisent (semaine de référence, jamais la parité du numéro ISO). Un aperçu donne les trois semaines suivantes.

Si des cours utilisent une lettre qui disparaît, la fenêtre le signale (ils n'auraient plus lieu). Sans alternance, les cours réservés à une semaine ont lieu chaque semaine. Le réglage est enregistré dans la base (table `reglage`), avec l'emploi du temps.

### Agenda

À côté de la semaine type, des **événements datés** : « RDV psy le mercredi 25/11 à 17 h 30, pendant 3 semaines », « Dentiste le 2 décembre ».

- **« + Événement »** dans les vues Jour (le jour affiché est proposé) et Semaine, et dans l'écran Emploi du temps (section « Agenda »).
- **Quoi** : une activité personnelle existante (elle apporte nom, couleur, pictogramme et confidentialité), « Autre » avec un titre libre (pictogramme, couleur et confidentialité choisis dans la fenêtre), ou une matière (réunion, sortie).
- **Quand** : date, heures, lieu. **Répétition** : une seule fois, chaque semaine ou toutes les deux semaines, et un nombre de fois. La fenêtre récapitule : « 3 fois : mer. 25 nov., 2 déc. et 9 déc., de 17 h 30 à 18 h 15. »
- Un événement est une série de type « événement » (champs `type`, `intervalle`, et pour un titre libre `couleur`, `confidentialite`), de `valide_du` à `valide_au`. Il s'affiche donc partout comme une séance : vues, rappels, mode discret ; une seule date peut être annulée ou déplacée depuis la vue Jour.
- Depuis la fenêtre d'une séance, **« Modifier l'événement »** (ou « Modifier le cours (toute la série) » pour un cours) ouvre la série entière.
- Dans l'écran Emploi du temps, l'agenda liste les événements à venir ; les événements passés sont repliés.

### Préparer le sac

Liste déduite de l'emploi du temps : les matières du jour visé, avec pour chacune le matériel habituel (champ facultatif de la matière : « calculatrice », « tenue de sport »). Cases à cocher, propres à chaque jour.

**Quand on prépare le sac** se règle par profil :

- **la veille au soir** (par défaut) : le jeudi, on prépare le sac du vendredi. La vue Jour du jeudi affiche « Préparer le sac pour demain · À faire ce soir » ; le vendredi, le sac du lundi. Dans Maintenant, le sac remplace la frise après le dernier cours ;
- **le matin même** : la vue Jour d'un jour affiche le sac de ce jour ; dans Maintenant, il remplace la frise avant le premier cours.

## Matières et activités personnelles

Les cours et les devoirs utilisent la **même matière** : la changer à un endroit la change partout.

| Champ | Sens |
|---|---|
| `id` | UUID |
| `nature` | `ecole` (matière) ou `perso` (activité personnelle) |
| `nom`, `court` | « Mathématiques », « Ma » |
| `couleur` | prise dans une palette prédéfinie |
| `pictogramme` | toujours présent : la couleur ne doit jamais être le seul repère (daltonisme, 8-11 ans) |
| `materiel` | facultatif, pour « Préparer le sac » |
| `confidentialite` | activités seulement, voir plus bas |
| `ordre`, `modifie_le`, `supprime` | ordre d'affichage, fusion |

Les matières et les activités sont rangées dans la même table, mais **séparées partout dans l'interface** : deux listes dans les réglages, deux groupes au choix, et pas de devoir possible sur une activité.

Palette : une douzaine de couleurs nettement distinctes, chacune avec un texte lisible dessus (contraste WCAG AA, calcul déjà présent dans le prototype : `texteSur`). Couleur libre possible pour les plus âgés.

### Confidentialité des activités personnelles

En classe, l'écran se voit : l'élève assis derrière n'a pas à savoir qu'il y a un rendez-vous chez le psychologue.

Chaque activité a un niveau de confidentialité :

| Niveau | Affichage en mode discret |
|---|---|
| `visible` | Nom et pictogramme réels (sport, musique…). |
| `discret` (**par défaut**) | Libellé neutre, **le même pour toutes les activités** (« Rendez-vous », modifiable dans les réglages), et pictogramme neutre. Le vrai nom n'apparaît qu'en ouvrant l'activité. |
| `masque` | N'apparaît pas du tout. |

Pour une activité `discret`, une case « garder la couleur en mode discret » : l'élève reconnaît son rendez-vous à la couleur (sport en vert, psychologue en rouge, musique en bleu), les autres ne voient que « Rendez-vous ». Décochée, l'activité prend une couleur neutre (gris).

Le **mode discret** applique ces niveaux. Hors mode discret, tout est affiché en clair. Son déclenchement se règle par profil :

| Réglage | Comportement |
|---|---|
| Manuel | Désactivé par défaut ; un bouton sur tous les écrans l'active ou le désactive. |
| Automatique | Actif pendant les heures de cours (du début du premier cours à la fin du dernier, d'après l'emploi du temps du jour), désactivé en dehors. Le bouton permet de forcer le changement jusqu'au prochain basculement automatique. |
| Toujours | Actif par défaut. Le bouton le désactive pour un moment ; il se réactive à la prochaine ouverture de l'application, ou au bout d'un délai réglable (30 minutes par défaut), selon ce qui arrive en premier. |

Règles :

- les **notifications** et le **mode compact** suivent toujours la règle la plus prudente : une notification de rappel s'affiche par-dessus tout, même en classe ;
- le rendez-vous reste **visible en tant que créneau occupé**, même discret : si l'élève doit quitter la classe à 15 h, il doit le voir ;
- le fichier de sauvegarde contient les vrais noms. Il est privé, comme le reste des données.

## Devoirs

| Champ | Sens |
|---|---|
| `id` | UUID |
| `matiere` | matière (`nature = ecole`) |
| `texte` | version brute du travail : aperçus, notifications, export lisible |
| `contenu` | travail mis en forme (HTML nettoyé), souvent collé depuis l'ENT |
| `fait` | comme MyDevoirs |
| `serie`, `date_origine` | le cours ou le créneau auquel le devoir est à rendre (même clé qu'une exception) ; vides si le devoir est rattaché à une date |
| `pour` | date de rendu connue (voir plus bas) |
| `a_faire_le` | facultatif, voir [Jour de travail](#jour-de-travail) |
| `modifie_le`, `supprime` | fusion |

### Le devoir suit le cours

Règle : **si le devoir correspond à un cours, il suit ce cours ; sinon, il est rattaché à une date.**

Rattaché à **une occurrence** (série + date d'origine), sa date de rendu se calcule à partir de l'emploi du temps et de ses exceptions :

- cours **déplacé** : le devoir le suit ;
- cours **annulé** ou **remplacé** : le devoir reste affiché à sa date avec un avertissement (« Le cours de maths est annulé : à rendre quand ? ») et un bouton « Reporter au prochain cours de maths ». Pas de report silencieux : un changement qu'on ne remarque pas est justement le piège ;
- série modifiée (« celle-ci et les suivantes ») : le devoir suit l'occurrence correspondante de la nouvelle série (même semaine, même position dans le cycle). S'il n'y en a pas, il est rattaché à la date de l'ancienne occurrence.

`pour` garde toujours la dernière date de rendu calculée. Elle sert de date de rattachement quand il n'y a pas de cours, et de repli quand la série est inconnue : après une synchronisation partielle, sans emploi du temps (jeunes élèves) ou pour un devoir importé de MyDevoirs.

### Créneaux à matière variable

Certains créneaux n'ont pas de matière fixe. Exemple : un « DS » chaque mercredi matin, dont la matière change d'une semaine à l'autre. Un DS de maths tombe alors dans un créneau où l'emploi du temps n'affiche pas « Maths ».

- Une série peut être un **créneau** sans matière (`matiere` vide) : DS, devoir surveillé, heure de vie de classe…
- Un devoir peut être rattaché à **n'importe quelle occurrence**, pas seulement à un cours de sa matière : « Contrôle de maths » → DS du mercredi 26.
- Affichage : le créneau prend la matière et la couleur du devoir qui lui est rattaché (« DS · Maths », en bleu maths). Sans devoir rattaché, il garde son titre et une couleur neutre.
- Le devoir suit le créneau comme il suivrait un cours (déplacement, annulation).

### Saisie

- **« À rendre » vient en premier** : on choisit un jour parmi les dix prochains jours de classe (puces groupées par semaine, ou « Autre date »), puis un cours de ce jour (ou « Sans cours précis »). La **matière se déduit du cours** ; on ne la choisit que pour un créneau sans matière fixe (DS) ou un devoir sans cours.
- Choix proposé à l'ouverture : depuis « + » d'un cours, ce cours ; depuis la vue Jour sur un jour à venir, ce jour (le cours reste à choisir) ; sinon, le prochain cours de la matière qui vient de finir.
- Le travail se saisit dans une **zone de texte riche** : plusieurs lignes, gras, italique, souligné, listes. Les professeurs écrivent parfois de longues consignes mises en forme sur l'ENT : on doit pouvoir les coller telles quelles.
- **Nettoyage** à la saisie et à l'affichage (une sauvegarde restaurée peut contenir n'importe quoi) : seuls les paragraphes, retours à la ligne, gras, italique, souligné, listes et liens web sont gardés ; scripts, images, styles et attributs sont retirés.
- Sans emploi du temps, la saisie se fait par date, comme dans MyDevoirs.

### Afficher un devoir

- Dans les listes, un devoir n'affiche qu'un **aperçu de deux lignes**.
- **Un clic sur le devoir l'ouvre** : texte complet mis en forme, échéance en temps relatif, cours auquel il est rattaché, jour de travail prévu. Depuis là : marquer fait, modifier, supprimer.
- **Seule la case** marque le devoir fait. Avant, cliquer n'importe où sur la ligne le cochait, ce qui gênait pour lire un long texte.
- Supprimer demande une confirmation. La suppression est « douce » : la ligne reste dans la base, marquée, pour la fusion entre appareils.

### Jour de travail

Par défaut, Sablio ne demande que **le jour où le devoir est à rendre**.

Pour les enfants qui en ont besoin, deux aides :

1. **Avec saisie, active par défaut** : champ « à faire le », proposé à la saisie du devoir mais **facultatif**. Laissé vide, rien ne change. Le réglage « Prévoir le jour de travail » du profil permet de le masquer.
2. **Sans saisie, à activer dans le profil** : le compte « il te reste 2 soirs » ignore les soirs occupés par une activité. Si le dernier soir avant le rendu est pris (sport le mercredi pour un devoir du jeudi), l'application le signale : « Mercredi soir, tu as sport : fais-le mardi. »

« Ce soir » liste les devoirs dont `a_faire_le` est aujourd'hui. Pour un devoir sans `a_faire_le`, il liste ceux à rendre au prochain jour de classe, plus ceux que l'aide 2 avance à ce soir.

## Temps relatif

Échéances, en-têtes et rappels sont d'abord exprimés en temps relatif, la date venant en second.

| Écart | Texte |
|---|---|
| Passé | « en retard d'un jour », « en retard de 3 jours » |
| 0 | « aujourd'hui » (« ce soir » pour le travail) |
| 1, 2 | « demain », « après-demain » |
| 3 à 6 | « jeudi (dans 3 jours) » |
| 7 et plus | « mardi 2 décembre (dans 12 jours) » |
| Semaines | « cette semaine », « semaine prochaine », « dans 3 semaines » (MyDevoirs) |
| Moins d'un jour | « dans 25 minutes », « dans 2 h 10 » (Maintenant / Ensuite) |

Ce qu'on évite : « mardi prochain », que les gens comprennent différemment.

Selon le profil :

- 8-11 ans : « dans 2 nuits » plutôt que « dans 2 jours » ;
- tous : « il te reste N soirs » pour le travail à la maison (soirs libres jusqu'à la veille du rendu).

## Reprise des fonctions de MyDevoirs

| MyDevoirs Kivy | Sablio |
|---|---|
| Agenda par semaine | Vue Semaine allégée + vue Jour |
| Matière (nom, couleur RGBA en flottants, ordre) | Matière ; couleur convertie en hexadécimal, pictogramme à choisir |
| Devoir (matière, jour, texte, fait) | Devoir ; à l'import, rattaché au cours de la même matière ce jour-là s'il existe, sinon à la date |
| Progression par jour | Gardée (Jour, Semaine) |
| Liste « À faire » | Écran À faire |
| Semaines A/B | Cycle de N semaines |
| Jours affichés, premier jour, semaine suivante le week-end | Gardés ; jours affichés déduits de l'emploi du temps |
| Saut à une semaine ou une date | Gardé, plus « demain », « lundi » |
| Thèmes | Clair, sombre, contraste élevé |
| Chemin de la base, taille de la fenêtre | Sans objet (sauvegarde dans un fichier, PWA) |

## Hors périmètre pour l'instant

- Types de devoir (contrôle à réviser, matériel à apporter).
- Devoirs qui reviennent (« lire 20 min chaque soir »).

## Questions ouvertes

Aucune pour l'instant.
