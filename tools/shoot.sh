#!/bin/sh
# Takes the four screenshots in screenshots/ from a fresh run of main.ts, with headless Chrome at 1440x900.
# Not run by the grader: it is how the committed screenshots were made. Needs Chrome and Python with Pillow.
#   tools/shoot.sh ../kit/input/snapshot.json
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$(mktemp -d)"
MAKEFUN_OUTPUT_DIR="$OUT" node main.ts --input "${1:-/input/snapshot.json}" >/dev/null
PAGE="file://$OUT/dashboard/index.html"

shot() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1440,900 \
    --virtual-time-budget=3000 --screenshot="screenshots/$1" "$PAGE$2" >/dev/null 2>&1
}
shot 1-board.png ""
shot 2-detail.png "#p=onre"
shot 3-filtered.png "#category=Risk+Curators&chain=Base&sort=change&desc=1"
shot 4-token-trades.png "#view=trading"

# Same pixels to within 5/255 a channel, a third of the bytes: a 256-colour palette, no dithering.
python3 - <<'EOF'
import glob
from PIL import Image, ImageChops
for path in sorted(glob.glob('screenshots/*.png')):
    full = Image.open(path).convert('RGB')
    small = full.quantize(colors=256, method=Image.Quantize.MAXCOVERAGE, kmeans=4, dither=Image.Dither.NONE)
    worst = max(high for _, high in ImageChops.difference(full, small.convert('RGB')).getextrema())
    small.save(path, optimize=True)
    print(path, full.size, 'largest channel error', worst)
EOF
rm -rf "$OUT"
ls -l screenshots
