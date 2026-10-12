"""Cut every app icon asset from Steven's logo. Rerun this; never hand-edit the PNGs.

    python scripts/make_icon.py

Writes app/assets/icon.png, adaptive-icon.png, splash-icon.png and favicon.png.

HIS ARTWORK IS A BADGE, AND AN APP ICON CANNOT BE ONE. The source is a blue
rounded square with a yellow border, floating on white. iOS applies its OWN
rounded mask, so a badge with its own corners and a white margin gets
double-rounded: the border is cut at the corners and the white shows as a gap.
The blue therefore runs to the edges here and the system draws the shape.

THE BUG THAT TOOK THREE ROUNDS. The first version lifted the artwork with a
plain rectangular crop, 230..1025, chosen to sit inside the yellow border. The
badge's corners are ROUNDED, so a rectangle that clears them at the corners
cuts into the artwork at the middle - and it did: 11px off the M and 26px off
the Y of SPARKY. Steven saw the Y chopped on every asset and said so three
times while the measurements here said everything was clean. They were clean.
They were measuring a block that had already lost its edges.

So the blue field is now described properly - a rounded rectangle with the same
corner radius as the badge - and the artwork is whatever ink sits inside it.
Measured, not guessed: x 219..1051, y 270..980.

THE INK IS KEYED ON RED, NOT ON DISTANCE FROM BLUE. His blue carries a strong
gradient, light at the top left and dark at the bottom right, so "how far is
this pixel from one blue" reads the gradient itself as ink near the edges. Red
does not care: the field is R<60 everywhere, the yellow is 254 and the white
255. The partial values in between are the antialiased edges of his
letterforms, which is exactly what should become partial alpha.

Steven chose the no-border version, 13 Oct 2026, having seen both at real sizes.
The border existed to separate the badge from a white page; on a home screen
there is no white page, so it was charging legibility for a job already done.

NETWORK stops being readable around 60px, which is Settings and Spotlight. That
is fine and was his call: the app's NAME sits beside the icon in both places.
The home screen is 180px, where it reads.
"""
from PIL import Image, ImageDraw
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "brand", "mr-sparky-network-logo.png")
ASSETS = os.path.join(HERE, "..", "app", "assets")

BLUE = (1, 72, 169)        # sampled from the artwork, not from a brand sheet
S = 1024

# The blue field inside his yellow border, measured off the source: the badge
# reaches full width by row 340, so the corner radius is about 185.
FIELD = (159, 161, 1095, 1093)
RADIUS = 185
# Pulled in off the border itself. Enough to clear it, nowhere near the artwork.
INSET = 25
# Below LO a pixel is field, above HI it is solid ink; between, it is an edge.
LO, HI = 60.0, 130.0


def ink_layer(path: str) -> Image.Image:
    """His artwork with the blue field removed, trimmed to the ink."""
    src = Image.open(path).convert("RGB")
    a = np.asarray(src).astype(float)
    h, w = a.shape[:2]

    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [FIELD[0] + INSET, FIELD[1] + INSET, FIELD[2] - INSET, FIELD[3] - INSET],
        radius=RADIUS - INSET, fill=255)
    field = np.asarray(m) > 128

    alpha = np.clip((a[:, :, 0] - LO) / (HI - LO), 0, 1) * field
    rgb = np.where(alpha[..., None] > 0, a, 0).astype(np.uint8)
    layer = Image.fromarray(rgb, "RGB")
    layer.putalpha(Image.fromarray((alpha * 255).astype(np.uint8), "L"))
    return layer.crop(layer.getbbox())


def compose(layer: Image.Image, fill: float, size: int = S) -> Image.Image:
    """The ink centred on the blue field, occupying `fill` of the width."""
    icon = Image.new("RGB", (size, size), BLUE)
    aw, ah = layer.size
    w = int(size * fill)
    h = int(ah * (w / aw))
    art = layer.resize((w, h), Image.LANCZOS)
    icon.paste(art, ((size - w) // 2, (size - h) // 2), art)
    return icon


art = ink_layer(SRC)
print(f"ink block {art.size[0]}x{art.size[1]}")

# iOS. The whole lockup is here now, Y included, so the same fraction of canvas
# holds more artwork and each letter is slightly smaller. 0.74 - Steven asked
# for a touch more padding than 0.78 once he could see the Y was whole.
compose(art, 0.74).save(os.path.join(ASSETS, "icon.png"))

# Android, and this is the one that cannot be argued with. The foreground sits
# on a 108dp canvas and EVERY launcher masks it to the inner 72dp, so the outer
# third is cut on every phone - not on some.
#
# An early check rendered that mask across the whole image, which made the safe
# area look far bigger than it is. That is what made Android look small and
# invited "a bit bigger"; bigger ate the lettering. 0.51 is 0.54 less the five
# percent Steven asked for, and leaves a margin inside the circle.
compose(art, 0.51).save(os.path.join(ASSETS, "adaptive-icon.png"))

# The splash - the picture held on screen for the second while the app starts.
# resizeMode is "contain", so this image's own padding is the only thing setting
# how big it looks.
compose(art, 0.58).save(os.path.join(ASSETS, "splash-icon.png"))

# The favicon is 48px: the lettering is hopeless there, so it carries the house
# alone. The house ends about 60% down the block, just above MR SPARKY.
house = art.crop((0, 0, art.size[0], int(art.size[1] * 0.60)))
fav = Image.new("RGB", (S, S), BLUE)
hw = int(S * 0.66)
hh = int(house.size[1] * (hw / house.size[0]))
h2 = house.resize((hw, hh), Image.LANCZOS)
fav.paste(h2, ((S - hw) // 2, (S - hh) // 2), h2)
fav.resize((48, 48), Image.LANCZOS).save(os.path.join(ASSETS, "favicon.png"))

for f in ("icon.png", "adaptive-icon.png", "splash-icon.png", "favicon.png"):
    p = os.path.join(ASSETS, f)
    print(f"  wrote {f:20} {Image.open(p).size}")
