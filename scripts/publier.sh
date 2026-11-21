#!/usr/bin/env bash
# Publie Sablio sur https://sablio.manastria.fr/ (hébergement Infomaniak).
#
#   scripts/publier.sh --essai   # montre ce qui serait envoyé ou supprimé
#   scripts/publier.sh           # publie
#
# Il faut rclone avec le partage « infomaniak-web » (SFTP). Les tests passent
# d'abord ; le site est assemblé dans dist/web (sans les fichiers d'Electron),
# puis synchronisé. Les fichiers d'Infomaniak (.user.ini, page de maintenance)
# restent en place.
set -euo pipefail
cd "$(dirname "$0")/.."

DISTANT="infomaniak-web:sites/sablio.manastria.fr"
SORTIE="dist/web"

npm test --silent

[ -f src/vendor/sqlite/sqlite3.wasm ] || { echo "SQLite manque : lancez npm install." >&2; exit 1; }

rm -rf "$SORTIE"
mkdir -p "$SORTIE"
# Tout src/ sauf le processus principal et le pont d'Electron.
tar -C src --exclude=./main.js --exclude=./preload.js -cf - . | tar -C "$SORTIE" -xf -
cp web/.htaccess "$SORTIE/.htaccess"

OPTIONS=(--exclude "/.user.ini" --exclude "/.infomaniak-maintenance.html" --checksum --verbose)
if [ "${1:-}" = "--essai" ]; then
  rclone sync "$SORTIE" "$DISTANT" "${OPTIONS[@]}" --dry-run
else
  rclone sync "$SORTIE" "$DISTANT" "${OPTIONS[@]}"
  echo "Publié sur https://sablio.manastria.fr/"
  # Le tag « web » suit ce qui est en ligne (voir npm run etat). Seulement si
  # ce qui a été envoyé est commité : sinon il mentirait.
  if [ -z "$(git status --porcelain -- src web)" ]; then
    git tag -f -a web -m "Site publié le $(date '+%d/%m/%Y %H:%M')" HEAD >/dev/null
    echo "Tag « web » déplacé sur $(git log -1 --format='%h %s'). Pour GitHub : git push -f origin web"
  else
    echo "Attention : src/ ou web/ contient des modifications non commitées ; tag « web » laissé en place." >&2
  fi
fi
