# 15 — Agent Implementation Workflow

The working agreement for every implementing agent (Opus 5 / Codex / Grok) on Orchard &
Cellar. This document is binding in the same way [01-engine-decision.md](01-engine-decision.md)
is: follow it, or log why you didn't (see §2). It exists so that dozens of sessions by
different models produce one coherent codebase, not an archaeology site.

## 1. Session startup ritual

Every session, in order, before writing any code:

1. Read [00-overview.md](00-overview.md) — the doc map. Know what documents exist.
2. Read your assigned milestone in [14-roadmap.md](14-roadmap.md), including its
   "depends on" and "docs" fields.
3. Read **only** the docs that milestone references, plus 01 and 02 if you haven't this
   session. Do not read the whole suite every time; do not skim past the sections that
   specify your task.
4. Read `DECISIONS.md` at repo root (it is short by design — see §2).
5. Claim the milestone per §8 before touching code.

**Never begin coding without locating the doc section that specifies the feature.** If
you cannot find one, that is a finding, not a license — write it up as an open question
in `DECISIONS.md` and ask, or pick a task that *is* specified.

**Docs win over code.** If the code contradicts the docs, the code is wrong and you fix
the code — *unless* a `DECISIONS.md` entry explicitly supersedes the doc, in which case
the doc should already have been updated; if it wasn't, updating it is part of your task.

## 2. DECISIONS.md — the deviation log

A single append-only file at repo root. One line per entry:

```
YYYY-MM-DD | area | decision | reason | supersedes
2026-09-02 | sim/economy | pomace yield rounds down, not banker's | doc 06§2 ambiguous; floor matches golden table | —
2026-09-05 | deps | added fast-check for property tests | determinism tests need it; within 02 budget | —
```

Rules:

- **Append only.** Never edit or delete prior entries. To reverse a decision, append a
  new entry naming the old one in `supersedes`.
- **Any deviation from the docs MUST be logged here, and the affected doc updated in
  the same commit.** A deviation that lives only in code is a bug.
- Open questions and blockers (§9) also go here, prefixed `OPEN:` in the decision field,
  resolved by a later entry that supersedes them.
- If `DECISIONS.md` does not exist yet, the first agent to need it creates it with the
  format line above as a header comment.

## 3. Code conventions

- **TypeScript strict** everywhere (`tsconfig.base.json`, per 02). No `any` without an
  adjacent `// why:` comment explaining the escape hatch.
- **No new dependencies** without a `DECISIONS.md` entry. The dependency budget is the
  stack table in [02-architecture.md](02-architecture.md); everything outside it needs
  a logged reason. Prefer 50 lines of in-repo code to a package.
- **`packages/sim` is pure**: zero imports from client or server, no DOM, no Node APIs.
  `Math.random` and `Date.now` are **banned in sim** — enforced by lint rule
  (`no-restricted-properties`); use `rng.ts` and the tick counter. Do not disable the rule.
- File size soft cap: **400 lines**. Crossing it is a smell — split by responsibility
  before it becomes a junk drawer. (Generated files and `balance.ts` are exempt.)
- **Prefer boring code over clever.** Plain functions, plain data, explicit control
  flow. The next agent has no memory of your session; optimize for their comprehension,
  not your elegance. If a trick needs a comment to be safe, use the boring version instead.

## 4. Testing discipline

Vitest, per 02. The bar:

- **Golden-number tests**: every economy/prestige formula gets a test that quotes the
  literal expected values from the tables in [06-progression-economy.md](06-progression-economy.md).
  Test names include the doc section, e.g. `06§3 vintage terroir table`,
  `06§1 tree upgrade cost curve`. When a balance table changes, the doc, `balance.ts`,
  and the golden test change in the same commit (see §7).
- **Determinism test** (runs in CI): construct a state, run the same seed + action
  sequence through `advanceTick` twice from scratch, deep-equal the resulting states.
  Any nondeterminism is a release blocker, not a flake.
