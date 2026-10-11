import os
from PIL import Image

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', 'icons')
SRC = os.path.join(HERE, '..', 'logo-oficial.png')

# Fondo del logo oficial (casi negro) y umbral para detectar el trazo
BG = (4, 4, 4)
TRESH = 40


def _luma(im):
    return im.convert('L')


def _bands(im_g, thresh=TRESH):
    """Bandas horizontales con trazo: [(y0, y1), ...]"""
    w, h = im_g.size
    px = im_g.load()
    out, start = [], None
    for y in range(h):
        hit = False
        for x in range(0, w, 2):
            if px[x, y] > thresh:
                hit = True
                break
        if hit and start is None:
            start = y
        elif not hit and start is not None:
            out.append((start, y - 1))
            start = None
    if start is not None:
        out.append((start, h - 1))
    return out


def _bbox(im_g, y0, y1, thresh=TRESH):
    w, h = im_g.size
    px = im_g.load()
    minx, maxx = w, 0
    for y in range(y0, y1 + 1):
        for x in range(w):
            if px[x, y] > thresh:
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
    return minx, y0, maxx, y1


def load_logo():
    """Logo oficial + recorte ajustado del monograma (sin el wordmark)."""
    src = Image.open(SRC).convert('RGB')
    g = _luma(src)
    bs = _bands(g)

    # La última banda es el wordmark "NUTRI GYM"; el monograma es todo lo demás.
    if len(bs) >= 2:
        y0, y1 = bs[0][0], bs[-2][1]
    else:
        y0, y1 = bs[0][0], bs[-1][1]

    return src, src.crop(_bbox(g, y0, y1))


def _mark_square(mark, size):
    """Monograma centrado en un cuadro con el padding del logo."""
    w, h = mark.size
    side = int(max(w, h) / 0.72)
    canvas = Image.new('RGB', (side, side), BG)
    canvas.paste(mark, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def _rounded_alpha(img, radius_frac=0.22):
    size = img.size[0]
    m = Image.new('L', (size, size), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_frac), fill=255)
    img = img.convert('RGBA')
    img.putalpha(m)
    return img


def write_icon(size, out, maskable=False):
    """Icono de app con el logo oficial completo."""
    src, _ = load_logo()
    img = src.resize((size, size), Image.LANCZOS)
    if maskable:
        # Zona segura de Android: el trazo debe caber en el 80% central.
        inner = Image.new('RGB', (size, size), BG)
        k = int(size * 0.92)
        inner.paste(src.resize((k, k), Image.LANCZOS),
                    ((size - k) // 2, (size - k) // 2))
        inner.save(out)
    else:
        _rounded_alpha(img).save(out)
    print('wrote', out, size)


def write_mark(size, out):
    """Tile cuadrado solo con el monograma (para tamaños chicos de la UI)."""
    _, mark = load_logo()
    _mark_square(mark, size).save(out)
    print('wrote', out, size)


def write_badge(size, out):
    """Silueta blanca del monograma sobre transparente (barra de notificación)."""
    _, mark = load_logo()
    g = _luma(_mark_square(mark, size))
    px = g.load()
    alpha = Image.new('L', (size, size), 0)
    ap = alpha.load()
    for y in range(size):
        for x in range(size):
            v = px[x, y]
            ap[x, y] = 0 if v <= 64 else min(255, int((v - 64) * 255 / 96))
    white = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    white.putalpha(alpha)
    white.save(out)
    print('wrote', out, size)


write_icon(192, os.path.join(OUT, 'icon-192-v4.png'))
write_icon(512, os.path.join(OUT, 'icon-512-v4.png'))
write_icon(512, os.path.join(OUT, 'icon-maskable-512-v4.png'), maskable=True)
write_mark(256, os.path.join(OUT, 'logo-mark-256.png'))
write_badge(192, os.path.join(OUT, 'notif-badge-v4.png'))
