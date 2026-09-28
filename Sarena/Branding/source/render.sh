#!/usr/bin/env bash
# Renders every Sarena logo / app-icon asset from logo.html with headless Chromium,
# then post-processes them (alpha stripping, previews) and copies them into the
# Xcode asset catalog.
#
#   CHROME=/path/to/chrome ./render.sh
#
# Requires: chrome-headless-shell (sizes the viewport exactly; full Chrome's new
# headless mode reserves window chrome and crops the bottom), python3 + Pillow.
#   npx @puppeteer/browsers install chrome-headless-shell@stable
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../renders"
RAW="$OUT/raw"
CHROME="${CHROME:-$(command -v chrome-headless-shell || command -v headless_shell || ls /opt/pw-browsers/chromium_headless_shell-*/*/headless_shell 2>/dev/null | head -1)}"
mkdir -p "$RAW"

shot() { # shot <file> <width> <height> <query>
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --default-background-color=00000000 \
    --allow-file-access-from-files --virtual-time-budget=2000 \
    --window-size="$2,$3" --screenshot="$RAW/$1" \
    "file://$HERE/logo.html?$4&w=$2&h=$3" >/dev/null 2>&1
  echo "rendered $1"
}

# App icons (full bleed, 1024 × 1024)
shot icon-classic.png  1024 1024 "v=classic&mode=icon"
shot icon-glass.png    1024 1024 "v=glass&mode=icon"
shot icon-midnight.png 1024 1024 "v=midnight&mode=icon"
shot icon-frost.png    1024 1024 "v=frost&mode=icon"
# Seasonal icons (the dashboard's themes offer them; the member taps to apply)
shot icon-nationalday.png 1024 1024 "v=nationalday&mode=icon"
shot icon-ramadan.png     1024 1024 "v=ramadan&mode=icon"
shot icon-eid.png         1024 1024 "v=eid&mode=icon"

# iOS 18+ dark / tinted appearances of the primary icon (transparent background)
shot icon-dark.png     1024 1024 "v=classic&mode=mark&s=620"
shot icon-tinted.png   1024 1024 "v=classic&mode=mark&s=620&tint=1"

# In-app marks (transparent)
shot mark-classic.png  720 720 "v=classic&mode=mark&s=500"
shot mark-glass.png    720 720 "v=frost&mode=mark&s=500"

# Lockups (tag + SARENA + سرينا)
shot lockup-light.png  1400 1200 "v=classic&mode=lockup"
shot lockup-dark.png   1400 1200 "v=classic&mode=lockup-dark"

CATALOG="$HERE/../../Sarena/Resources/Assets.xcassets"
python3 "$HERE/postprocess.py" "$RAW" "$OUT" "$CATALOG"

# Onboarding illustrations (need SarenaLogo.png from the step above), 390 × 480 pt @3x
for p in 1 2 3; do
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --allow-file-access-from-files --virtual-time-budget=2500 \
    --window-size=1170,1440 --screenshot="$RAW/onboarding-$p.png" \
    "file://$HERE/onboarding.html?p=$p" >/dev/null 2>&1
  echo "rendered onboarding-$p.png"
done
python3 "$HERE/postprocess.py" --onboarding "$RAW" "$OUT" "$CATALOG"

# Static, pre-blurred screen backdrop (light + dark)
for mode in light dark; do
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --allow-file-access-from-files --virtual-time-budget=1500 \
    --window-size=780,1690 --screenshot="$RAW/backdrop-$mode.png" \
    "file://$HERE/backdrop.html?mode=$mode" >/dev/null 2>&1
  echo "rendered backdrop-$mode.png"
done
python3 "$HERE/postprocess.py" --backdrop "$RAW" "$OUT" "$CATALOG"

# Brand presentation sheet (uses the processed renders)
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --allow-file-access-from-files --virtual-time-budget=3000 \
  --window-size=2400,1500 --screenshot="$OUT/brand-sheet.png" \
  "file://$HERE/brand-sheet.html" >/dev/null 2>&1
echo "rendered brand-sheet.png"
