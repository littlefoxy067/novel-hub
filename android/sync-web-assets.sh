#!/usr/bin/env bash
set -euo pipefail
ANDROID_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$ANDROID_DIR/.." && pwd)"
ASSETS_DIR="$ANDROID_DIR/app/src/main/assets"
mkdir -p "$ASSETS_DIR"
cp "$PROJECT_DIR"/{index.html,app.js,api-recovery.js,library.js,sw.js,styles.css,detail-inline.css,library.css,finishing-touches.css,reader-polish.css,manifest.webmanifest,favicon.svg,icon-192.png,icon-512.png} "$ASSETS_DIR/"
printf 'Synced current Novel Hub web assets into Android app.\n'
