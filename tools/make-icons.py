import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')

# Paleta de marca (verde gimnasio) sobre fondo oscuro profundo
BG_TOP = (13, 26, 17)      # casi negro con tinte verde (arriba)
BG_BOT = (7, 16, 11)       # más oscuro (abajo)
GREEN = (62, 200, 96)      # verde energético del acento
GREEN_D = (38, 150, 70)    # verde más profundo para sombreado
INK = (245, 247, 245)      # blanco de los trazos

# lienzo alto para nitidez (se reescala al final)
SS = 2048


def _lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _rrect(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)


def draw_logo(size, out, maskable=False):
    """Monograma original 'NG' + mancuerna, sobre degradado verde-oscuro."""
    img = Image.new('RGB', (SS, SS), BG_TOP)
    # degradado vertical sutil
    grad = Image.new('RGB', (SS, SS))
    gd = ImageDraw.Draw(grad)
    for y in range(SS):
        gd.line([(0, y), (SS, y)], fill=_lerp(BG_TOP, BG_BOT, y / SS))
    img = grad

    layer = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # --- Monograma "NG" ocupando la banda inferior-centro ---
    # N (izquierda): astas verticales + diagonal
    nx0 = SS * 0.14
    ny0 = SS * 0.54
    ny1 = SS * 0.80
    n_stem = SS * 0.052
    n_diag = SS * 0.066
    # asta izq
    _rrect(d, [nx0, ny0, nx0 + n_stem, ny1], n_stem * 0.18, INK)
    # asta der
    nx1 = nx0 + SS * 0.155
    _rrect(d, [nx1, ny0, nx1 + n_stem, ny1], n_stem * 0.18, INK)
    # diagonal de la N (de arriba-izq a abajo-der)
    d.polygon([
        (nx0, ny0),
        (nx0 + n_diag, ny0),
        (nx1 + n_stem, ny1),
        (nx1 + n_stem - n_diag, ny1),
    ], fill=INK)

    # G (derecha): arco abierto con barra horizontal
    gx0 = nx1 + n_stem + SS * 0.03
    gy0 = ny0
    gy1 = ny1
    gcx = gx0 + (ny1 - ny0) / 2
    gcy = (ny0 + ny1) / 2
    gr_out = (ny1 - ny0) / 2
    gr_in = gr_out - n_stem
    # anillo: elipse verde-blanca; luego se pinta encima el hueco
    d.ellipse([gcx - gr_out, gcy - gr_out, gcx + gr_out, gcy + gr_out], fill=INK)
    d.ellipse([gcx - gr_in, gcy - gr_in, gcx + gr_in, gcy + gr_in], fill=(0, 0, 0, 0))
    # abrir el anillo por la derecha (boca del "G"), solo arriba de la mitad
    d.rectangle([gcx, gcy - gr_out - 2, gcx + gr_out + 2, gcy - n_stem * 0.1],
                fill=(0, 0, 0, 0))
    # barra horizontal del "G" que entra hacia el centro (la oreja característica)
    _rrect(d, [gcx - n_stem * 0.2, gcy - n_stem * 0.5,
               gcx + gr_out * 0.92, gcy + n_stem * 0.5], n_stem * 0.25, INK)

    # --- Mancuerna arriba (sobre el monograma) ---
    bar_y = SS * 0.30
    bar_h = SS * 0.055
    bar_x0 = SS * 0.30
    bar_x1 = SS * 0.70
    _rrect(d, [bar_x0, bar_y - bar_h / 2, bar_x1, bar_y + bar_h / 2],
           bar_h * 0.5, INK)
    # discos en los extremos (dos placas por lado)
    disc_w = SS * 0.05
    disc_h = SS * 0.14
    disc_r = disc_w * 0.45
    for cx, sgn in ((bar_x0, -1), (bar_x1, 1)):
        for off, dh in ((0.0, 1.0), (0.055, 0.72)):
            cxp = cx + sgn * (off * SS)
            _rrect(d, [cxp - disc_w / 2, bar_y - disc_h * dh / 2,
                       cxp + disc_w / 2, bar_y + disc_h * dh / 2], disc_r, GREEN)

    img = Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')

    # leve brillo del acento verde alrededor del anillo del G (ya en capa)

    img = img.resize((size, size), Image.LANCZOS)

    if maskable:
        img.save(out)
    else:
        m = Image.new('L', (size, size), 0)
        md = ImageDraw.Draw(m)
        md.rounded_rectangle([0, 0, size - 1, size - 1],
                             radius=int(size * 0.22), fill=255)
        img.putalpha(m)
        img.save(out)
    print('wrote', out, size)


draw_logo(192, os.path.join(OUT, 'icon-192-v3.png'))
draw_logo(512, os.path.join(OUT, 'icon-512-v3.png'))
draw_logo(512, os.path.join(OUT, 'icon-maskable-512-v3.png'), maskable=True)

# badge de notificación: silueta del monograma (se ve la marca en la barra)
img = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
src = Image.open(os.path.join(OUT, 'icon-192-v3.png')).convert('RGBA')
# recorta a la parte blanca (monograma) sobre transparente
img = src
img.save(os.path.join(OUT, 'notif-badge-v3.png'))
print('wrote notif-badge-v3.png')
