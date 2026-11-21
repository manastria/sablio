#!/usr/bin/env bash
# Publie la version Windows portable sur GitHub : release vX.Y.Z (pré-version)
# avec l'archive, puis déplace le tag « release » (voir npm run etat).
#
#   scripts/publier-windows.sh --essai   # assemble l'archive, ne publie rien
#   scripts/publier-windows.sh           # publie
#
# Avant : changer la version dans package.json et src/version.js, commiter,
# pousser (la release est créée sur le commit HEAD, qui doit être sur GitHub).
set -euo pipefail
cd "$(dirname "$0")/.."

DEPOT="manastria/sablio"
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
NOM="Sablio-$VERSION-windows-x64"
ESSAI=$([ "${1:-}" = "--essai" ] && echo 1 || true)

[ -z "$(git status --porcelain)" ] || { echo "Des modifications ne sont pas commitées." >&2; exit 1; }
if [ -z "$ESSAI" ]; then
  git fetch -q --tags origin
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "$TAG existe déjà : changer la version dans package.json et src/version.js." >&2; exit 1
  fi
  git merge-base --is-ancestor HEAD origin/main || { echo "HEAD n'est pas sur GitHub : git push d'abord." >&2; exit 1; }
fi

npm test --silent
npm run --silent preparer-windows
rm -rf "dist/$NOM" "dist/$NOM.zip"
mv dist/windows "dist/$NOM"
(cd dist && zip -qr -9 "$NOM.zip" "$NOM")
mv "dist/$NOM" dist/windows
echo "Archive : dist/$NOM.zip ($(du -h "dist/$NOM.zip" | cut -f1))"
[ -z "$ESSAI" ] || exit 0

gh release create "$TAG" "dist/$NOM.zip" -R "$DEPOT" --target "$(git rev-parse HEAD)" --prerelease \
  --title "Sablio $VERSION (prototype Windows)" --notes-file - <<NOTES
Version Windows portable du prototype Sablio $VERSION (Electron, x64).

**Installation** : décompresser l'archive, puis lancer \`Sablio-prototype.exe\`. Rien n'est installé sur la machine.

**Attention** : l'exécutable n'est **pas signé**. Sur Windows 11, le Contrôle intelligent des applications le bloque (« Une stratégie de contrôle d'application a bloqué ce fichier »). Ne pas désactiver ce contrôle pour tester : il ne peut souvent pas être réactivé sans réinstaller Windows. La version recommandée reste l'application installable depuis https://sablio.manastria.fr/.

Les données de cette version sont séparées de celles du navigateur : on passe de l'une à l'autre par une sauvegarde, puis « Restaurer depuis un autre fichier ».
NOTES
git fetch -q --tags origin
git tag -f -a release -m "Release $TAG publiée le $(date '+%d/%m/%Y %H:%M')" HEAD >/dev/null
echo "Tag « release » déplacé sur $(git log -1 --format='%h %s'). Pour GitHub : git push -f origin release"
