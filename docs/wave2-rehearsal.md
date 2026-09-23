# Second-round integration rehearsal — DO NOT MERGE

Coordinator: GoldCondor. Rehearsal: CopperMaple. No deployment or publication.
This candidate is evidence for source PR integration; it must never be merged.

## Inputs

Base: final wave1 main `5578b49c96d8131f83bb7d642c7e09d840471b3c`.
Inputs were merged in this order without modifying their source branches:

| PR | Exact reviewed head | Rehearsal merge |
|---|---|---|
| #75 | `dfe30cfc438673d33df8616c0dd3924fac7856d1` | `65c8abf4` |
| #74 | `618558de9c4f9df4421232b8ea0ef1dd6d05d6e5` | `0a7aeeaa` |
| #76 | `6148b89f80a6de1dc6ed5368479a39c7024b2018` | `994d665b` |
| #78 | `2dda559c0b77938c4fcb3dbd98e786dd9a46d4b1` | `28cb8c11` |
| #79 | `63772c70ac3396897ea52b36f72f7de08fa89c27` | `35a6b7b3` |

Excluded: D6 runtime #80, object runtime #81, chunk shadow #83, timing #84–86.
Those require separate integration gates. No default runtime switch is introduced.

## Conflict and semantic resolution ledger

All actual textual conflicts were reported to GoldCondor before resolution.

- #75 merged cleanly.
- #74: 11 conflicts in changelog/architecture, root/lock/sim/Studio versions,
  sim barrel, generated binding index/procedure types, world imports and procedure
  schema tests. Preserve both additive sets and higher versions. DustyCompass
  reviewed and approved the isolated resolutions (Agent Mail #358).
- #76: 14 conflicts in changelog, root/lock/assets/sim/Studio/UI versions,
  bootstrap hash, definitions/barrel, Studio manifest/kinds, payload guard and
  world imports. Preserve all kinds and imports, then regenerate current data.
- #78: six conflicts in changelog, root/lock/sim versions, schema graph and sim
  barrel. Preserve additive hooks and regenerate the combined graph.
- #79: seven conflicts in changelog, root/lock/engine/tools versions, sim README
  and barrel. Preserve higher engine/tools versions and combine additions.

Semantic changes that must reach source integration before final source merges:

1. Both new F4 spatial procedures explicitly require `operate.world`; the main
   helper defaults to `observe`. Exact schema assertions prevent weakening this.
   Keep main's scoped regex, registry-only bounded iterator exception, and private
   rogue-run projection checks. Source owner approved this requirement.
2. Map `progression` to `loot_progression`, independently of `balance` on
   `world_rules`; tests exercise positive and negative permission cases.
3. Regenerate F1 from all combined definitions and SpacetimeDB public bindings
   from the combined world module. Private tables remain excluded. Preserve the
   `@orchard/sim/world-chunk` export map and all wave1 scope procedures.
4. The old migration test incorrectly reconstructed a historical snapshot from
   mutable bootstrap content. Pin exact legacy rows captured from immutable PR76
   `6148b89f` in `packages/world/src/content/fixtures/pre-f2-content-rows.json`.
   The historical durable hash remains **0f06c798**. A second test still checks
   current authored content through legacy balance tuples, before backfill.
5. Current bootstrap hash and Studio manifest now use **7dcab09f**; 920 definitions,
   26 kinds. Historical content hashes are not globally replaced.

## Measured content budget

Combined runtime payload: **618,309 bytes**. Definition JSON: **581,830 bytes**.
Authoring row-envelope JSON: **773,245 bytes**. Runtime and authoring envelopes
are different contracts. The measured next-whole-KiB budget is **604 KiB**
(618,496 bytes). The basic tileset definition remains below its 65,536-byte cap.
This is measured combined content, not an arithmetic sum of branch estimates.

## Validation

- Independent dependencies installed and licensed ignored art linked locally.
- Combined world build, workspace typecheck, lint, guarded Studio production
  build, F1 generation check and lifecycle integrity passed.
- First focused run: 124 passing, one historical-fixture failure described above.
  Corrected migration and schema run: five passing tests.
- Full repository build and client chunk boundaries passed. Final focused run:
  **129 tests / 19 files passed**.
- Full `npm run check` **exit 0** on production head `a59d85ad`: 1,000 coverage
  files / **6,310 passing tests and one skip**, then **101 exhaustive tests** in
  seven files. Coverage: statements 89.05%, branches 84.40%, functions 94.57%,
  lines 93.11%; all thresholds passed. Coverage duration 1,055.37 seconds;
  exhaustive duration 147.57 seconds.
- The same complete run passed lifecycle integrity, 920 definitions / 26 files,
  world build, all workspace types and lint, then 1,320 art assets, 12 songs,
  10 SFX, 55 palette colors and four seasonal remaps.
- Full log: `/tmp/copper-wave2-full-check.log`. Final closeout changes only this
  evidence document; production source remains exactly the tested snapshot.
- Hosted CI was still pending at closeout; no hosted pass is claimed.
  Rehearsal PR: https://github.com/Dastari/orchard-cellar/pull/87 (draft,
  **DO NOT MERGE**). Source integration fixes remain coordinator work; source
  branches were never modified during this rehearsal.

## Preserved boundaries and gaps

F4 paging is live keyset paging, not a snapshot; filtered empty pages may retain
cursors. Visual World Map remains its later lane. F3 retains reviewed hash-bound,
separate-author approval, 32-invocation/64-effect limits and an empty installed v2
bundle; v1 artifacts remain unchanged. Durable timed settlement/encounters are
later work. Blob47 layers preserve original farmland and native fringe pixels;
medium metadata does not activate D6 movement. Music listening direction was
accepted separately by the owner. Source publication and production rollout
remain coordinator-controlled, outside this rehearsal.
