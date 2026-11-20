"""Dessine les icônes de Sablio : un sablier, le temps qui s'écoule et se voit.

Usage : python3 scripts/icones.py   (il faut Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

SORTIE = Path(__file__).resolve().parent.parent / "src" / "icones"
FOND = (31, 79, 143)
VERRE = (255, 255, 255)
CADRE = (236, 226, 205)
SABLE = (232, 150, 24)
SUR = 4  # suréchantillonnage, pour des bords lisses


def dessiner(taille: int, marge: float, arrondi: float, filet: bool = True) -> Image.Image:
    """`marge` : part de l'icône laissée autour du sablier (zone sûre des icônes « maskable »)."""
    t = taille * SUR
    image = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((0, 0, t - 1, t - 1), radius=int(t * arrondi), fill=FOND)

    # Repère du sablier : un carré centré, coordonnées de 0 à 1.
    m = t * marge
    cote = t - 2 * m

    def p(x: float, y: float) -> tuple[float, float]:
        return (m + x * cote, m + y * cote)

    def largeur(y: float) -> float:
        """Demi-largeur intérieure du verre à la hauteur y (étranglement au milieu)."""
        haut, milieu, bas = 0.10, 0.5, 0.90
        large, etroit = 0.30, 0.04
        if y <= milieu:
            return large - (y - haut) / (milieu - haut) * (large - etroit)
        return etroit + (y - milieu) / (bas - milieu) * (large - etroit)

    # Le verre : deux triangles qui se touchent par la pointe.
    d.polygon([p(0.5 - largeur(0.10), 0.10), p(0.5 + largeur(0.10), 0.10),
               p(0.5 + largeur(0.5), 0.5), p(0.5 - largeur(0.5), 0.5)], fill=VERRE)
    d.polygon([p(0.5 - largeur(0.5), 0.5), p(0.5 + largeur(0.5), 0.5),
               p(0.5 + largeur(0.90), 0.90), p(0.5 - largeur(0.90), 0.90)], fill=VERRE)

    # Le sable qui reste en haut (le bas de l'ampoule supérieure)…
    niveau = 0.30
    d.polygon([p(0.5 - largeur(niveau) + 0.03, niveau), p(0.5 + largeur(niveau) - 0.03, niveau),
               p(0.5 + largeur(0.5), 0.5), p(0.5 - largeur(0.5), 0.5)], fill=SABLE)
    # … le filet qui coule (invisible en très petit, on l'omet)…
    if filet:
        d.rectangle((*p(0.488, 0.5), *p(0.512, 0.78)), fill=SABLE)
    # … et le tas qui grandit en bas.
    d.polygon([p(0.5 - largeur(0.90) + 0.05, 0.90), p(0.5 + largeur(0.90) - 0.05, 0.90), p(0.5, 0.72)], fill=SABLE)

    # Les deux montants du cadre, en haut et en bas.
    epaisseur = 0.085
    rayon = int(cote * 0.03)
    d.rounded_rectangle((*p(0.10, 0.10 - epaisseur), *p(0.90, 0.10)), radius=rayon, fill=CADRE)
    d.rounded_rectangle((*p(0.10, 0.90), *p(0.90, 0.90 + epaisseur)), radius=rayon, fill=CADRE)
    return image.resize((taille, taille), Image.LANCZOS)


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    for taille in (192, 512):
        dessiner(taille, marge=0.12, arrondi=0.22).save(SORTIE / f"icone-{taille}.png")
    # « maskable » : le système peut rogner l'icône en cercle, on garde de la marge.
    dessiner(512, marge=0.22, arrondi=0).save(SORTIE / "icone-maskable-512.png")
    # En 32 px, l'onglet : le sablier occupe presque tout, sans le filet.
    dessiner(32, marge=0.04, arrondi=0.22, filet=False).save(SORTIE / "favicon.png")
    print(f"Icônes écrites dans {SORTIE}")


if __name__ == "__main__":
    main()
