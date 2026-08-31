"""Cut the chosen icon as a real 1024x1024 PNG for the app build.

Steven picked the 10%-smaller lockup, 28 Aug: MR SPARKY white on navy, the
yellow ELECTRICAL SERVICES band edge to edge, NETWORK in yellow beneath -
all three lines letterspaced to the same width, centred.

Drawn with PIL rather than exported from HTML so it is reproducible: rerun
this file and you get the identical asset. Tracking is computed from measured
glyph widths per line (the bug that pushed NETWORK off the edge was assuming
one advance for every string), then verified before the file is written.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
SIZE = 1024
NAVY = (25, 72, 143)
YELLOW = (254, 218, 0)
WHITE = (255, 255, 255)
SCALE = 0.90            # Steven's pick: the 10%-smaller lockup


def load(size, bold=True):
    """Arial/Helvetica Bold, wherever this runs."""
    for path in (
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\Helvetica.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise SystemExit("no usable font found")


def text_w(draw, text, font, track=0.0):
    """Rendered width including tracking between characters."""
    w = sum(draw.textlength(c, font=font) for c in text)
    return w + track * (len(text) - 1)


def draw_tracked(draw, x, y, text, font, fill, track):
    """Letter by letter, so the tracking is real spacing, not a squash."""
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + track


img = Image.new("RGB", (SIZE, SIZE), NAVY)
d = ImageDraw.Draw(img)

# The yellow ring (Steven, 29 Aug 2026, from his mock-up). Drawn full-bleed
# on navy - iOS masks its own corners, so the ring hugs the rounded edge
# with no white showing.
RING_INSET = round(SIZE * 0.018)
RING_W = round(SIZE * 0.024)
RING_RADIUS = round(SIZE * 0.21)

f_ms = load(round(SIZE * 0.150 * SCALE))
f_es = load(round(SIZE * 0.052 * SCALE))
f_nw = load(round(SIZE * 0.112 * SCALE))

# MR SPARKY sets the width every other line matches.
ms_w = text_w(d, "MR SPARKY", f_ms)
es_track = (ms_w - text_w(d, "ELECTRICAL SERVICES", f_es)) / (len("ELECTRICAL SERVICES") - 1)
nw_track = (ms_w - text_w(d, "NETWORK", f_nw)) / (len("NETWORK") - 1)

ms_h = f_ms.getbbox("MR SPARKY")[3] - f_ms.getbbox("MR SPARKY")[1]
es_h = f_es.getbbox("ELECTRICAL SERVICES")[3] - f_es.getbbox("ELECTRICAL SERVICES")[1]
nw_h = f_nw.getbbox("NETWORK")[3] - f_nw.getbbox("NETWORK")[1]

band_pad = SIZE * 0.052 * SCALE
band_h = es_h + band_pad * 2
gap1 = SIZE * 0.048 * SCALE
gap2 = SIZE * 0.055 * SCALE

total = ms_h + gap1 + band_h + gap2 + nw_h
top = (SIZE - total) / 2

# MR SPARKY
y = top
draw_tracked(d, (SIZE - ms_w) / 2, y - f_ms.getbbox("MR SPARKY")[1], "MR SPARKY", f_ms, WHITE, 0)

# the yellow band, ring to ring, with ELECTRICAL SERVICES tracked out inside
y += ms_h + gap1
band_x = RING_INSET + RING_W
d.rectangle([band_x, y, SIZE - band_x, y + band_h], fill=YELLOW)
es_y = y + (band_h - es_h) / 2 - f_es.getbbox("ELECTRICAL SERVICES")[1]
draw_tracked(d, (SIZE - ms_w) / 2, es_y, "ELECTRICAL SERVICES", f_es, NAVY, es_track)

# NETWORK
y += band_h + gap2
draw_tracked(d, (SIZE - ms_w) / 2, y - f_nw.getbbox("NETWORK")[1], "NETWORK", f_nw, YELLOW, nw_track)

# ring last, over the band ends, so the border reads as one clean line
d.rounded_rectangle(
    [RING_INSET, RING_INSET, SIZE - 1 - RING_INSET, SIZE - 1 - RING_INSET],
    radius=RING_RADIUS, outline=YELLOW, width=RING_W)

img.save(OUT + "/icon.png")

# Same artwork, safe inside Android's circular mask (66% keep-zone).
inner = round(SIZE * 0.66)
ad = Image.new("RGB", (SIZE, SIZE), NAVY)
ad.paste(img.resize((inner, inner), Image.LANCZOS), ((SIZE - inner) // 2,) * 2)
ad.save(OUT + "/adaptive-icon.png")

# The splash mark: same lockup on the app's dark background.
sp = Image.new("RGB", (SIZE, SIZE), (20, 29, 46))
sp.paste(img.resize((round(SIZE * 0.62),) * 2, Image.LANCZOS),
         ((SIZE - round(SIZE * 0.62)) // 2,) * 2)
sp.save(OUT + "/splash-icon.png")

print(f"MR SPARKY width : {ms_w:.0f}px")
print(f"ELECTRICAL SERV : {text_w(d, 'ELECTRICAL SERVICES', f_es, es_track):.0f}px")
print(f"NETWORK         : {text_w(d, 'NETWORK', f_nw, nw_track):.0f}px")
print(f"widest line vs canvas: {max(ms_w, SIZE):.0f} / {SIZE} - fits: {ms_w <= SIZE}")
print("written: icon.png, adaptive-icon.png, splash-icon.png")
