# 🦌 Mivimoose Party

A fast-paced campfire elimination word game for **2–8 campers**. Everyone sits on a stump around the fire while the **Mivimoose** gallops to whoever's turn it is and starts puffing up. Name something that fits the category on the trail sign before it goes **POOF**! A correct, unrepeated answer sends the moose running to the next camper. If it poofs on you, you lose a life. The last camper standing wins.

## Features

- **Krillion question bank (default).** The server crawls every daily Krillion prompt since Dive #1 (805+ prompts, up to ~8,000 tiered answers each) and refreshes every few hours for new dailies.
- **Five rarity tiers.** Same structure and point ladder as Krillion's, re-skinned: 🪵 Kindling 10 · 🥾 Trailhead 30 · 🏕️ Backcountry 60 · 🌲 Deep Woods 85 · 🦌 Golden Antler 100. Each category hides one Golden Antler answer with a fun fact.
- **Extra lives.** Points fill a 🍡 marshmallow meter toward an extra life. It takes a while, and you can never hold more than one life over your start.
- **What everyone can see:**
  - live typing from whoever holds the moose
  - their wrong guesses, struck out under their stump
  - every camper's last answer
  - leftover answers revealed after each poof
- **Pre-typing.** Your answer box is always open. Enter counts only on your turn.
- **Chat.** Public 📻 Ranger Radio chat in the lobby and in game.
- **Room codes and invite links.** Use `/r/ABCD`. Public lobbies appear on the home page.
- **Quick Trek.** Ranked matchmaking into an up-to-8-camper party with Elo ratings, ranks and a Lodge Leaderboard.
- **Six modes, 2–8 player cap:**

  | Mode | Rule |
  |---|---|
  | 🔥 Campfire Classic | Visible fuse every turn |
  | ❓ Mystery Fuse | Hidden round fuse |
  | 🌋 Wildfire | Fuse shrinks every pass |
  | 🌲 Deep Woods | Kindling answers banned |
  | 🥜 Trail Mix | New category every turn |
  | 🐺 Lone Wolf | One life |

  Every mode uses the same rules for every seat, a random first holder and a fixed clockwise order.
- **Gimmicks (every N rounds):**
  - **🪓 Leader's Pick.** The camper in the lead types any category and it's generated on the fly. Generation starts while they're still typing.
  - **📣 Echo Trail.** The last answer guessed seeds a related next category. That category is pre-computed while the previous round is still being played.
- **📒 Field Guide (custom questions):**
  - **Generate any category** you type, with all five tiers.
  - **Type a topic** and get a **whole question bank**. Categories stream in, and a lobby can start playing after the first few.
  - **Browse and search the full Krillion archive** and Campfire Classics.
  - **Hand-write** your own tiers.
  - Import and export as JSON.
- **🛶 Trading Post.** 12 critters, 12 hats and 8 name banners, unlocked by wins, Golden Antler finds and rating.
- **🐾 Critter bots.** Cub, Ranger and Legend bots for practice in custom games. Never in ranked.
- **Fully synthesized forest audio.** Woodpecker turn alerts, cricket fuse ticks, banjo plucks for niche answers, an elk bugle for Golden Antlers, a wolf howl on elimination, and a crackling-fire ambience.

## How questions get generated

| Situation | With `ANTHROPIC_API_KEY` | Without a key |
|---|---|---|
| A custom category | Four parallel streaming Claude requests, one per rarity slice. The round starts when the common answers arrive; deep cuts keep streaming in during play. Results are cached. | Matches a known Krillion or Campfire prompt that covers the request. Otherwise builds a word-association board from Datamuse. |
| Topic → bank | Claude plans N categories, then generates three at a time. | Assembles the bank from every matching Krillion or Campfire prompt. |
| Unlisted answer | An "AI Ranger judge" checks it (on generated categories). The turn timer pauses while it checks. | Rejected ("not on the trail map"). |

The default model is `claude-opus-5-5` at low effort with server-side refusal fallbacks. For more speed, set `MIVI_AI_FAST=1` (Opus fast mode, premium pricing) or `MIVI_AI_MODEL`.

## Run locally

```bash
npm install
cp .env.example .env     # optional: add ANTHROPIC_API_KEY
npm start                # http://localhost:3000
```

On first boot the server downloads the Krillion archive in the background, newest day first. It takes a few minutes, and games can start as soon as the first day is cached. Run `npm run check` (with the server running) for an end-to-end test that plays real games over Socket.IO.

## Deploy to Railway

1. Push this folder to a GitHub repo. Then in Railway: **New Project → Deploy from GitHub repo**. Or use the CLI: `railway init && railway up`.
2. Railway detects Node, runs `npm start` and injects `PORT`. The included `railway.json` sets the `/healthz` health check.
3. *(Recommended)* Add a **Volume** mounted at `/data` and set the variable `DATA_DIR=/data`. Profiles, ratings, cosmetics, the Krillion cache and generated categories then survive redeploys.
4. *(Optional)* Set `ANTHROPIC_API_KEY` to turn on the AI Ranger.
5. Under **Settings → Networking**, click **Generate Domain** and share `https://<your-app>.up.railway.app/r/CODE` with friends.

WebSockets work out of the box on Railway. Run a single instance: rooms live in memory.

## Project layout

```
server/
  index.js       Express + Socket.IO, matchmaking, API routes
  room.js        lobby, chat and the authoritative game engine (turns, fuses, gimmicks, rating)
  krillion.js    Krillion archive crawler and disk cache
  questions.js   question sources, fast on-the-fly paths, topic → bank
  ai.js          Claude streaming generator, answer judge, Echo prompts
  fallback.js    no-key generation (archive search + Datamuse associations)
  answers.js     tiered category index with plural, alias and typo matching
  bots.js        critter bots
  profiles.js    profile store and placement-based Elo
  cosmetics.js   Trading Post catalog
  data/bank/     Campfire Classics (36 hand-built camping categories)
public/          client (no build step): index.html, css/, js/ (SVG art and Web Audio synthesized in code)
scripts/selftest.js
```

## Credits

The game is inspired by party-game mechanics like Bomb Party and Krillion's Puffer Party, re-imagined as an original campsite game. Krillion daily prompts and tiers are read from the public fan archive at wordanswer.today, cached once per day and fetched politely.
