# UNO

A browser-based Uno card game — one human player versus 1–5 computer opponents.

**Play it:** https://inwood98.github.io/uno/

## Features

- Official rules as described on [unorules.com](https://www.unorules.com): 108-card deck, Skip / Reverse / Draw Two / Wild / Wild Draw Four, UNO calls with a two-card penalty
- Choose 1–5 computer opponents and Easy / Medium / Hard difficulty
- Toggleable house rules: stacking Draw Twos, draw-until-you-can-play, and the Wild Draw Four challenge
- Press the **UNO!** button in time when you're down to one card — and catch bots that forget to call theirs
- Classic Uno card styling recreated in SVG, responsive layout for desktop and mobile

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # engine + AI unit tests (Vitest)
npm run build   # production build to dist/
npm run deploy  # test, build, and publish to GitHub Pages
```

The game logic lives in `src/engine/` as a pure, fully unit-tested reducer with no React dependencies; `src/ai/` contains the three bot strategies; React components in `src/components/` render the table.

Deployment publishes the built `dist/` folder to the `gh-pages` branch, which GitHub Pages serves at the URL above.
