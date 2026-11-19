# Refonte : étude de faisabilité

État : **réflexion**, rien n'est décidé ni codé. Ce document consigne les contraintes, les choix provisoires et les risques, pour ne pas les redécouvrir.

## Objectif

Une application d'agenda, d'emploi du temps et de devoirs pensée pour les élèves et étudiants TDAH qui ont du mal à se repérer dans le temps. Elle remplace l'application Kivy actuelle.

## Contraintes connues

| Contrainte | Conséquence |
|---|---|
| Fonctionne **hors ligne** | Aucune dépendance à un serveur. Données locales. |
| Public de **8 à 20 ans** | Plusieurs niveaux d'interface (voir plus bas). |
| Pas de téléphone pour les élèves | Les rappels passent par l'ordinateur : notification système, son, affichage permanent. |
| **Installation sans droits administrateur** | Pas de MSI par machine. Installateur par utilisateur, ou version portable. |
| Parc d'ordinateurs **inconnu et variable** (académies, dossiers MDPH) | On conçoit pour le pire cas et on teste sur plusieurs machines. |
| Synchronisation par **fichier sur drive ou clé USB** | Pas de serveur. Risque de corruption à traiter (voir plus bas). |
| Sauvegarde avant montée de version | Migrations numérotées, copie avant migration, export JSON versionné. |
| Plusieurs personnes saisissent (élève, parent, ergothérapeute) | Mode « élève » et mode « aidant », emploi du temps échangeable en fichier. |
| Très réactif | Interface web locale, pas de rendu maison. |

## Ce qui aide vraiment la cécité temporelle

Les notifications sont l'outil le moins efficace : elles sont vite ignorées. Le plus utile est de **rendre le temps visible en permanence** :

- vue « Maintenant / Ensuite » avec le temps restant (barre ou cercle qui se vide) ;
- frise de la journée avec un repère « vous êtes ici » ;
- échéances en temps relatif (« dans 2 jours ») et pas seulement en date ;
- durée estimée des devoirs, découpage en petites étapes ;
- mode compact toujours visible (petite fenêtre au premier plan ou zone de notification).

## Choix technologique provisoire

**Electron + TypeScript + SQLite (`better-sqlite3`)**, interface en Svelte ou SolidJS.

Pourquoi pas Kivy : rendu maison OpenGL, donc taille de fenêtre, DPI, texte et accessibilité à gérer à la main ; notifications non natives ; packaging fragile (Briefcase, Docker).

Pourquoi Electron plutôt que Tauri :

- Chromium embarqué : aucune dépendance à WebView2 (Windows) ni WebKitGTK (Linux), rendu identique partout ;
- `electron-builder` sait faire un installateur NSIS **par utilisateur** (`perMachine: false`) et une version **portable** ;
- un seul langage (TypeScript) pour un projet maintenu seul ;
- coût : 100 à 150 Mo, plus de mémoire. Acceptable.

