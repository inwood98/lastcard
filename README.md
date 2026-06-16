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

### Global leaderboard (optional)

The setup screen's 🏆 Leaderboard reads from a [Supabase](https://supabase.com) project and
ranks players by matches won. Solo games submit a result when a match ends. Without
configuration the button shows "not configured" and the game works normally.

To enable it:

1. Create a free Supabase project and run this in the SQL editor:

   ```sql
   create table match_results (
     id uuid primary key default gen_random_uuid(),
     player_name text not null,
     won boolean not null,
     points int,
     mode text default 'solo',
     created_at timestamptz default now()
   );

   create view leaderboard as
   select player_name,
          count(*) filter (where won) as wins,
          count(*) as games
   from match_results
   group by player_name;

   alter table match_results enable row level security;
   create policy "anon insert" on match_results for insert to anon with check (true);
   grant select on leaderboard to anon;
   ```

2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   from Settings → API. These get baked into the bundle at build time.
3. `npm run build` / `npm run deploy` picks them up.

There is no authentication or anti-cheat: any client can submit results. This is a deliberate
starting point — add auth and server-side validation later if it becomes a problem.
