"""Genere les icones PNG de l'application a partir du dessin du favicon.

Android et iOS refusent le SVG pour l'installation : il faut des PNG.
Le trace reprend celui de public/favicon.svg, a l'echelle.

    python tools/generate-icons.py

Les icones « maskable » portent une marge : Android recadre l'icone dans une
forme qui varie selon le constructeur, et un dessin colle aux bords s'y fait
rogner.
"""

from PIL import Image, ImageDraw

VERT = (22, 163, 74)          # #16A34A, la couleur primaire du CRM
BLANC = (255, 255, 255)

# Le trace du favicon, en coordonnees 0-32.
BASE = [(7, 19), (25, 19)]
PARE_BRISE = [(9.5, 19), (11.3, 13.8), (13.2, 12), (18.8, 12), (20.7, 13.8), (22.5, 19)]
APPUIS = [[(11, 22.5), (12.5, 22.5)], [(19.5, 22.5), (21, 22.5)]]


def dessiner(taille: int, marge_relative: float = 0.0) -> Image.Image:
    """`marge_relative` reserve un pourtour pour les icones maskable."""
    # On dessine quatre fois trop grand puis on reduit : PIL ne lisse pas les
    # traits, le sur-echantillonnage fait le travail.
    facteur = 4
    grand = taille * facteur

    img = Image.new('RGBA', (grand, grand), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    marge = grand * marge_relative
    cote = grand - 2 * marge
    rayon = cote * 8 / 32     # meme proportion que le rx du SVG

    d.rounded_rectangle(
        [marge, marge, marge + cote, marge + cote],
        radius=rayon, fill=VERT,
    )

    def p(x: float, y: float) -> tuple[float, float]:
        return (marge + x * cote / 32, marge + y * cote / 32)

    trait = max(2, int(cote * 2 / 32))

    d.line([p(*c) for c in BASE], fill=BLANC, width=trait, joint='curve')
    d.line([p(*c) for c in PARE_BRISE], fill=BLANC, width=trait, joint='curve')
    for appui in APPUIS:
        d.line([p(*c) for c in appui], fill=BLANC, width=trait)

    # Les extremites arrondies du SVG (stroke-linecap="round").
    for x, y in [BASE[0], BASE[1], PARE_BRISE[0], PARE_BRISE[-1],
                 *APPUIS[0], *APPUIS[1]]:
        cx, cy = p(x, y)
        r = trait / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLANC)

    return img.resize((taille, taille), Image.LANCZOS)


def opaque(img: Image.Image) -> Image.Image:
    """iOS ignore la transparence et la remplace par du noir."""
    fond = Image.new('RGB', img.size, VERT)
    fond.paste(img, mask=img.split()[3])
    return fond


if __name__ == '__main__':
    dessiner(192).save('public/icon-192.png')
    dessiner(512).save('public/icon-512.png')
    # 12,5 % de marge : la zone sure des icones maskable est un cercle de 80 %.
    dessiner(512, marge_relative=0.125).save('public/icon-maskable-512.png')
    opaque(dessiner(180)).save('public/apple-touch-icon.png')
    print('icones generees dans public/')
