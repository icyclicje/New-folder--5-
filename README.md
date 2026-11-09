# 🦌 Mivimoose Party

A fast-paced campfire elimination word game for **2–8 campers**. Everyone sits on a stump around the fire while the **Mivimoose** gallops to whoever's turn it is and starts puffing up. Name something that fits the category on the trail sign before it goes **POOF**! A correct, unrepeated answer sends the moose running to the next camper. If it poofs on you, you lose a life. The last camper standing wins.

## Features

- **Krillion question bank (default).** The server crawls every daily Krillion prompt since Dive #1 (805+ prompts, up to ~8,000 tiered answers each) and refreshes every few hours for new dailies.
- **Five rarity tiers.** Same structure and point ladder as Krillion's, re-skinned: 🪵 Kindling 10 · 🥾 Trailhead 30 · 🏕️ Backcountry 60 · 🌲 Deep Woods 85 · 🦌 Golden Antler 100. Each category hides one Golden Antler answer with a fun fact.
- **The Golden Antler on generated categories is the nichest *verifiable* answer.**
  - It must have an English Wikipedia article.
  - The fewest Wikipedia language editions wins; ties go to the fewest monthly readers.
  - Its fun fact is the article's first sentence plus a line like "Only ~14 people a month read its Wikipedia page."
  - With Claude on, Claude's "nichest" suggestions are checked against Wikidata and only win if they're real and nicher still.
- **The Golden Antler can move.** Generated categories keep scouting during play, and the Golden Antler moves deeper when something nicher turns up. A player who names something nicher than the current one claims it. Once found, it never moves.
- **Strong autocorrect by default.** Off / Gentle / Strong. Strong handles:
  - keyboard typos and doubled letters ("raviolli")
  - sound-alikes ("sekwoya" → Sequoia)
  - abbreviations (St, Mt, n)
  - surnames and two-word surnames ("Monet" → Claude Monet, "van gogh" → Vincent van Gogh)
  - single distinctive words ("tulip" → Tulip tree)
  - words in any order ("rex tyrannosaurus")
  - naming the category too ("golden retriever dog")
  - real-world aliases and short names pulled from Wikidata ("soccer", "pigeon", "Ford")

  Ties go to an unused answer, then to the more common, lower-scoring one. For a bare surname, the tie goes to the most famous holder of that name.
- **Live autocorrect preview.** Only the camper holding the moose sees a chip above their answer box while they type:
  - ✓ the answer it matches
  - ✨ what autocorrect will turn it into
  - 🧭 the ranger is checking, or has verified, an answer that isn't on the list
  - 🚫 already hiked, or below the tier floor

  Text that isn't on the map shows nothing, so you can't fish for answers.
- **Extra lives.** Points fill a 🍡 marshmallow meter toward an extra life. It takes a while, and you can never hold more than one life over your start.
- **What everyone can see:**
  - live typing from whoever holds the moose (or just •••, if the host turns it off)
  - their wrong guesses, struck out under their stump
  - every camper's last answer
  - leftover answers revealed after each poof
- **Pre-typing.** Your answer box is always open. Enter counts only on your turn.
- **Chat.** Public 📻 Ranger Radio chat in the lobby and in game.
- **Room codes and invite links.** Use `/r/ABCD`. Public lobbies appear on the home page.
- **Quick Trek.** Ranked matchmaking into an up-to-8-camper party with Elo ratings, ranks and a Lodge Leaderboard.
- **⚔️ Quick 1v1 Duel.** Ranked 1v1 matchmaking on one question bank for the whole match. Hike every answer in the bank and it's a tie. Custom duels can use any category you type.
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
  - **🪓 Leader's Pick.** The camper with the most lives (ties: most points) types any category, and it's generated on the fly. They get 40 seconds by default. Generation starts while they're still typing.
  - **📣 Echo Trail.** The last answer guessed seeds a related next category. That category is pre-computed while the previous round is still being played.
- **📒 Field Guide (custom questions):**
  - **Generate any category** you type, with all five tiers.
  - **Type a topic** and get a **whole question bank**. Categories stream in, and a lobby can start playing after the first few.
  - **Browse and search the full Krillion archive** and Campfire Classics.
  - **Hand-write** your own tiers.
  - Import and export as JSON.
- **⚙️ Custom campsite rules (lobby → "More campsite rules"):**
  - **Leader's Pick time:** 15–90 s.
  - **Custom-trail length:** Leader's Pick, Echo and generated categories move on to a fresh trail after N answers (default 14, ∞ = until a poof).
  - **Every-trail length:** the same limit, for every category.
  - **Easiest tier that counts:** Auto, All, No Kindling or Backcountry+.
  - **Moose path:** clockwise or random.
  - **Golden Antler heals:** finding the Golden Antler restores a lost life.
  - **Toggles:** live autocorrect preview, live typing, and revealing leftover answers after a poof.
- **🛶 Trading Post.** 12 critters, 12 hats and 8 name banners, unlocked by wins, Golden Antler finds and rating.
- **🐾 Critter bots.** Cub, Ranger and Legend bots for practice in custom games. Never in ranked.
- **Fully synthesized forest audio.** Woodpecker turn alerts, cricket fuse ticks, banjo plucks for niche answers, an elk bugle for Golden Antlers, a wolf howl on elimination, and a crackling-fire ambience.