Tauri reste une option si la taille devient un sujet. Son MSI est par machine (donc demande l'administrateur) ; il faudrait utiliser NSIS en mode utilisateur, et WebView2 doit être présent. **À vérifier** : l'installation de WebView2 sans administrateur.

Une **PWA** (page web installable) reste le repli si les postes interdisent de lancer un `.exe`.

## Risques et inconnues

1. **Blocage des exécutables** (AppLocker, stratégies de restriction) sur `%LOCALAPPDATA%` ou sur une clé USB. Impossible à savoir d'ici : à tester sur le terrain.
2. **Corruption SQLite** si le fichier de travail est posé sur un drive synchronisé (WAL + synchronisation en arrière-plan, copies « en conflit ») ou sur une clé retirée pendant une écriture.
3. **Notifications Windows** : il faut définir un `AppUserModelID` pour que les toasts s'affichent ; le mode « Ne pas déranger » ou « Assistant de concentration » les masque.
4. **Linux** : l'AppImage demande FUSE ou `--appimage-extract-and-run`.

## Synchronisation : principes

1. La **base de travail reste locale**. Le drive ou la clé ne contient qu'un **fichier d'échange**.
2. **Fusion enregistrement par enregistrement**, jamais remplacement du fichier. Chaque ligne a un identifiant UUID (pas d'entier auto-incrémenté), une date de modification et un marqueur de suppression. La version la plus récente de chaque ligne gagne.
3. **Écriture atomique** : fichier temporaire puis renommage.
4. Mode journal `DELETE` plutôt que `WAL` pour tout fichier destiné à voyager.

Le risque de conflit est faible : l'emploi du temps change rarement et surtout par l'adulte, les devoirs changent souvent et surtout par l'élève.

## Sauvegarde et montée de version

- Version du schéma dans `PRAGMA user_version`, migrations numérotées.
- Copie automatique de la base avant chaque migration, conservation des N dernières.
- Export JSON versionné, lisible sans l'application.
- Si la base est plus récente que l'application, refuser de l'ouvrir.

## Niveaux d'interface (8 à 20 ans)

| Public | Besoin |
|---|---|
| 8 à 11 ans | Gros éléments, pictogrammes et couleurs par matière, très peu de texte, saisie faite par un adulte. |
| Collège | Vue du jour et de la semaine, devoirs avec échéance, rappels. |
| Lycée / études supérieures | Emploi du temps non stable, événements répétitifs irréguliers, vue calendrier classique. |

Cela se règle par **profil** (densité, vocabulaire, pictogrammes, rappels), pas par du code dupliqué.

Voir aussi [modele-recurrence.md](modele-recurrence.md) : les cours qui ne reviennent pas à intervalle fixe imposent un modèle plus riche que les semaines A/B actuelles.

## Plan de faisabilité

On ne peut pas choisir un poste représentatif. On fabrique donc un **outil de diagnostic** que des personnes équipées de machines différentes peuvent lancer et dont elles renvoient le rapport.

**Étape 1 : kit de diagnostic.** Une petite application Electron, en version portable et en installateur par utilisateur, qui vérifie et affiche :

- l'installation et le lancement sans administrateur ;
- l'affichage d'une notification système, et le son ;
- l'écriture et la lecture d'un fichier SQLite sur un dossier choisi (clé USB, drive) ;
- la taille d'écran, le DPI, le plein écran ;
- le système, la version et les stratégies de sécurité détectables ;
- un bouton « copier le rapport ».

**Étape 2 : spécification.** Modèle de données (UUID, récurrence, règles de fusion), écrans, niveaux de profil.

**Étape 3 : prototype jetable** de la vue « Maintenant / Ensuite » en HTML, pour juger l'ergonomie avant de coder le reste.

## Résultats du prototype (19 novembre 2026)

Prototype dans `refonte/prototype/` (Electron 45.2.3). Mesuré sous WSL2 (WSLg, Wayland) et, pour le rendu, dans Edge sous Windows 11 Famille.

| Point | Résultat |
|---|---|
| Premier affichage | 200 à 340 ms après le lancement |
| Fluidité | 60 images/s ; un rendu complet prend 4 à 6 ms en moyenne |
| SQLite | `node:sqlite` est inclus dans Electron (SQLite 3.53) : **aucun module natif à compiler**. 1000 lignes, écriture atomique par renommage, mode `DELETE` : 20 ms |
| Tailles, plein écran, fenêtre étroite | Gérés par la mise en page web, sans aucun calcul de taille |
| Mode compact | Fonctionne. Sous Wayland, la position obtenue diffère de quelques pixels de celle demandée |
| Son | Carillon généré par la page (Web Audio), fonctionne |
| Notifications sous WSL | Échec : WSL n'a pas de service de notifications. Attendu, sans conséquence pour un vrai bureau Linux |
| Rendu Windows | Identique dans Edge (même code, police Segoe UI) |
| **Exécutable Windows** | **Bloqué** : « Une stratégie de contrôle d'application a bloqué ce fichier » |

### Point bloquant : le Contrôle intelligent des applications

Windows 11 a un **Contrôle intelligent des applications** (Smart App Control). Sur la machine de développement, il est actif en mode blocage (`VerifiedAndReputablePolicyState = 1`). Il bloque tout exécutable **non signé** et inconnu de Microsoft, avec ou sans droits administrateur. Le journal `CodeIntegrity` le confirme (événements 3077 et 3118).

Conséquences :

- **ce n'est pas propre à Electron** : l'actuel MyDevoirs (Kivy, Briefcase) n'est pas signé non plus et sera bloqué de la même façon sur les machines où ce contrôle est actif ;
- **la signature de code devient un prérequis**, quelle que soit la technologie. Une application signée par une autorité reconnue est autorisée même sans réputation. Pistes, **tarifs et conditions à vérifier** : SignPath Foundation (gratuit pour les projets libres), certificat « Open Source » de Certum, Azure Trusted Signing (abonnement mensuel, conditions d'éligibilité selon le pays) ;
- **ne pas désactiver ce contrôle pour tester** : sur de nombreuses versions de Windows 11, il ne peut pas être réactivé sans réinstaller le système.

### Conséquence : la PWA devient une option sérieuse

Edge et Chrome sont signés : une application web installée depuis le navigateur (PWA) n'est pas concernée par ce contrôle. Le prototype tourne déjà tel quel dans Edge. À étudier :

- hors ligne : un service worker met l'application en cache ;
- données : SQLite compilé en WebAssembly sur le stockage privé du navigateur (OPFS), ou IndexedDB ;
- synchronisation par fichier : l'API d'accès aux fichiers (Edge, Chrome) permet de lire et d'écrire un fichier choisi par l'utilisateur, par exemple sur une clé USB ;
- limites : les notifications ne partent que si l'application est ouverte ; le stockage du navigateur peut être effacé (nettoyage, profil réinitialisé) ; pas de mode compact au premier plan.

Le code d'interface est le même dans les deux cas.

Vérifié dans Edge 157 sous Windows 11 avec le prototype rendu installable : manifeste sans erreur, aucune erreur d'installabilité, *service worker* actif, page affichée réseau coupé. Test manuel de l'application installée (Edge 157, Windows 11) :

- elle s'ouvre serveur arrêté, et les données (devoir coché) sont conservées ;
- une notification de rappel s'est affichée, via le *service worker* ;
- l'incrustation de document (pour le mode compact) est disponible ;
- temps de rendu moyen : 1,2 ms ;
- **stockage persistant refusé, même installée.** Sans persistance, Edge peut effacer les données de lui-même s'il manque de place sur le disque. Avec ou sans persistance, un effacement manuel des données de navigation les supprime. La sauvegarde dans un fichier reste donc la vraie protection. À revérifier sur l'adresse HTTPS définitive : le critère d'Edge pour accorder la persistance n'est pas documenté.

**Décision provisoire** : mettre l'application au point en PWA, testée dans Edge sous Windows. Electron devient une enveloppe facultative, à ajouter si un besoin le justifie (rappels application fermée, fenêtre au premier plan, démarrage automatique). Conditions pour que ce passage reste peu coûteux :

- tout accès au système passe par une couche « plateforme » unique, avec une implémentation par enveloppe ;
- même stockage des deux côtés (SQLite WebAssembly) ;
- les fonctions propres à Electron restent facultatives : l'application doit être complète sans elles ;
- les données d'une PWA ne sont pas visibles depuis Electron : le passage de l'une à l'autre se fait par export puis import d'un fichier.

## Relecture des fonctions existantes

- L'application actuelle n'a **pas d'emploi du temps avec horaires** : des jours, des devoirs par matière, une lettre de semaine. La vue « Maintenant / Ensuite » demande donc une nouvelle saisie (horaires, salles), qui reposera souvent sur un adulte. Un import depuis l'ENT (fichier iCalendar) serait à étudier.
- Le réglage `ddb.path` permet déjà de placer la base où l'on veut : certains utilisateurs l'ont peut-être mise sur une clé ou un drive. La reprise des données doit le prévoir.
- La reprise de l'existant est simple : tables `Matiere` (nom, couleur RGBA en flottants), `Jour`, `Item` (contenu, fait), `Ordre`. Réglages à convertir : jours affichés, premier jour, semaine suivante le week-end, alternance, thème.

## Questions ouvertes

- Quelles zones de vacances scolaires faut-il embarquer, et comment les mettre à jour hors ligne ?
- Un adulte suit-il plusieurs enfants (plusieurs profils sur un même poste) ?
- Faut-il un export imprimable (page de secours, affichage mural) ?
- Qui définit le niveau d'interface d'un profil, et peut-il évoluer avec l'âge ?
