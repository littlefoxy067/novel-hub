# Novel Hub 🦊

A bookish, editorial novel discovery site built for the Novel API.

## What is included

- Auto-sliding featured-novel hero carousel with manual controls and mobile-friendly layout.
- Novel discovery cards, search, genre shortcuts, and a popular-now list.
- Novel detail view with chapter loading.
- In-browser chapter reader with previous/next navigation.
- Local **My Shelf** saved in the visitor's browser.
- Light/dark theme toggle.
- Responsive design with a warm paper-and-ink editorial aesthetic.
- Basic safe-content filtering so explicitly adult-labelled items are not surfaced by the interface.

## API

The frontend talks directly to:

`https://novel-api.nabaikabaiaguo.workers.dev`

The app uses the documented Novel API routes for featured content, search, novel details, chapters, and chapter/content retrieval. Its response normalizer accepts common `data`, `results`, `items`, and array wrappers so small response-shape differences do not break the UI.

## Deploy on Vercel

This is a static frontend, so it can be deployed directly from the repository with Vercel.

1. Import `littlefoxy067/novel-hub` into Vercel.
2. Framework preset: **Other** (or leave the automatic static detection enabled).
3. Build command: none.
4. Output directory: `.`
5. Deploy.

No Buildy runtime or server is required.
