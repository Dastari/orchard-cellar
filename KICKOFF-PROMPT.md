# Kickoff prompt for the implementing agent (Codex 5.6)

Copy everything below the line into the agent's first message.

---

You are building **Orchard & Cellar**, a Stardew-Valley-style pixel-art farm game, end-to-end in this repository (`/home/toby/dev/orchard-cellar`). This is a single continuous build attempt: work milestone by milestone until the game is playable and deployed locally, without stopping to ask questions. Everything you need has already been designed.

## Ground rules

1. **The docs are binding.** Start by reading, in this order: `docs/00-overview.md`, `docs/01-engine-decision.md`, `docs/02-architecture.md`, `docs/15-agent-workflow.md`, then `docs/14-roadmap.md`. Before each feature, read the docs its roadmap milestone lists. Do not re-litigate settled decisions (engine is TypeScript + Canvas 2D — not Bevy, not Phaser; DB is SQLite; art is text-authored pixel grids). If reality forces a deviation, log it in `DECISIONS.md` (format in docs/15 §2) and update the doc in the same commit.
2. **Follow the roadmap order** (`docs/14-roadmap.md`): M0 skeleton → M1 engine → M2 art foundation → M3 farm alive → M4 the chain → M5 progression/prestige → M6 server/auth → M7 multiplayer → M8 texture → M9 polish. Each milestone ends only when its "Done when" criterion is demonstrably true. Tick milestones off in docs/14 as you go, with hand-off notes if you stop mid-milestone.
3. **Git:** `git init` first. Conventional commits (`feat/fix/art/audio/balance/test/docs`), one logical change each; commit at minimum at every milestone boundary. Never leave the repo in a state where `npm run dev` or `npm test` fails at a commit.
4. **Skill files:** `.claude/skills/pixel-art/SKILL.md`, `.claude/skills/game-music/SKILL.md`, and `.claude/skills/balance-tuning/SKILL.md` are mandatory working procedures. Read each one the first time you do art, audio, or balance work, and follow it literally (especially the render→look→critique loop for every sprite).

## Verify with your own eyes — continuously

You have a shared browser (t3 preview tools). Use it as your primary progress check, not as an afterthought:

- After M0: open `http://localhost:5173` (Vite dev server), confirm the scaled 480×270 canvas renders.
- After every milestone from M1 on: open the game in the shared browser, play/exercise the new feature for a minute (move the avatar, tend a tree, run a pressing, complete a Vintage with the dev time-warp), and take a snapshot/screenshot. If what you see doesn't match the docs' description, fix it before moving on — "it compiles" is not "it works" (docs/15 §10).
- For art: also use the pipeline's review PNGs (`npm run assets:render <name>`) and actually view them before accepting any asset; compare against the style bible `docs/10-art-style-guide.md` and the anchor set.
- **Benchmark comparisons:** `references/art-inspiration/` contains six benchmark screenshots with a README mapping each to the milestones it judges (farm exterior, map layout, terrain, character close-up, seasonal crops, interior). At every visual milestone (M2, M3, M4, M8), Read the mapped benchmark and your own screenshot in the same session, compare honestly (detail density, silhouette readability, color warmth, grounding), and record a one-line verdict in the docs/14 milestone notes. These set the bar; never copy pixels from them or ship them.
- For audio: load the preview page's audio tab in the shared browser and listen via the recording/playback check if available; at minimum verify no errors and correct triggering.

## Subagents

You are authorized to use subagents. Recommended split — keep yourself as the single integrator with sole ownership of `packages/sim` and merge authority:

- Fan out **asset production** (sprites/tiles per the pixel-art skill, songs/SFX per the game-music skill) — these are parallel-safe once M2's pipeline and anchor set exist. Give each subagent the skill file, the style bible section, and 2–3 anchor assets as references; require the review-PNG checklist in their output.
- Fan out **test writing** (golden-number tests from `docs/06-progression-economy.md` tables, protocol/auth tests from docs/08–09).
- Use a **reviewer subagent** at each milestone boundary: it reads the milestone's docs and the diff, and reports contradictions before you proceed.
- Do not parallelize engine or sim architecture work; sequential and integrated beats merged chaos there.

## Scope discipline for a one-shot

- A playable, saved, single-player game (through M5) is worth more than a broken everything. If budget/time pressure appears, finish the current milestone cleanly and cut from the tail (M8 texture breadth first, then M7 multiplayer scope per docs/07 §7's shippable sub-steps), never from test coverage or save integrity.
- The pacing targets in docs/06 §10 are acceptance criteria; use the dev time-warp command (build one early, M4) to verify a full Vintage → Succession → Lineage cycle without real-time waiting.
- Anti-goals (docs/02 §Non-goals) are real: no React, no Docker, no Redis, no WebGL, no mobile app wrappers.

## Definition of done for the run

`npm run dev` boots client+server; a fresh browser can register, play from first tend to first bottle at the documented pacing; state survives server restart; the determinism test, sim coverage bar (≥80%), asset validation, and typecheck all pass in CI (`npm test` / `npm run check`); every completed milestone is ticked in docs/14 with a screenshot-verified note; DECISIONS.md documents every deviation. Finish with a summary of what shipped, what was cut, and the exact commands to run the game.

Begin with the reading ritual, then M0.
