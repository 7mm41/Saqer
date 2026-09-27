#!/usr/bin/env python3
"""Post-processes raw Chromium renders into shippable assets.

- App icons are flattened to opaque RGB (App Store rejects icons with alpha).
- iOS 18 dark / tinted icon layers keep their transparency.
- Settings-screen previews and the in-app logo are written as image sets.

Usage: postprocess.py [--onboarding | --backdrop] <raw dir> <renders dir> <Assets.xcassets dir>
"""
import json
import sys
from pathlib import Path

from PIL import Image

args = sys.argv[1:]
onboarding_only = args[0] == "--onboarding"
backdrop_only = args[0] == "--backdrop"
if onboarding_only or backdrop_only:
    args = args[1:]
raw, out, catalog = (Path(p) for p in args[:3])
out.mkdir(parents=True, exist_ok=True)

ICONS = {
    # asset name        raw render          settings preview name
    "AppIcon":          ("icon-classic.png",  "IconPreview-Classic"),
    "AppIcon-Glass":    ("icon-glass.png",    "IconPreview-Glass"),
    "AppIcon-Midnight": ("icon-midnight.png", "IconPreview-Midnight"),
    "AppIcon-Frost":    ("icon-frost.png",    "IconPreview-Frost"),
}
INFO = {"author": "xcode", "version": 1}


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def opaque(img: Image.Image) -> Image.Image:
    base = Image.new("RGB", img.size, (0, 0, 0))
    base.paste(img, mask=img.getchannel("A") if img.mode == "RGBA" else None)
    return base


def trim(img: Image.Image, pad: int) -> Image.Image:
    box = img.getchannel("A").getbbox()
    img = img.crop(box)
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad))
    return canvas


if backdrop_only:
    imageset = catalog / "GlassBackdrop.imageset"
    imageset.mkdir(parents=True, exist_ok=True)
    for mode, name in (("light", "GlassBackdrop.jpg"), ("dark", "GlassBackdrop-Dark.jpg")):
        Image.open(raw / f"backdrop-{mode}.png").convert("RGB").save(imageset / name, quality=86, optimize=True)
    write_json(imageset / "Contents.json", {"images": [
        {"filename": "GlassBackdrop.jpg", "idiom": "universal", "scale": "2x"},
        {"appearances": [{"appearance": "luminosity", "value": "dark"}],
         "filename": "GlassBackdrop-Dark.jpg", "idiom": "universal", "scale": "2x"},
    ], "info": INFO})
    print("post-processed backdrop ->", imageset)
    sys.exit(0)

if onboarding_only:
    # Opaque artwork -> high quality JPEG keeps the app small.
    for index, name in enumerate(("Onboarding-Welcome", "Onboarding-Deals", "Onboarding-Codes"), start=1):
        image = Image.open(raw / f"onboarding-{index}.png").convert("RGB")
        image.save(out / f"{name}.jpg", quality=90, optimize=True, progressive=True)
        imageset = catalog / f"{name}.imageset"
        imageset.mkdir(parents=True, exist_ok=True)
        image.save(imageset / f"{name}.jpg", quality=90, optimize=True, progressive=True)
        write_json(imageset / "Contents.json", {
            "images": [{"filename": f"{name}.jpg", "idiom": "universal", "scale": "3x"}], "info": INFO})
    print("post-processed onboarding ->", out)
    sys.exit(0)

write_json(catalog / "Contents.json", {"info": INFO})

