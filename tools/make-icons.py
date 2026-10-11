import os
from PIL import Image, ImageDraw, ImageOps

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
BLACK = (10, 10, 10)       # fondo negro tipo marca
INK = (245, 245, 245)      # blanco de la N
GREEN = (110, 200, 60)     # verde del acento (hoja)

# lienzo alto para nitidez (se reescala al final)
SS = 2048


def draw_logo(size, out, bg=BLACK, radius_frac=0.20, maskable=False):
    """Dibuja la N estilizada de Nutri Gym (blanca + acento verde) sobre fondo."""
    img = Image.new('RGB', (SS, SS), bg)

    # --- N geométrica: tres trazos, dibujados en una capa alfa y luego compuestos
    layer = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # caja de la N centrada
    cx = SS * 0.50
    cy = SS * 0.50
    h = SS * 0.40          # altura de la N
    w = SS * 0.30          # ancho de la N
    s = SS * 0.088         # grosor de las astas verticales
    sd = SS * 0.105        # grosor de la diagonal (más ancha, como el logo)
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - h / 2, cy + h / 2

    # 1) asta izquierda (vertical, con corte diagonal arriba y abajo)
    d.polygon([
        (x0, y0),
        (x0 + s, y0),
        (x0 + s, y1),
        (x0, y1),
    ], fill=INK + (255,))

    # 2) asta derecha (vertical blanca completa; el verde se pinta encima
    #    solo en la parte alta, como el logo original)
    d.polygon([
        (x1 - s, y0),
        (x1, y0),
        (x1, y1),
        (x1 - s, y1),
    ], fill=INK + (255,))

    # 3) diagonal central: banda ancha que une la parte alta de la asta
    #    izquierda con la parte baja de la derecha (como el logo original)
    d.polygon([
        (x0, y0),
        (x0 + sd, y0),
        (x1, y1),
        (x1 - sd, y1),
    ], fill=INK + (255,))

    # recorte diagonal en la parte superior de la N (como el logo original)
    # se "corta" la esquina superior derecha del asta derecha y la inferior
    # izquierda de la asta izquierda para el estilo angular.
    # (ya implícito por los polígonos; afinamos con un par de triángulos)

    img = Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')
    d = ImageDraw.Draw(img)

    # --- acento verde: galón que sobresale por encima del asta derecha, con
    #     punta inferior izquierda que se engancha a la diagonal (logo original)
    glayer = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glayer)
    gv = SS * 0.205        # altura total del galón
    gw = SS * 0.118        # ancho (≈ asta derecha)
    bx = x1 - gw * 0.55
    by = y0 - SS * 0.022   # sobresale un poco por encima del asta
    gd.polygon([
        (bx + gw * 0.18, by),                # sup-izq (ligeramente recortada)
        (bx + gw, by + SS * 0.004),          # sup-der (la punta más alta)
        (bx + gw, by + gv),                  # inf-der
        (bx + gw * 0.12, by + gv * 0.55),    # punta inf-izq (se engancha)
    ], fill=GREEN + (255,))
    img = Image.alpha_composite(img.convert('RGBA'), glayer).convert('RGB')

    # reescalar al tamaño final con suavizado de alta calidad
    img = img.resize((size, size), Image.LANCZOS)

    if maskable:
        img.save(out)
    else:
        m = Image.new('L', (size, size), 0)
        md = ImageDraw.Draw(m)
        md.rounded_rectangle([0, 0, size - 1, size - 1],
                             radius=int(size * radius_frac), fill=255)
        img.putalpha(m)
        img.save(out)
    print('wrote', out, size)


draw_logo(192, os.path.join(OUT, 'icon-192-v3.png'))
draw_logo(512, os.path.join(OUT, 'icon-512-v3.png'))
draw_logo(512, os.path.join(OUT, 'icon-maskable-512-v3.png'), maskable=True)
draw_logo(192, os.path.join(OUT, 'notif-badge-v3.png'))
