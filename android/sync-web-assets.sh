#!/usr/bin/env bash
set -euo pipefail
ANDROID_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$ANDROID_DIR/.." && pwd)"
ASSETS_DIR="$ANDROID_DIR/app/src/main/assets"
mkdir -p "$ASSETS_DIR"
cp "$PROJECT_DIR"/{index.html,app.js,api-recovery.js,library.js,sw.js,styles.css,detail-inline.css,library.css,finishing-touches.css,reader-polish.css,manifest.webmanifest,favicon.svg,icon-192.png,icon-512.png} "$ASSETS_DIR/"
test -s "$ASSETS_DIR/android-polish.css"
python3 - "$ASSETS_DIR" <<'PY'
from pathlib import Path
import re
import sys

assets = Path(sys.argv[1])
styles = assets / 'styles.css'
css = styles.read_text()
css = re.sub(r"^@import url\('https://fonts\.googleapis\.com/[^']+'\);\s*", '', css, count=1)
styles.write_text(css)

index = assets / 'index.html'
html = index.read_text()
html, manifest_removed = re.subn(r'\s*<link rel="manifest"[^>]*>', '', html, count=1)
if not manifest_removed:
    raise SystemExit('Expected PWA manifest link was not found in the bundled index.html')
html = html.replace('</head>', '  <link rel="stylesheet" href="/android-polish.css">\n</head>', 1)
index.write_text(html)

for pwa_file in ('manifest.webmanifest', 'sw.js'):
    (assets / pwa_file).unlink(missing_ok=True)

library = assets / 'library.js'
script = library.read_text()
script, removed = re.subn(r"\s*window\.addEventListener\('load',\s*\(\)\s*=>\s*navigator\.serviceWorker\.register\('/sw\.js'\)\.catch\(\(\)\s*=>\s*\{\}\),\s*\{\s*once:\s*true\s*\}\);", '', script, count=1)
if not removed:
    raise SystemExit('Expected PWA service-worker registration was not found in the bundled library.js')
library.write_text(script)
PY

for name in api-recovery.js app.js library.js; do
  source="$ASSETS_DIR/$name"
  npx --yes terser@5.43.1 "$source" --compress --mangle --output "$source.min"
  mv "$source.min" "$source"
done
printf 'Synced site code into the Android APK bundle; removed web-install/service-worker and remote font dependencies and minified bundled JavaScript.\n'