for name, (src, preview) in ICONS.items():
    icon = opaque(Image.open(raw / src).convert("RGBA"))
    icon.save(out / f"{name}.png", optimize=True)

    images = [{"filename": f"{name}.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}]
    iconset = catalog / f"{name}.appiconset"
    iconset.mkdir(parents=True, exist_ok=True)
    icon.save(iconset / f"{name}.png", optimize=True)

    if name == "AppIcon":
        # iOS 18+ home-screen appearances for the primary icon.
        dark = Image.open(raw / "icon-dark.png").convert("RGBA")
        tinted = Image.open(raw / "icon-tinted.png").convert("LA").convert("RGBA")
        dark.save(iconset / "AppIcon-Dark.png", optimize=True)
        tinted.save(iconset / "AppIcon-Tinted.png", optimize=True)
        dark.save(out / "AppIcon-Dark.png", optimize=True)
        tinted.save(out / "AppIcon-Tinted.png", optimize=True)
        for appearance, file in (("dark", "AppIcon-Dark.png"), ("tinted", "AppIcon-Tinted.png")):
            images.append({
                "appearances": [{"appearance": "luminosity", "value": appearance}],
                "filename": file, "idiom": "universal", "platform": "ios", "size": "1024x1024",
            })
    write_json(iconset / "Contents.json", {"images": images, "info": INFO})

    # Alternate icons cannot be loaded with UIImage(named:), so the Settings
    # screen shows these lightweight previews instead.
    imageset = catalog / f"{preview}.imageset"
    imageset.mkdir(parents=True, exist_ok=True)
    icon.resize((360, 360), Image.LANCZOS).save(imageset / f"{preview}.png", optimize=True)
    write_json(imageset / "Contents.json", {
        "images": [{"filename": f"{preview}.png", "idiom": "universal", "scale": "3x"}], "info": INFO})

# In-app logo marks (transparent, trimmed)
for asset, src in (("SarenaLogo", "mark-classic.png"), ("SarenaLogoFrost", "mark-glass.png")):
    mark = trim(Image.open(raw / src).convert("RGBA"), 24)
    mark.save(out / f"{asset}.png", optimize=True)
    imageset = catalog / f"{asset}.imageset"
    imageset.mkdir(parents=True, exist_ok=True)
    mark.save(imageset / f"{asset}.png", optimize=True)
    write_json(imageset / "Contents.json", {
        "images": [{"filename": f"{asset}.png", "idiom": "universal", "scale": "3x"}], "info": INFO})

lockups = {}
for lockup in ("lockup-light.png", "lockup-dark.png"):
    lockups[lockup] = trim(Image.open(raw / lockup).convert("RGBA"), 40)
    lockups[lockup].save(out / f"Sarena-{lockup}", optimize=True)

# Launch screen logo (Info.plist › UILaunchScreen › UIImageName), light + dark.
launch = catalog / "LaunchLogo.imageset"
launch.mkdir(parents=True, exist_ok=True)
for variant, lockup in (("LaunchLogo.png", "lockup-light.png"), ("LaunchLogo-Dark.png", "lockup-dark.png")):
    image = lockups[lockup]
    image.thumbnail((720, 720), Image.LANCZOS)  # ~240 pt at @3x
    image.save(launch / variant, optimize=True)
write_json(launch / "Contents.json", {"images": [
    {"filename": "LaunchLogo.png", "idiom": "universal", "scale": "3x"},
    {"appearances": [{"appearance": "luminosity", "value": "dark"}],
     "filename": "LaunchLogo-Dark.png", "idiom": "universal", "scale": "3x"},
], "info": INFO})


def color(hex_value: int, dark: int | None = None) -> dict:
    def entry(value: int) -> dict:
        r, g, b = (value >> 16) & 255, (value >> 8) & 255, value & 255
        return {"color-space": "srgb", "components": {
            "alpha": "1.000", "red": f"{r / 255:.3f}", "green": f"{g / 255:.3f}", "blue": f"{b / 255:.3f}"}}
    colors = [{"color": entry(hex_value), "idiom": "universal"}]
    if dark is not None:
        colors.append({"appearances": [{"appearance": "luminosity", "value": "dark"}],
                       "color": entry(dark), "idiom": "universal"})
    return {"colors": colors, "info": INFO}


write_json(catalog / "AccentColor.colorset" / "Contents.json", color(0xFF7900))
write_json(catalog / "LaunchBackground.colorset" / "Contents.json", color(0xFFF8F1, dark=0x170A24))

print("post-processed renders ->", out)
