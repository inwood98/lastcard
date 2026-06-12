# Last Card!

A browser-based shedding card game — play solo against 1–5 computer opponents, or host an
online table for 2–4 friends (bots fill the empty seats).

**Play it:** https://inwood98.github.io/lastcard/

## Features

- Classic crazy-eights-style rules: 108-card deck, Skip / Reverse / Draw Two / Wild / Wild Draw
  Four, and a two-card penalty if you forget to call "Last card!"
- Match play to 500 points: round winners collect the value of opponents' remaining cards
- Online multiplayer over WebRTC (PeerJS) — host a room, share the invite link or 5-letter code,
  no accounts or servers needed
- Choose Easy / Medium / Hard bots and toggleable house rules: stacking Draw Twos,
  draw-until-you-can-play, and the Wild Draw Four challenge
- In-game menu with rules reference, restart, and end game; settings remembered between visits
- Responsive layout for desktop and mobile

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # engine + AI + network unit tests (Vitest)
npm run build   # production build to dist/
npm run deploy  # test, build, and publish to GitHub Pages
```

The game logic lives in `src/engine/` as a pure, fully unit-tested reducer with no React
dependencies; `src/ai/` contains the bot strategies; `src/net/` holds the host-authoritative
multiplayer (protocol, redacted views, PeerJS transport); React components in `src/components/`
render the table.

Deployment publishes the built `dist/` folder to the `gh-pages` branch, which GitHub Pages
serves at the URL above.
