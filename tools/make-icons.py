import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
BRAND = (52, 199, 89)      # #34c759 --brand de la app
BRAND_2 = (48, 209, 88)    # #30d158
INK = (255, 255, 255)


def load_font(size):
    cands = [
        'C:/Windows/Fonts/arialbd.ttf',
        'C:/Windows/Fonts/segoeuib.ttf',
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/segoeui.ttf',
    ]
    for p in cands:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def rounded_mask(size, radius, alpha=255):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=alpha)
    return m


def draw_n(size, radius_frac, font_frac, out, maskable=False):
    img = Image.new('RGB', (size, size), BRAND)
    d = ImageDraw.Draw(img)

    # leve degradado vertical (sutil, tipo Apple): de arriba (más claro) a abajo
    grad = Image.linear_gradient('L').resize((size, size))   # 0 arriba → 255 abajo
    top = Image.new('RGB', (size, size), BRAND_2)
    img = Image.composite(top, img, grad.point(lambda v: int(v * 0.25)))
    d = ImageDraw.Draw(img)

    f = int(size * font_frac)
    font = load_font(f)
    letter = 'N'
    bbox = d.textbbox((0, 0), letter, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # centrar ópticamente (ligero empuje hacia arriba)
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1] - size * 0.02
    d.text((x, y), letter, font=font, fill=INK)

    if maskable:
        # maskable: sin redondeo (rellena todo; el SO recorta el círculo)
        img.save(out)
    else:
        radius = int(size * radius_frac)
        img.putalpha(rounded_mask((size, size), radius))
        img.save(out)
    print('wrote', out, size)


draw_n(192, 0.22, 0.60, os.path.join(OUT, 'icon-192-v3.png'))
draw_n(512, 0.22, 0.60, os.path.join(OUT, 'icon-512-v3.png'))
draw_n(512, 0.0, 0.52, os.path.join(OUT, 'icon-maskable-512-v3.png'), maskable=True)
draw_n(192, 0.22, 0.60, os.path.join(OUT, 'notif-badge-v3.png'))
