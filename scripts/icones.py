"""Dessine les icônes du prototype : un minuteur dont le temps restant est en rouge.

Usage : python3 scripts/icones.py   (il faut Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

SORTIE = Path(__file__).resolve().parent.parent / "src" / "icones"
FOND = (31, 79, 143)
CADRAN = (255, 255, 255)
RESTE = (214, 52, 44)
SUR = 4  # suréchantillonnage, pour des bords lisses


def dessiner(taille: int, marge: float, arrondi: float) -> Image.Image:
    """`marge` : part de l'icône laissée autour du cadran (zone sûre des icônes « maskable »)."""
    t = taille * SUR
    image = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((0, 0, t - 1, t - 1), radius=int(t * arrondi), fill=FOND)
    m = int(t * marge)
    boite = (m, m, t - m, t - m)
    d.ellipse(boite, fill=CADRAN)
    # Le temps qui reste : un secteur qui part de midi, dans le sens des aiguilles.
    interieur = int(t * 0.035)
    d.pieslice(
        (m + interieur, m + interieur, t - m - interieur, t - m - interieur),
        start=-90, end=150, fill=RESTE,
    )
    c = t // 2
    r = int(t * 0.045)
    d.ellipse((c - r, c - r, c + r, c + r), fill=FOND)
    return image.resize((taille, taille), Image.LANCZOS)


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    for taille in (192, 512):
        dessiner(taille, marge=0.14, arrondi=0.22).save(SORTIE / f"icone-{taille}.png")
    # « maskable » : le système peut rogner l'icône en cercle, on garde de la marge.
    dessiner(512, marge=0.24, arrondi=0).save(SORTIE / "icone-maskable-512.png")
    dessiner(32, marge=0.06, arrondi=0.22).save(SORTIE / "favicon.png")
    print(f"Icônes écrites dans {SORTIE}")


if __name__ == "__main__":
    main()
