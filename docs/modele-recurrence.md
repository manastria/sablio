# Refonte : modèle des événements répétitifs

État : **proposition**, à valider.

## Le problème

MyDevoirs gère l'alternance A/B (`mydevoirs/alternance.py` dans son dépôt). C'est un cas particulier. Chez les étudiants, un cours peut suivre ce schéma :

> Mathématiques : 2 h par semaine. Semaine 1 le lundi, semaine 2 le mardi, semaine 3 : le cours saute, ou est déplacé dans une autre semaine, ou remplacé par un autre cours parce que le professeur est absent.

Une règle du type « tous les lundis » ou « une semaine sur deux » ne suffit pas. Un événement répétitif **a un motif, et des exceptions**.

## Principe : motif + exceptions, calculés à la demande

On ne stocke pas toutes les occurrences. On stocke :

1. une **série** (le motif) ;
2. des **exceptions**, une par occurrence modifiée ;
3. une fonction pure qui, pour une période donnée, calcule les occurrences : motif, moins les annulations, plus les déplacements et les ajouts.

Avantages : peu de données, simple à fusionner entre appareils, et on peut changer le motif sans réécrire l'historique.

## Entités

### Serie

| Champ | Sens |
|---|---|
| `id` | UUID |
| `titre`, `matiere`, `couleur`, `lieu`, `intervenant` | description ; `matiere` vide pour un créneau à matière variable (DS), voir [specification.md](specification.md) |
| `motif` | voir ci-dessous |
| `duree` | durée d'une séance |
| `valide_du`, `valide_au` | période de validité du motif |
| `volume_hebdo` | optionnel : volume attendu (par exemple 2 h par semaine) |
| `modifie_le`, `supprime` | pour la fusion |

### Motifs

- **Hebdomadaire** : jours et heures fixes.
- **Cycle de N semaines** : une liste de N positions, chacune avec ses jours et ses heures (vide si pas de cours). C'est la généralisation de A/B : A/B est un cycle de 2, l'exemple ci-dessus un cycle de 2 avec un lundi puis un mardi. Le cycle part d'une **semaine de référence** (jamais de la parité du numéro ISO, comme aujourd'hui).
- **Dates à la carte** : liste de dates explicites, pour ce qui ne suit aucune règle.
- **Ponctuel** : un seul événement.

### Exception (clé : `serie_id` + date d'origine)

| Champ | Sens |
|---|---|
| `statut` | `annule`, `deplace`, `remplace`, `ajoute` |
| `nouvelle_date`, `nouvelle_heure` | pour `deplace` |
| `remplace_par` | autre série ou titre libre, pour `remplace` |
| `motif_texte` | « professeur absent », « DS », etc. |
| `modifie_le` | fusion |

Un rattrapage est une exception `ajoute` liée à l'occurrence annulée, pour garder le lien « ce cours remplace celui du 14 ».

### Calendrier

Périodes sans cours : vacances, examens, stage. Elles suppriment ou masquent les occurrences. Modifiables par l'utilisateur, car les dates varient selon l'académie et l'année, et l'application est hors ligne.

## Modifier une série

Comme dans les agendas classiques, trois portées :

- **cette occurrence** : on crée une exception ;
- **celle-ci et les suivantes** : on ferme la série (`valide_au`) et on en ouvre une nouvelle (`valide_du`) avec le nouveau motif ;
- **toute la série** : on modifie le motif.

## Fusion entre appareils

La clé d'une exception est `serie_id` + date d'origine, donc deux appareils qui annulent le même cours produisent la **même ligne** : pas de doublon, la plus récente gagne.

Cas à traiter : un appareil déplace une séance pendant que l'autre l'annule. Dans ce cas, la dernière modification gagne, et on l'affiche à l'utilisateur plutôt que de le faire silencieusement.

## Impact sur l'interface

- Une vue calendrier classique pour les plus âgés, et la vue « Maintenant / Ensuite » pour tous.
- Les exceptions doivent se **voir** (un cours annulé est barré, un cours déplacé porte une pastille), car un changement non remarqué est exactement le piège pour un élève qui se repère mal dans le temps.
- Pour les plus jeunes, les exceptions sont saisies par l'adulte.

## À valider

- Faut-il le volume hebdomadaire (2 h par semaine) comme simple information, ou pour signaler une semaine où il manque des heures ?
- Reprise de l'existant : les semaines A/B de l'application actuelle se convertissent en cycle de 2.
- Fuseau et changement d'heure : les heures sont stockées en heure locale, sans fuseau.