- Minimum coverage bar: `sim` ≥ 80% lines; every server route tested for the happy
  path **and** the auth-failure path; client tested at the logic layer (input mapping,
  prediction/reconciliation, UI state) — do not attempt to assert on rendered pixels.

## 5. Definition of Done (per task)

A task is done when **all** of these hold:

- [ ] `tsc` clean across the workspace
- [ ] `npm test` passes, including new tests for the change
- [ ] `npm run assets:validate` passes (if assets touched)
- [ ] `npm run dev` boots and the feature is demonstrated live via the preview/run
      workflow (`/run`) — screenshot required for any visual work
- [ ] Doc cross-references updated (if you changed behavior a doc describes)
- [ ] `DECISIONS.md` entry appended (if you deviated)
- [ ] Roadmap checkbox ticked in [14-roadmap.md](14-roadmap.md)

"It compiles" satisfies exactly one of seven boxes.

## 6. Asset work

- Always work through the **`.claude/skills/pixel-art` skill** for sprites/tiles/maps
  and the **`game-music` skill** for songs and SFX. They encode
  [10-art-style-guide.md](10-art-style-guide.md) and [11-asset-pipeline.md](11-asset-pipeline.md)
  as working instructions; do not freehand around them.
- **Never commit atlases** (`atlas_*.png`, `atlas.meta.json`) — they are build
  artifacts and gitignored. Commit `*.sprite.json` / `*.tile.json` / `*.song.json`
  sources only.
- Every asset PR includes the review checklist from
  [10-art-style-guide.md](10-art-style-guide.md) §8, filled in item by item — including
  the "rendered next to 3 approved neighbors" line with the preview screenshot attached.

## 7. Commit conventions

Conventional commits with these types: `feat` `fix` `art` `audio` `docs` `balance`
`test` (plus `chore` for tooling). Scope by package: `feat(sim): cask aging curve`.

- **One logical change per commit.** A commit that mixes a feature and a drive-by
  refactor is two commits done badly.
- **Balance-number changes are always isolated `balance:` commits** — nothing else in
  the diff but `balance.ts`, the 06 doc table, and the golden tests. This makes any
  tuning change revert-safe with a single `git revert`.
- Doc-only changes are `docs:`; a code change whose doc update rides along keeps the
  code type (the doc update belongs in that commit, per §2).

## 8. Multi-agent etiquette

- **Claim before you code**: tick your milestone "in progress" in
  [14-roadmap.md](14-roadmap.md) with agent name and date
  (`- [ ] M3 … — IN PROGRESS: opus, 2026-09-02`) and commit that first. A claimed
  milestone belongs to that agent until finished or handed off.
- **Stay inside your blast radius.** Do not refactor code outside your milestone's
  files, even when it offends you. If it genuinely blocks you, that's a `DECISIONS.md`
  entry; if it merely annoys you, leave it.
- Leave **`TODO(next-milestone):`** markers instead of scope-creeping. A named TODO in
  the right place is a gift; a half-built extra feature is a liability.
- **Hand-off notes**: if you stop mid-milestone, append a short note at the bottom of
  the roadmap entry — what's done, what's next, any traps — so the next agent starts
  from your context, not from zero.

## 9. When stuck: the 3-strike rule

After **three failed approaches** to the same problem, stop. Append an `OPEN:` entry to
`DECISIONS.md` describing the blocker, the three approaches, and why each failed; leave
the code in a compiling, tests-green state; move to the next task. Thrashing burns the
session and leaves wreckage. A well-documented blocker is a completed unit of work.

## 10. Play the game

After any gameplay change:

1. **Headless smoke-run**: drive the sim for a few in-game days of scripted actions
   (plant → tend → harvest → press → bottle) and assert nothing throws and resources
   move in the right direction. Keep this as a reusable test helper.
2. **Real browser check**: `npm run dev`, open the client via the preview workflow, and
   actually play for two minutes — walk, interact, buy, watch a timer complete. Watch
   for the things tests can't see: feel, timing, layering glitches, silent NaNs in the HUD.

"It compiles" is not "it works", and "tests pass" is not "it's fun to touch". You are
the only playtester this game has until launch — act like it.
