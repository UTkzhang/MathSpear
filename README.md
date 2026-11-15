# Math Spear

A 2D arena game for practising mental math (CS6460 Educational Technology project).
Each enemy carries a problem. The HUD shows a target ("Find and hit 42"), and you
have to hit the one enemy whose problem equals it with the tip of your spear.

**Difficulty.** Before a run you pick where the math starts. The test round (below)
recommends a setting, but you can pick any of them.

| Difficulty | Starts with | Example |
| --- | --- | --- |
| Starter | Single-digit adding | 7+5 |
| Standard | Times tables | 7×8 |
| Advanced | Bigger numbers | 47+28 |
| Expert | Order of operations | 3+4×2 |

Difficulty only changes the math. Enemy speed, gear and gold are the same on every
setting. Problem types you skip start one number size up.

**The math ramps up slowly.** A run goes through these stages, 3 levels each, starting
where your difficulty says. It lasts until your hearts run out.

| Stage | Problems | Example |
| --- | --- | --- |
| 1 | Adding (single digits) | 7+5 |
| 2 | Subtracting | 9−4 |
| 3 | Adding and subtracting | 6+8, 7−3 |
| 4 | Multiplying | 7×8 |
| 5 | Multiplying and dividing | 6×4, 8÷2 |
| 6 | Bigger numbers: + and − | 47+28, 83−36 |
| 7 | Bigger numbers: × and ÷ | 14×3, 96÷8 |
| 8 | Order of operations | 3+4×2 |
| 9 | Parentheses | (18−6)÷3 |
| 10 | Multi-step parentheses | 2+(24÷2)×5 |
| then | Mixed review of the bigger problem types, for as long as you last | |

Every wave also has one enemy from an earlier stage, so a new stage never drops what came
before, and the run never jumps back to the start. Enemies get a little faster within each
stage. On the multi-step stages they slow back down and the problem text gets a bit
smaller, so the challenge is the math, not dodging. This is `STAGES` in `src/config.ts`.