## How questions get generated

Every typed category (Leader's Pick, Echo Trail, duel trails, the Field Guide) tries the following in order:

1. **An exact known prompt.** This is instant (Krillion, Campfire Classics, or the generated cache). If the curated list is small, the ranger keeps scouting Wikidata in the background and adds real answers without changing the curated tiers.
2. **Wikidata (no key needed).** Members of the matching class, ranked by real-world fame (how many Wikipedia editions cover each one).
   - **Readings.** It understands phrasings like "dog breed", "type of pasta", "Pixar movie", "country in Africa", "famous painter" (people ranked by their main occupation), "dinosaur" (taxa, without birds) and "Taylor Swift song".
   - **Popular pass (~1–4s).** Every member with real fame, modelled either as an instance or as a kind of the class, at any depth. Display names come from English Wikipedia, so you get "Garlic", not "Allium sativum". Taxa include famous groups, so "Owl", "Penguin" and "Swan" count for birds. The round can start here.
   - **While the round is on**, the ranger keeps searching:
     - English aliases and short names ("soccer", "pigeon", "Ford")
     - a second Wikidata engine, because the two engines' data differs slightly
     - the long tail: thousands of Backcountry and Deep Woods answers, then deeper pages
     - common-name items for animal categories ("eagle", "duck")
     - the Golden Antler, last
   - **Tiers.** Tiers follow fame percentiles. They are gentler while only the popular pass is in, and re-tiering only ever moves an answer to a more common tier. Deep Woods only keeps items that at least two Wikipedias cover.
   - **Engines.** Bulk lists use QLever, with the official Wikidata Query Service racing it. An engine that rate-limits (HTTP 429) is left alone for a while, and the other one takes over.
3. **Claude, if `ANTHROPIC_API_KEY` is set.** This runs alongside Wikidata, and the results merge live:
   - A small core stream returns the prompt, a size estimate, a Wikidata lookup hint and the obvious answers.
   - The round starts at about 12 answers.
   - Letter-range streams fan out in proportion to the category's size: 1 for small, 4 for medium, 8 for large, 13 for huge.
   - Every answer is tagged with a tier.
   - Every stream suggests its nichest answer. With a Wikidata class, the suggestion must be verified there and be nicher than Wikidata's own pick. Without one, the lowest "% who'd know it" wins.
   - An extra search wave runs while the category is still in play.
4. **Fallback.** A known prompt covering every word of the request. This is also used if Wikidata hasn't answered within 10 seconds. Otherwise, a Datamuse word-association board.

**Ranger checks** cover answers missing from a generated list:

- Wikidata, which is free, and Claude race each other, and the first "valid" wins.
- The Wikidata check finds the item by name, then:
  - **Description check.** "eagle: large carnivorous bird" ✓ for birds. This catches common names that aren't formal members of the class.
  - **Membership check.** A bounded class-membership query on the official service, with QLever as backup.
- If a verified answer is already on the map under another name, it counts as that entry ("T rex" → Tyrannosaurus), so nobody can double-dip.
- Checks start while the player is still typing, so pressing Enter is usually instant. Otherwise a check takes about 0.2–2s.

**Topic → bank:** Claude plans N categories, then generates three at a time. Without a key, the bank uses the topic's own Wikidata class plus every matching Krillion or Campfire prompt.

The default model is `claude-opus-5-5` at low effort, with server-side refusal fallbacks. Optional tuning:

| Variable | Effect |
|---|---|
| `MIVI_AI_FAST=1` | Opus fast mode (premium pricing) |
| `MIVI_AI_MODEL` | Model used for generation |
| `MIVI_AI_SLICE_MODEL` | Optional faster model for the bulk letter-range streams |
| `MIVI_AI_CONCURRENCY` | Parallel streams (default 16) |
| `MIVI_AI_WAVES` | Extra in-play search waves (default 1) |
| `MIVI_QLEVER_URL` | Alternative Wikidata SPARQL engine |
| `MIVI_CONTACT` | Contact (URL or email) added to the User-Agent sent to Wikidata and Wikipedia. Their API etiquette asks for one, and it helps avoid rate limits on busy servers. |

A large generated category with Claude streams roughly 15–30k output tokens. If cost matters, lower the waves or the concurrency.

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
  ai.js          Claude size-aware fan-out generator, answer judge, Echo prompts
  wikidata.js    Wikidata generator (fame-ranked tiers, nichest Golden Antler) + fast live judge
  fallback.js    no-key fallbacks (archive search + Datamuse associations)
  answers.js     tiered category index, strong autocorrect, Golden Antler bookkeeping
  bots.js        critter bots
  profiles.js    profile store and placement-based Elo
  cosmetics.js   Trading Post catalog
  data/bank/     Campfire Classics (36 hand-built camping categories)
public/          client (no build step): index.html, css/, js/ (SVG art and Web Audio synthesized in code)
scripts/selftest.js
```

## Credits

The game is inspired by party-game mechanics like Bomb Party and Krillion's Puffer Party, re-imagined as an original campsite game. Krillion daily prompts and tiers are read from the public fan archive at wordanswer.today, cached once per day and fetched politely.
