"""Prépare les images du guide (src/guide/images/) à partir des captures.

Usage : npm run captures, puis python3 scripts/images-guide.py   (il faut Pillow)
Les captures sont converties en WebP, plus légères que le PNG.
"""
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
CAPTURES = RACINE / "captures"
SORTIE = RACINE / "src" / "guide" / "images"

# nom dans le guide : capture d'origine
IMAGES = {
    "maintenant": "1-cours-college",
    "fin-de-journee": "3-fini-college",
    "jour": "21-jour-en-cours",
    "jour-discret": "10-jour-mardi-discret",
    "semaine": "22-semaine",
    "a-faire": "25-a-faire",
    "saisie": "20-plus-anglais",
    "detail": "19-detail",
    "seance": "26-seance",
    "emploi-du-temps": "27-emploi-du-temps",
    "evenement": "31-evenement",
    "vacances": "36-vacances-jour",
    "usage-reel": "42-usage-reel",
    "etroit": "15-jour-etroit-primaire",
}


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    for nom, capture in IMAGES.items():
        image = Image.open(CAPTURES / f"{capture}.png").convert("RGB")
        image.save(SORTIE / f"{nom}.webp", "WEBP", quality=82, method=6)
    total = sum(f.stat().st_size for f in SORTIE.glob("*.webp"))
    print(f"{len(IMAGES)} images, {total // 1024} Ko, dans {SORTIE}")


if __name__ == "__main__":
    main()