**A short lesson before each new stage.** The first level of every stage starts with one
strategy ("the trick"), a worked example shown one step at a time, and a quick practice:
one problem to try (typed, and it doesn't count). Right or wrong, the player then sees the
steps for that problem. Lessons seen before in this browser show everything at once, Enter
goes straight to the level, and the quick practice is still there to pick.
Any lesson can be skipped. The text is `lesson` in `STAGES` (`src/config.ts`).

| Stage | Strategy | Worked example |
| --- | --- | --- |
| Adding | Make a ten | 8+5: 8+2 = 10 → 10+3 = 13 |
| Subtracting | Think addition | 9−4: 4+5 = 9 → 9−4 = 5 |
| Multiplying | Split into 5 and the rest, or use times 10 | 7×8: 5×7 = 35 → 3×7 = 21 → 35+21 = 56 |
| Multiplying and dividing | Division is multiplication backwards | 42÷6: 6×7 = 42 → 42÷6 = 7 |
| Bigger numbers | Split into tens and ones | 47+28: 47+20 = 67 → 67+8 = 75 |
| Order of operations | × and ÷ before + and − | 3+4×2: 4×2 = 8 → 3+8 = 11 (not 14) |
| Multi-step parentheses | Parentheses, then × ÷, then + − | 2+(24÷2)×5: 24÷2 = 12 → 12×5 = 60 → 2+60 = 62 |

The steps come from `src/learning/explain.ts`, which works out steps like these for any
generated problem (tests check every step's arithmetic for every problem type and size).

A wrong hit shows the real answer and starts a 5 s penalty: you blink and can't be hurt,
but your spear can't hit anything either. During those 5 s the bottom of the arena shows
the steps for the problem you hit ("7×8 = 56, not 54 · 8 is 5 and 3: 5×7 = 35 → …"). The spear is in your right hand and the shield
is in your left, held out in front. Enemies that touch you cost a heart, unless they hit
the shield. The shield sits where an enemy ends up when the spear tip just misses it, so
running at the right target a little off line bounces you off instead of costing a heart.

**Gold and the shop.** Correct hits earn gold: 10 per operation in the problem (7+5 → 10,
2+(24÷2)×5 → 30), plus up to 10 for finding the target fast. Wrong hits cost nothing but time.
The shop opens after every 3rd level. The upgrades are small on purpose, so the math stays
the challenge:

| Item | Start | Upgrades |
| --- | --- | --- |
| Speed | 200 | 4 upgrades, up to 260 (150, 300, 500, 750 gold) |
| Shield | covers 60° of your front and left | 4 upgrades, up to 120° (150, 300, 500, 750 gold) |
| Hearts | 1 | 150 gold each, up to 3 (also how you buy back a lost heart) |

The spear's size is fixed: a longer spear also runs into more wrong enemies.

**Adapting at every shop.** Each problem type with at least 3 hits since it was last rated
is rated from those hits. Accurate and fast: its numbers get one size bigger. In between:
half a size (a visible step every other shop). Missed or slow: half a size smaller, and it
comes back as review in every level (up to a third of each wave) until it's rated OK again.
There are four sizes per problem type (for example adding goes 7+5 → 11+8 → 14+13 → 19+16),
and the shop says what's getting bigger and what's coming back for practice. The
thresholds are `ADAPT` in `src/config.ts`.

**Feedback after every level, at every shop, and at the end.** Each "Level cleared" banner
shows how many hits were right and wrong. The shop also works as the summary of the last 3
levels: right and wrong hits, time to find a target, one missed problem with its steps, and
what is getting bigger or coming back for practice. The end-of-run summary shows levels
cleared (best run per difficulty, saved in the browser), gold, accuracy and average time. It
also has a table per problem type: right/total, time, and a rating that uses the shop's rule
(Strong, Getting there, Needs practice, or Too few to tell). The problems to look at again are
listed, with the steps for the latest one.

**The test round (before and after).** This is the main learning measure. It has 16
typed-answer problems in a fixed order, from facts up to parentheses: 4 adding and
subtracting, 4 times tables, 4 bigger numbers and 4 multi-step. Unlike the game, it never
adapts and never stops early. That means scores can be compared from one test to the next.
The difficulty screen pitches it as a before and after: take it now, take it again after some
play, and see how much you improved.

- **Two versions:** forms A and B match problem by problem (same type, same number sizes,
  different numbers, for example 15−7 and 13−6). They alternate, starting with A, so
  nobody just remembers the answers.
- **Before:** the difficulty screen offers it until the first test is taken.
- **It also recommends a difficulty:** each of the first three sections passes with 3 of its
  4 right, fast enough on average (6 s per answer for facts, 7 s for times tables, 12 s for
  bigger numbers). The number of sections passed in a row picks the setting: 0 is Starter,
  all 3 is Expert. This is `RECOMMEND` in `src/config.ts`.
- **After:** the end-of-game screen and the difficulty screen offer it once there have been
  10 minutes of play since the last test, or since the player last chose "Not now". It is
  never offered twice in a row, so the before and after stay apart. In between, the
  difficulty screen says how many minutes of play are left.
- **No feedback during the test:** a wrong answer just moves on, and a problem can be
  skipped. The results screen shows right answers and time per section, next to the first
  test, and lists the misses.
- **What is saved:** each test is saved in the browser (`mathspear.tests` in localStorage).
  It records the form, the date, the minutes of play before it, and every answer with its
  time. A test with 0 minutes of play is a true before-test.

The problems and the 10 minutes are `TEST` in `src/config.ts`.

**The event log and "Your data".** Every run is saved in the browser when it ends (out of
hearts, ended at the shop, or quit with Esc), in `mathspear.runs`. It records every hit
(level, problem, answer, target, right or wrong, time) and every lesson answer. The
**Your data** screen on the menu shows what is saved. **Download my data** saves it all (test
rounds and runs) as one JSON file, which is how a tester can share results; nothing is ever sent
automatically. **Delete everything** (press twice) clears it.

## Run it locally

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the problem generator, worked steps, stages and lessons, adaptivity, test round and recommendation, event log and round rules (Vitest) |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

## Demo links

| URL suffix | Opens |
| --- | --- |
| `?tutorial` | The tutorial |
| `?play` | Straight into a game (Starter) |
| `?play&difficulty=expert` | Straight into a game on a difficulty (`starter`, `standard`, `advanced`, `expert`) |
| `?seed=7` | A reproducible game (same problems every time) |

## Controls

WASD or arrow keys to move (the spear points the way you move). You can also hold the
mouse button or a finger where you want to go. The test round and the lesson problems
take typed answers, or the on-screen number pad (S skips a problem). In a
lesson, Enter goes on and S skips to the level. Esc returns to the menu.

## Deploy

`.github/workflows/deploy.yml` runs the tests, builds, and publishes to GitHub Pages on
every push to `main`. In the repo settings, set **Pages → Source** to **GitHub Actions**.
The build uses relative paths, so `dist/` also works on any static host (Netlify, Vercel,
Cloudflare Pages, itch.io) as is.

## Layout

```
src/
  config.ts            tunable values (STAGES and lessons, difficulty, test round problems and recommendation, gear and prices, gold, adaptivity)
  learning/            plain TypeScript, no Phaser, unit-tested
    expr.ts            expression trees: evaluate, format, parse
    problems.ts        problem generator (4 tiers of skills, 4 difficulty steps each)
    explain.ts         worked steps for any problem (lessons, wrong-hit hints, summaries)
    adapt.ts           rates each skill at every shop; moves its number size, picks review
    testRound.ts       the before/after test round: forms A and B, scoring, recommendation, when it's offered
    rng.ts             seeded RNG
  game/
    round.ts           round rules: targets, hits, spear lock
    run.ts             a run: levels and stages, lessons, shop cadence, gold, purchases, the saved run record
    gold.ts            gold per hit, end-of-run numbers
    physics.ts         circle movement and collisions
    hands.ts           where the spear and the shield are held
  scenes/              Phaser scenes: Menu, Setup (difficulty), Test and TestResult
                       (test round), Lesson, Game (+ tutorial script), Shop, Result
                       (summary), Data (download and delete)
  ui/widgets.ts        shared layout, text, button, panel and tooltip helpers
  ui/answerPad.ts      typed answer and on-screen number pad (test round, lessons)
tests/                 Vitest tests
```

## Scope by milestone

**Milestone 1:** project setup, movement, enemies, collisions, the problem generator,
targets, hit rules (a wrong hit reveals the answer and locks the spear), the tutorial, and an
end summary.

**Milestone 2:**
- a slow ramp of stages from single-digit facts to parentheses
- gold and a shop every 3 levels (speed, shield, hearts)
- adaptivity at every shop (number sizes, review of weak problem types)
- difficulty settings, recommended by the test round
- the before/after test round (two matching forms)
- lessons before each new stage (the trick, a worked example, a quick practice problem)
- worked steps after a wrong hit
- per-level and per-shop summaries
- a per-problem-type report at the end of a run
- the event log, with download and delete

**Next:**
- a public deploy (push to GitHub)
- testers
- tuning from their data (thresholds, lesson length, test round timing)
- a landing page
