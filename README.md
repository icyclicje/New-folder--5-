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
- **Gimmicks.** Special rounds come every 2–6 rounds, **every round** (every new trail, including when a long trail runs out), or **every turn** (every accepted answer hands the next camper a special round):
  - **🪓 Leader's Pick.** A camper types any category, and it's generated on the fly. Who carves is a room rule:
    - **Most lives** (default; ties go to most points). A crown marks the leader.
    - **Take turns.** Every camper carves in seat order, skipping anyone who's out. An axe marks who's next.
    - **Random.** The ranger draws a name.

    They get 40 seconds by default, and generation starts while they're still typing.
  - **📣 Echo Trail.** The last answer guessed seeds a related next category. That category is pre-computed while the previous round is still being played. On "every turn", each answer branches the trail again, so the category changes with every pass of the moose.
- **A distinctive look, drawn entirely in code.** No image files or emoji fonts:
  - **Dusk Ranger** style: an indigo night with ember light, 70s sunset stripes, paper grain and topographic contour lines on the cards.
  - **Art:** shaded storybook mascots with a campfire rim light, the Mivimoose (snout, bell and wide palmate antlers — and it's alive: it blinks, twitches its ears, wags its tail and nods while it waits; its blush deepens as it puffs; worried brows and a nervous mouth on a low fuse; wide eyes just before it pops), a campfire with layered flames, mossy stumps, and a moonlit lake under three rows of pines.
  - **Campsite emblem** on the home page; matching favicon.
  - **Icons:** one duotone line set; emoji from the server and UI are swapped for it automatically.
  - **Type:** Fraunces for display and Manrope for the interface.
  - **Around the fire:** a dotted trail ring links the stumps.
- **📒 Field Guide (custom questions):**
  - **Generate any category** you type, with all five tiers.
  - **Type a topic** and get a **whole question bank**. Categories stream in, and a lobby can start playing after the first few.
  - **Browse and search the full Krillion archive**, Campfire Classics and generated trails.
    - **Simple search** ranks by relevance, shrugs off typos ("pokmon") and matches as you type ("taylor sw").
    - **Advanced search** finds every trail that has an answer ("Pikachu" → 8 trails, with its tier on each), plus a minimum size and sorting by best match, newest, most or fewest answers. The answer index is built in the background and kept compact (one string per trail).
  - **Hand-write** your own tiers.
  - Import and export as JSON.
- **⚙️ Custom campsite rules (lobby → "More campsite rules"):**
  - **Who carves the trail** (Leader's Pick): most lives, take turns, or random.
  - **Leader's Pick time:** 15–90 s.
  - **Game length:** play to the last camper standing (default), or end after 1–30 rounds. Standings go by lives, then points, and campers level on both share the win.
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
3. **The hunt: Wikipedia.** This runs alongside Wikidata when there's no key (`server/hunt.js`), and merges into Claude's category when there is one:
   - **Lists that are the category.** A "List of …" page is used only when its title is the category exactly ("List of goat breeds", "List of Pixar films" for "Pixar movie", "List of songs by Taylor Swift") or almost exactly (one extra word, like a regional list, which only fills in). An exact list is always read, and it also runs alongside Claude. Loosely related lists ("films about cheese") are never used, and broad questions never use lists.
   - **Wikipedia categories** ("Category:Goat breeds", plus relevant subcategories when the main one is thin). List entries are kept only if their own page description fits the question.
   - **The nichest answer, early.** The Golden Antler is placed as soon as readership or the first Wikidata pass is in, then moves deeper if something nicher turns up.
   - **Fame from real readership.** Every answer is ranked by its Wikipedia page's monthly readers, so Kindling is what people actually know (Boer, Angora and Saanen for goat breeds).
   - **Deep search** when the quick pass is thin:
     - re-phrasings ("breed of goat" → "goat breed", plurals, "movie" → "film");
     - the topic article's own "List of …" links;
     - a full-text search that keeps only pages whose description says they belong.
   - **Approximation** for questions too broad to list ("something red", "something you find at the beach", Echo Trail's "linked to …"). The ranger builds a best-guess trail from the question's key concept, using word associations plus the concept's own Wikipedia article. It keeps the player's exact wording.
   - **Polite by design.** Requests to Wikipedia go one at a time. If Wikimedia says 429, the hunt skips it for a cool-down period and carries on with the other sources instead of stalling. Set `MIVI_CONTACT`; Wikimedia throttles anonymous clients harder.
4. **Claude, if `ANTHROPIC_API_KEY` is set.** This runs alongside Wikidata and Wikipedia, and the results merge live:
   - A small core stream returns the prompt, a size estimate, a Wikidata lookup hint and the obvious answers.
   - The round starts at about 12 answers.
   - Letter-range streams fan out in proportion to the category's size: 1 for small, 4 for medium, 8 for large, 13 for huge.
   - Every answer is tagged with a tier.
   - Every stream suggests its nichest answer. With a Wikidata class, the suggestion must be verified there and be nicher than Wikidata's own pick. Without one, the lowest "% who'd know it" wins.
   - An extra search wave runs while the category is still in play.
   - **Deep web search.** Claude's web search tool (`web_search_20260209`) runs:
     - **straight away** for live questions — a channel's videos ("Name a YouTube video from MrBeast"), streamers, podcasts, "latest" or this year's releases;
     - for small, niche categories Wikidata can't verify;
     - when Claude alone would say there are too few answers, or its first pass comes up thin.

     Web-found answers stream in as they're confirmed. Unlisted answers on a live trail get a web-checked ranger ruling if Claude's memory says no.
5. **Fallback.** Only if every search comes up empty:
   - a known prompt covering every word of the request;
   - then a word-association board;
   - finally, in the room, the **closest known trail** to what was asked (not a random one), with a note explaining why.

   If the time limit is reached while answers are already in, the round starts with them and the hunt keeps searching. Live-web questions without a key say they need web search instead of guessing.

**Ranger checks** cover answers missing from a generated list:

- Wikidata, Wikipedia (both free) and Claude race each other, and the first "valid" wins.
- **Built to keep working when Wikimedia is busy.** Wikipedia and Wikidata's API sometimes rate-limit a server, so the ranger finds names five ways at once:
  - Wikidata's search API;
  - the same alias-aware search run **server-side through the query service** (unaffected by this server's API limits);
  - an exact label-and-alias lookup ("sax", "T. rex");
  - Wikipedia's search, with the category as context ("up" + "Pixar film" → Up), its "did you mean" and redirect nicknames;
  - **spelling help from Datamuse**, which isn't Wikimedia at all ("dachsund" → dachshund, "bald egle" → bald eagle, "rembrant" → Rembrandt).

  Each source gets about 1.8 s, so a slow one can't hold the verdict up.
- **A fast lane.** For direct classes (dog breeds, countries, painters), a full-text search restricted to the class runs in parallel: "lab" among dog breeds → Labrador Retriever in about 0.2–0.4 s. An obscure namesake found this way (a painting called "Piano") only stands if the broad check finds nothing better.
- **Evidence.** An answer counts if its description fits, it's a member of the class, it's among the entity's works, or its Wikipedia categories say so ("Up" sits in "Pixar animated films", even though Wikidata lacks the link). Category evidence needs the class as the category's head noun, so "Musical instrument parts and accessories" doesn't make a microphone an instrument.
- **No namesake tricks.** If what you typed is, word for word, someone famous outside the category, a near-miss namesake inside it doesn't count. "shakespeare" isn't the painter Dorothy Shakespear.
- **Remembered verdicts.** Rulings the ranger is sure of are saved to `data/judge-cache.json`, so a repeated answer is instant across games and restarts. A rejection counts as sure only when every source really answered, so a timeout or rate limit is never remembered as "wrong".
- **On hunted trails**, an unlisted answer counts if its Wikipedia page sits in one of the trail's Wikipedia categories or its description fits the question. On approximate trails, the answer's own associations must point back at the question's concept. A seashell's associations include "beach"; "red" is one of the first words used to describe a strawberry, but not a banana.
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
| `MIVI_AI_JUDGE_MODEL` | Optional faster model for live referee calls (the ranger's Claude checks) |
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
  ai.js          Claude size-aware fan-out generator, web-search deep search, answer judges, Echo prompts
  wikidata.js    Wikidata generator (fame-ranked tiers, nichest Golden Antler) + fast live judge
  hunt.js        the hunt: Wikipedia categories/lists, deep re-phrasings, approximations for broad questions + judge
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
