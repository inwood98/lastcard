# Last Card!

A browser-based shedding card game — play solo against 1–5 computer opponents, or host an
online table for 2–4 friends (bots fill the empty seats).

## Features

- Classic crazy-eights-style rules: 108-card deck, Skip / Reverse / Draw Two / Wild / Wild Draw
  Four, and a two-card penalty if you forget to call "Last card!"
- Match play to 500 points: round winners collect the value of opponents' remaining cards
- Online multiplayer over WebRTC (PeerJS) — host a room, share the invite link or 5-letter code,
  no accounts or servers needed
- Choose Easy / Medium / Hard bots and toggleable house rules: stacking Draw Twos,
  draw-until-you-can-play, and the Wild Draw Four challenge
- Sound effects (synthesized via Web Audio API) and card-flight animations with color-flash and
  confetti on win; sounds can be toggled off in the menu
- Auto-save for solo games — resume exactly where you left off after closing the tab
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
render the table. `src/fx/` drives synthesized sounds and card-flight animations; `src/hooks/`
holds the game-state hooks for solo, host, and guest flows; `src/save.ts` and `src/storage.ts`
handle save/resume via localStorage.

Deployment publishes the built `dist/` folder to the `gh-pages` branch, which GitHub Pages
serves at the URL above.

### Backend setup (Supabase — optional)

The global leaderboard, the "My Stats" page, and the admin dashboard all read from a
[Supabase](https://supabase.com) project. Without configuration these features show "not
configured" and the rest of the game works normally.

To enable it:

1. Create a free Supabase project.
2. Open the SQL editor and run [`docs/supabase-setup.sql`](docs/supabase-setup.sql) — it creates
   the `match_results` and `banned_names` tables, the `leaderboard` view, and the row-level
   security policies.
3. **Authentication → Users → Add user** — create your admin account (email + password, with
   "Auto Confirm User" checked).
4. **Authentication → Sign In / Providers** — turn **off** "Allow new users to sign up". The
   admin policies grant full delete/ban power to any signed-in user, so sign-ups must be
   invite-only.
5. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   from **Settings → API**. These get baked into the bundle at build time, so re-run
   `npm run build` / `npm run deploy` after changing them.

The admin dashboard lives at the `#admin` URL hash (e.g. `…/lastcard/#admin`) and signs in via
Supabase Auth.

There is no anti-cheat: any client can submit results, and results are publicly readable (this
is what powers "My Stats"). That's a deliberate starting point — add server-side validation
later if it becomes a problem.
