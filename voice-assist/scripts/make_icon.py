"""Cut every app icon asset from Steven's logo. Rerun this; never hand-edit the PNGs.

    python scripts/make_icon.py

Writes app/assets/icon.png, adaptive-icon.png, splash-icon.png and favicon.png.

HIS ARTWORK IS A BADGE, AND AN APP ICON CANNOT BE ONE. The source is a blue
rounded square with a yellow border, floating on white. iOS applies its OWN
rounded mask, so a badge with its own corners and a white margin gets
double-rounded: the border is cut at the corners and the white shows as a gap.
The blue therefore runs to the edges here and the system draws the shape.

Three things went wrong getting here, and all three were invisible in the
numbers and obvious the moment it was rendered. Render before believing.

  1. Cropping the blue field out of a ROUNDED badge keeps the corner curves, so
     his old yellow border came back as four arcs.
  2. Pasting the artwork block whole showed as a faint panel, because his blue
     carries a soft gradient and the canvas here is flat.
  3. Scaling to fill put the lettering under the border once masked.

So the ink is KEYED OUT by distance from his blue and composited onto a clean
field. Nothing of the old badge survives, and the antialiased edges of his
letterforms come through as partial alpha rather than a hard cut.

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

# Well inside the badge, so the border and its corner curves are never in frame.
CROP = (230, 230, 1025, 1025)
# Below LO a pixel is field, above HI it is solid ink; between, it is an edge.
LO, HI = 55.0, 120.0


def ink_layer(path: str) -> Image.Image:
    """His artwork with the blue field removed, trimmed to the ink."""
    src = Image.open(path).convert("RGB")
    box = np.asarray(src).astype(float)[CROP[1]:CROP[3], CROP[0]:CROP[2]]
    dist = np.sqrt(((box - np.array(BLUE, dtype=float)) ** 2).sum(axis=2))
    alpha = np.clip((dist - LO) / (HI - LO), 0, 1)
    rgb = np.where(alpha[..., None] > 0, box, 0).astype(np.uint8)
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

# iOS, back at 0.78 where it started. 0.88 measured clean against a rounded
# rectangle, but the real squircle pulls in harder than that approximation and
# Steven could see the Y touching the edge. The measurement was not wrong about
# pixels; it was answering the wrong question. An icon needs MARGIN, not the
# largest size that technically survives. He never asked for iOS to grow.
compose(art, 0.78).save(os.path.join(ASSETS, "icon.png"))

# Android, and this is the one that cannot be argued with. The foreground sits
# on a 108dp canvas and EVERY launcher masks it to the inner 72dp, so the outer
# third is cut on every phone - not on some.
#
# The first check rendered the mask across the whole image, which made the safe
# area look far bigger than it is. That is what made Android look small and
# invited "a bit bigger"; bigger ate the M, the Y and NETWORK.
#
# Measured against the real 0.667 mask, counting ink pixels lost:
#     0.54  none        0.58  147
#     0.56  41          0.62  1039
#
# So 0.54, which is slightly BELOW where this started. Android does not get to
# match iOS, and the circle makes it look larger than the number suggests
# because the visible area is smaller. Do not raise it by eye.
compose(art, 0.54).save(os.path.join(ASSETS, "adaptive-icon.png"))

# The splash - the picture held on screen for the second while the app starts.
# resizeMode is "contain", so this image's own padding is the only thing setting
# how big it looks. Back to 0.62: it fills the screen width anyway, so growing
# the artwork inside it only costs breathing room.
compose(art, 0.62).save(os.path.join(ASSETS, "splash-icon.png"))

# The favicon is 48px: the lettering is hopeless there, so it carries the house
# alone. Cropping the top 56% of the block leaves the roof and the plug.
house = art.crop((0, 0, art.size[0], int(art.size[1] * 0.56)))
fav = Image.new("RGB", (S, S), BLUE)
hw = int(S * 0.70)
hh = int(house.size[1] * (hw / house.size[0]))
h2 = house.resize((hw, hh), Image.LANCZOS)
fav.paste(h2, ((S - hw) // 2, (S - hh) // 2), h2)
fav.resize((48, 48), Image.LANCZOS).save(os.path.join(ASSETS, "favicon.png"))

for f in ("icon.png", "adaptive-icon.png", "splash-icon.png", "favicon.png"):
    p = os.path.join(ASSETS, f)
    print(f"  wrote {f:20} {Image.open(p).size}")
