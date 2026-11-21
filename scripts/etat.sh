#!/usr/bin/env bash
# Où en est-on : le dépôt (HEAD), le site en ligne (tag « web », déplacé par
# scripts/publier.sh) et la version Windows sur GitHub (tag « release »,
# déplacé par scripts/publier-windows.sh).
#
#   npm run etat
set -euo pipefail
cd "$(dirname "$0")/.."

decrire() { # libellé, tag
  local libelle=$1 tag=$2 commit quand retard version
  if ! commit=$(git rev-parse -q --verify "refs/tags/$tag^{commit}"); then
    printf '%-9s pas encore de tag « %s »\n' "$libelle" "$tag"
    return
  fi
  quand=$(git for-each-ref --format='%(taggerdate:format:%d/%m/%Y %H:%M)' "refs/tags/$tag")
  version=$(git tag --points-at "$commit" -l 'v*' | sort -V | tail -1)
  retard=$(git rev-list --count "$commit..HEAD")
  printf '%-9s %s  %s%s, %s\n' "$libelle" "$(git log -1 --format=%h "$commit")" "${version:+$version, }" \
    "publié le $quand" "$([ "$retard" -eq 0 ] && echo 'à jour' || echo "$retard commit(s) de retard")"
}

printf '%-9s %s  %s\n' "HEAD" "$(git log -1 --format=%h)" "$(git log -1 --format=%s)"
decrire "Site" web
decrire "Release" release

modifs=$(git status --porcelain | wc -l)
[ "$modifs" -eq 0 ] || echo "          + $modifs fichier(s) modifié(s), pas encore commité(s)"

for tag in web release; do
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null && [ -n "$(git rev-list "$tag..HEAD")" ]; then
    echo; echo "Pas encore dans « $tag » :"
    git log --format='  %h %s' "$tag..HEAD"
  fi
done
