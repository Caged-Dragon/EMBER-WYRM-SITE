# Ember Wyrm — standalone site

This is a complete, independent website — not a component of the main
DracoPyre Strike app. Build and deploy it on its own:

```bash
npm install
npm run build    # outputs a single self-contained dist/index.html
```

Because this project uses `vite-plugin-singlefile`, `dist/index.html` is the
entire site — every asset is inlined. You can deploy that one file to any
static host (Vercel, Netlify, GitHub Pages, itch.io, S3, etc.) with no
further build step needed on the host's side.

## Connecting it back to DracoPyre Strike

The main site links to this game externally rather than embedding it. Once
you've deployed this and know its real URL, update the placeholder in the
main project:

```ts
// dracopyre-strike/src/data/games.ts
externalUrl: 'https://ember-wyrm.dracopyrestrike.game',   // <- replace with your real deployed URL
```

That's the only change needed — every "Play Now" button, card, and the
`/play` fallback card in DracoPyre Strike already read this field and will
pick up the new URL automatically.
