from PIL import Image, ImageDraw, ImageFilter
import math, os, json, numpy as np
S = 1024
VARIANTS = {  # name: (c1, c2, glowA, glowB, star)
    "AppIcon-Night":   ((18, 24, 58), (4, 6, 20), (90, 70, 200, 150), (30, 120, 160, 120), (255, 214, 102)),
    "AppIcon-Desert":  ((236, 176, 84), (168, 92, 44), (255, 236, 170, 150), (255, 150, 90, 130), (255, 255, 255)),
    "AppIcon-Emerald": ((24, 168, 120), (10, 84, 92), (170, 255, 210, 140), (40, 200, 190, 120), (255, 230, 120)),
    "AppIcon-Rose":    ((244, 114, 150), (124, 72, 214), (255, 190, 220, 150), (140, 200, 255, 120), (255, 240, 170)),
}
def make(c1, c2, ga, gb, star):
    y, x = np.mgrid[0:S, 0:S]; t = ((x + y) / (2 * S))[..., None]
    arr = (np.array(c1) * (1 - t) + np.array(c2) * t).astype(np.uint8)
    img = Image.fromarray(arr, "RGB").convert("RGBA")
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    g.ellipse((560, -120, 1160, 480), fill=ga); g.ellipse((-160, 560, 420, 1140), fill=gb)
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(110)))
    card = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
    d.rounded_rectangle((170, 170, 854, 854), radius=170, fill=(255, 255, 255, 60), outline=(255, 255, 255, 170), width=10)
    img = Image.alpha_composite(img, card)
    mask = Image.new("L", (S, S), 0); md = ImageDraw.Draw(mask)
    md.ellipse((300, 250, 680, 630), fill=255); md.ellipse((395, 215, 755, 575), fill=0)
    img.paste(Image.new("RGBA", (S, S), (255, 255, 255, 255)), (0, 0), mask)
    cx, cy, r1, r2 = 640, 520, 78, 33
    pts = [(cx + (r1 if k % 2 == 0 else r2) * math.cos(-math.pi / 2 + k * math.pi / 5),
            cy + (r1 if k % 2 == 0 else r2) * math.sin(-math.pi / 2 + k * math.pi / 5)) for k in range(10)]
    d = ImageDraw.Draw(img); d.polygon(pts, fill=star + (255,))
    d.polygon([(290, 690), (505, 730), (505, 830), (290, 790)], fill=(255, 255, 255, 240))
    d.polygon([(734, 690), (519, 730), (519, 830), (734, 790)], fill=(255, 255, 255, 215))
    return img.convert("RGB")
CAT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ThaqafaIslamiya", "Assets", "Assets.xcassets")
info = {"author": "xcode", "version": 1}
def imageset(name, im):
    p = f"{CAT}/{name}.imageset"; os.makedirs(p, exist_ok=True)
    im.resize((360, 360), Image.LANCZOS).save(f"{p}/{name}.png", optimize=True)
    json.dump({"images": [{"filename": f"{name}.png", "idiom": "universal"}], "info": info}, open(f"{p}/Contents.json", "w"), indent=2)
for name, pal in VARIANTS.items():
    im = make(*pal)
    p = f"{CAT}/{name}.appiconset"; os.makedirs(p, exist_ok=True)
    im.save(f"{p}/{name}.png", optimize=True)
    json.dump({"images": [{"filename": f"{name}.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}], "info": info},
              open(f"{p}/Contents.json", "w"), indent=2)
    imageset(name.replace("AppIcon-", "IconPreview-"), im)
imageset("IconPreview-Classic", Image.open(f"{CAT}/AppIcon.appiconset/AppIcon.png").convert("RGB"))
sheet = Image.new("RGB", (5 * 200, 200), "white")
for i, n in enumerate(["Classic", "Night", "Desert", "Emerald", "Rose"]):
    sheet.paste(Image.open(f"{CAT}/IconPreview-{n}.imageset/IconPreview-{n}.png").resize((190, 190)), (i * 200 + 5, 5))
sheet.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons_sheet.png"))
