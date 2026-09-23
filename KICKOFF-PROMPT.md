# Kickoff prompt for the implementing agent (Codex 5.6)

> **Historical.** This is the original one-shot build brief from 2026-08-24, kept for reference. Current agent guidance is `AGENTS.md`; design, plans and decisions live in the wiki at https://wiki.orchard.dastari.net/ (the milestone history is on [History/Milestones](https://wiki.orchard.dastari.net/History/Milestones)). The links below were retargeted from the retired `docs/` files to their wiki pages.

Copy everything below the line into the agent's first message.

---

You are building **Orchard & Cellar**, a Stardew-Valley-style pixel-art farm game, end-to-end in this repository (`/home/toby/dev/orchard-cellar`). This is a single continuous build attempt: work milestone by milestone until the game is playable and deployed locally, without stopping to ask questions. Everything you need has already been designed.

## Ground rules

1. **The docs are binding.** Start by reading, in this order: [Home](https://wiki.orchard.dastari.net/Home), [Decisions/01-TypeScript Canvas Engine](https://wiki.orchard.dastari.net/Decisions/01-TypeScript%20Canvas%20Engine), [Architecture](https://wiki.orchard.dastari.net/Architecture), [Agents/Workflow](https://wiki.orchard.dastari.net/Agents/Workflow), then [Roadmap](https://wiki.orchard.dastari.net/Roadmap). Before each feature, read the docs its roadmap milestone lists. For any world, space, resource, combat, Homestead, town, event, or POI work, read [World](https://wiki.orchard.dastari.net/World) and [Roadmap/World Editor Model](https://wiki.orchard.dastari.net/Roadmap/World%20Editor%20Model); they hold the current binding world direction. Do not re-litigate settled decisions (engine is TypeScript + Canvas 2D — not Bevy, not Phaser; authority/store is SpaceTimeDB 2.8; art is text-authored pixel grids). If reality forces a deviation, log it in the wiki [Decision Log](https://wiki.orchard.dastari.net/Decisions/Decision%20Log) (format on [Agents/Workflow](https://wiki.orchard.dastari.net/Agents/Workflow)) and update the wiki page alongside the commit.
2. **Follow the current roadmap** ([Roadmap](https://wiki.orchard.dastari.net/Roadmap)), including inserted owner-directed gates and vertical slices. The next world milestone is M5.11 Shared Spaces zoning technology demo; do not skip ahead to the sanctuary migration or production content. Each milestone ends only when its "Done when" criterion is demonstrably true. Tick milestones off on the wiki roadmap as you go, with hand-off notes if you stop mid-milestone.
3. **Git:** `git init` first. Conventional commits (`feat/fix/art/audio/balance/test/docs`), one logical change each; commit at minimum at every milestone boundary. Never leave the repo in a state where `npm run dev` or `npm test` fails at a commit.
4. **Skill files:** `.claude/skills/asset-discovery/SKILL.md`, `.claude/skills/pixel-art/SKILL.md`, `.claude/skills/game-music/SKILL.md`, and `.claude/skills/balance-tuning/SKILL.md` are mandatory working procedures. Use asset discovery whenever hunting for an entity, tile/tileset, resource/item, skill icon, prop, building, sprite, or animation; read the other skills the first time you do art, audio, or balance work, and follow them literally (especially the render→look→critique loop for every sprite).

## Verify with your own eyes — continuously

You have a shared browser (t3 preview tools). Use it as your primary progress check, not as an afterthought:

- After M0: open `http://localhost:5173` (Vite dev server), confirm the scaled 480×270 canvas renders.
- After every milestone from M1 on: open the game in the shared browser, play/exercise the new feature for a minute (move the avatar, tend a tree, run a pressing, complete a Vintage with the dev time-warp), and take a snapshot/screenshot. If what you see doesn't match the docs' description, fix it before moving on — "it compiles" is not "it works" ([Agents/Workflow](https://wiki.orchard.dastari.net/Agents/Workflow)).
- For art: also use the pipeline's review PNGs (`npm run assets:render <name>`) and actually view them before accepting any asset; compare against the style bible [Art/Style Bible](https://wiki.orchard.dastari.net/Art/Style%20Bible) and the anchor set.
- **Reference comparisons:** search `docs/reference-assets/reference-library-index.md`, then read the relevant retained sources and your own screenshot in the same session. At every visual milestone (M2, M3, M4, M8), compare honestly (detail density, silhouette readability, color warmth, grounding) and record a one-line verdict in the milestone notes on the wiki. Never copy pixels from study references or ship them.
- For audio: load the preview page's audio tab in the shared browser and listen via the recording/playback check if available; at minimum verify no errors and correct triggering.

## Subagents

You are authorized to use subagents. Recommended split — keep yourself as the single integrator with sole ownership of `packages/sim` and merge authority:

- Fan out **asset production** (sprites/tiles per the pixel-art skill, songs/SFX per the game-music skill) — these are parallel-safe once M2's pipeline and anchor set exist. Give each subagent the skill file, the style bible section, and 2–3 anchor assets as references; require the review-PNG checklist in their output.
- Fan out **test writing** (golden-number tests from the [Systems/Economy](https://wiki.orchard.dastari.net/Systems/Economy) tables, protocol/auth tests from [Architecture/Database](https://wiki.orchard.dastari.net/Architecture/Database) and [Architecture/Auth](https://wiki.orchard.dastari.net/Architecture/Auth)).
- Use a **reviewer subagent** at each milestone boundary: it reads the milestone's docs and the diff, and reports contradictions before you proceed.
- Do not parallelize engine or sim architecture work; sequential and integrated beats merged chaos there.

## Scope discipline for a one-shot

- A playable, saved, single-player game (through M5) is worth more than a broken everything. If budget/time pressure appears, finish the current milestone cleanly and cut from the tail (M8 texture breadth first, then M7 multiplayer scope per its shippable sub-steps on [History/Milestones](https://wiki.orchard.dastari.net/History/Milestones)), never from test coverage or save integrity.
- The pacing targets on [Systems/Economy](https://wiki.orchard.dastari.net/Systems/Economy) are acceptance criteria; use the dev time-warp command (build one early, M4) to verify a full Vintage → Succession → Lineage cycle without real-time waiting.
- Anti-goals ([Architecture](https://wiki.orchard.dastari.net/Architecture), non-goals) are real: no React, no Docker, no Redis, no WebGL, no mobile app wrappers.

## Definition of done for the run

`npm run dev` boots client+server; a fresh browser can register, play from first tend to first bottle at the documented pacing; state survives server restart; the determinism test, sim coverage bar (≥80%), asset validation, and typecheck all pass in CI (`npm test` / `npm run check`); every completed milestone is ticked on the wiki roadmap with a screenshot-verified note; the wiki Decision Log documents every deviation. Finish with a summary of what shipped, what was cut, and the exact commands to run the game.

Begin with the reading ritual, then M0.
