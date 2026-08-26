# 32 — Combat: Damage, Hostiles, and Danger Zones

Binding owner-directed spec (2026-08-26). Status: **design approved, not
implemented**. This is the combat-era doc that [25-stats-and-vitals.md](25-stats-and-vitals.md)
Phase 5 gated behind separate approval, and the "combat-era decision" that
[22-netcode.md](22-netcode.md) deferred. Builds on doc 25 (stats, vitals,
modifiers, knockout — all implemented), [26-underground-mines.md](26-underground-mines.md)
(the first hostile biome), [27-lighting-design.md](27-lighting-design.md)
(light as safety), [28-crafting.md](28-crafting.md) (weapons, plate gear,
arrows), [29-wildlife.md](29-wildlife.md) (peaceful fauna, untouched here),
[30-infinite-terrain.md](30-infinite-terrain.md) (chunk materialization and
stamps as the spawning machinery), and [31-npc-dialogue-and-commerce.md](31-npc-dialogue-and-commerce.md)
(talking NPCs are never combat targets). Enemy art is bounded by the licensed
paid packs (docs/18 §7).

## 1. Principles (binding)

1. **Combat is opt-in danger, never ambient dread.** Hostiles exist only in
   **danger zones**: mine levels (doc 26), volcano islands (doc 30), and
   authored dungeon/ruin stamps. The surface overworld, farms, and the curated
   home island stay peaceful day and night. A "spooky nights" owner toggle is
   a listed later hook, off by default.
2. **No fail states.** Losing a fight is the doc 25 §11 knockout — wake at
   spawn, 25% health, `winded`, **never** item/currency/durability loss.
3. **No PvP.** Projectiles and swings never damage players other than their
   owner's target-of-one-species: hostiles. (The projectile sweep already
   detects players — that stays for knockback-free "thunk" feedback only.
   Consensual duels are a later hook.)
4. **Wildlife is not targetable in v1.** Attacks pass through doc 29 fauna;
   hunting is a real design question (drops, ranching interplay) deferred to
   its own decision rather than half-shipped here.
5. **The netcode split holds**: swing/draw animations and SFX predict
   client-side; every hit, health change, and death is an authoritative row
   change. Damage numbers are client particles derived from row deltas;
   hit-flash and invulnerability blink are cosmetics driven by status fields
   (docs/22 §6.1, verbatim).
6. **Authority stays at 20 Hz.** Swing intervals (350–500 ms), the existing
   swept projectile stepping, and cone melee all work at 50 ms ticks; nothing
   in this doc needs a rate increase. This resolves docs/22's deferred
   decision — recorded in DECISIONS.

## 2. The substrate (already implemented — do not rebuild)

Implementing agents start from: `resolveStats`/modifier pipeline and vitals in
centi-units; knockout + `winded`; `creatures.ts` statlines with
`resolveCreatureStats` and `world_npc.health` initialization; Vigour costs +
minimum swing intervals for `sword`/`bow` (doc 25 §4 table); `fireBow` +
`world_projectile` with swept entity/terrain hit detection and hit-state rows;
player hitbox bounds; the deterministic `checks.ts` d20; `player_effect`
machinery. Combat v1 is mostly **wiring these together plus AI and content**.

## 3. Damage model — deterministic, stat-driven, integer

One pure module `packages/sim/src/combat.ts`. All values centi-units; no
stored RNG — variance and crits use the `checks.ts` stateless hash
(`worldSeed, attacker id, authorityTick, 'damage'`).

```
attackPower(melee)  = weaponBase × (str / 10)      // str scales melee
attackPower(ranged) = weaponBase × (dex / 10)      // dex scales ranged
variance            = 90%–110%   (hash-rolled, deterministic)
crit                = d20 roll ≥ 19 → ×150%        (checkBonus modifiers apply)
mitigation          = flat armor, then armorPct    (soften() softcap)
damage              = max(100, floor(attackPower × variance × crit) − armor)
```

- **New `StatTarget`s**: `attackPower`, `rangedPower`, `armor`, `armorPct` —
  slotting into the doc 25 pipeline unchanged. Plate gear (doc 28 anvil
  recipes) carries `armor` modifiers; jewelry carries offense/utility; every
  number is data in `balance.ts` + the docs/06 mirror.
- Weapon bases (display units): `sword 18`, `bow 14` (arrow required),
  starter improvised swings (`axe 8`, `pickaxe 6`, `shovel 6`, `hammer 12`)
  so a surprised miner can fight back badly — tools stay tools.
- Creature attacks run the same formula from their statlines. One math path,
  both directions — the doc 25 promise ("combat adds verbs, not state shape")
  kept literally.

## 4. Melee and ranged verbs

- **Melee**: new reducer `attackMelee()` mirroring `harvestResource`'s shape —
  Vigour + swing-interval gates (already live for the sword), the standing
  facing-cone target pick restricted to **hostile NPCs**, then §3 damage to
  `world_npc.health`. Swing animation is the existing `AVATAR_ACTIONS`
  channel; no new netcode. Contact tools start with a one-tile-radius area
  centred one tile ahead of the character's facing. A future skill-tree range
  modifier expands that area; the unskilled base range stays at one tile.
- **Ranged**: `fireBow` gains consequences — consume 1 `arrow`, and on a
  `hit` row whose `hitKind` is a hostile NPC, apply §3 damage in the same
  tick. Arrows that land in terrain persist briefly as recoverable
  `world_item` arrows (~50% hash chance) — the Minecraft retrieval loop,
  feeding the existing arrow recipe. Bow draw-stages art (`Bow_Stages.png`)
  and charge-for-power are a later hook; v1 fires at fixed power on the
  standing action channel.
- Hitting a hostile writes its `lastDamagedTick` (new column) — the status
  field that drives client hit-flash, exactly as docs/22 §6.1 reserved.

## 5. Hostile roster (art-verified, paid packs)

`CREATURE_DEFINITIONS` extends beyond `WildlifeSpecies` with hostile kinds:
`{ attributes, hostile: true, aggroRadiusTiles, leashRadiusTiles,
attackKind: 'melee' | 'ranged', attackBase, attackIntervalTicks, drops }`.

| Creature | Art | Zone | Notes |
|---|---|---|---|
| Slime (small/medium/big × 5 colors) | `Enemies/Slime/` | mines L1–2 | v1 melee starter enemy; size = statline tier, color follows the doc 30 variant-pool idea (cave-blue underground, red in volcano) |
| Skeleton / Skeleton Swordman | `Enemies/Skeleton/` | mines L2–3 | standard melee |
| Skeleton Bowman | `Skeleton_Bowman` (separated bow frames) | mines L3 | **reuses `world_projectile`** — enemy arrows are the same rows, owner = NPC id band |
| Bombschroom | `Bombschroom` + gas VFX | mines L2–3 | fuse-then-burst AoE (gas cloud = `world_projectile` variant with radius); telegraphed by its animation |
| Mummy, Desert Warriors (atgier/bow) | Desert pack | desert ruin stamps | phase 4 |
| Cowling, Cowling Mage, Flying Skull | Volcano pack | volcano islands | phase 4; mage projectile art ships in the main pack |
| Goblins / Orcs (Characters pack) | camps via stamps | later hook | with structure generation |

Skeleton Mage and spellcasting hostiles wait for the mana/spell era. All
hostiles are `world_npc` rows in the wildlife id conventions, chunk-scoped,
stepped only near players.

## 6. AI — the hash FSM grows three states

Extending the deterministic stateless-hash pattern of `npc.ts` (no stored RNG,
replayable): `idle/wander` (exists) → **`aggro`** → **`attack`** → **`return`**.

- **Aggro**: nearest player in the same space within `aggroRadiusTiles`,
  checked on the creature's existing decision cadence. **Light is safety**
  (docs 26/27 made tactical): in fixed-ambient spaces (mines), a player
  standing in light (own torch/lantern or a static emitter — the server
  re-derives generated-lantern pools from the same pure generation) is seen at
  full radius; in darkness beyond any light, detection drops to half.
  Skulking past skeletons in the dark with your torch stowed is the intended
  risk/reward inversion of "hold light or swing" (doc 26 §6).
- **Attack**: melee closes to adjacent and swings on its interval; ranged
  kites at 4–6 tiles and fires. Creature swings use the same action-channel
  animation model as players.
- **Return/leash**: beyond `leashRadiusTiles` from home, drop aggro, path
  home, regenerate to full — no gate-dragging exploits, no infinite chases.
- Caps: at most `MAX_ENGAGED_PER_PLAYER = 3` creatures aggro one player;
  extras hold at wander. Cozy pressure, not a zerg.

## 7. Spawning — the doc 30 machinery, danger-zone gated

Hostile spawn tables key on `(spaceId, biome/level, stamp flags)`: mine-level
tables (doc 26 §4 rooms get spawn weight; entry halls stay safe), volcano
island surfaces, and stamp-authored dungeon rooms. Population happens at chunk
materialization plus the lazy repopulation sweep, with per-neighborhood caps —
identical machinery to wildlife, different table. Danger zones repopulate
slowly (hours, not minutes): clearing a gallery buys a mining session, not
permanence. Hostiles never spawn within sight of portals/spawn points, in
curated peaceful chunks, or in any non-danger zone, structurally.

## 8. Taking damage — players

- Creature hits apply §3 damage to `player_stats.healthCenti` through the
  doc 25 lazy pipeline; at 0 the **implemented knockout** path fires. A new
  `lastDamagedTick` on the public vitals surface drives hit-flash + a 1 s
  post-hit invulnerability window (authority-checked, cosmetically blinked).
- **Remote health**: doc 25's reserved `player_vitals_public { identity,
  healthPct: u8 }` lands here (additive) so allies see each other's state in
  a fight; hostile NPC health is already public on `world_npc`.
- Health regen pauses for 5 s after taking damage (out-of-combat regen — one
  new modifier-pipeline environment rule), so fights have stakes without
  potion-chugging pressure.

## 9. Death, drops, and feedback

- At 0 health a hostile dies: puff/bone burst particles (Break-anim style),
  a `died` state row retained ~1 s for client playback, then deletion.
- **Drops** (world_item rows, shared pickup rules): slimes → `slime_gel`
  (new material item; icon from the pack icon sheets, art-verify at
  extraction), skeletons → `bone` (`Desert_Bones.png` / icon sheets) + ~30%
  arrow (bowman), bombschroom → mushroom dressing items (doc 26 cave
  decor). `slime_gel`/`bone` become crafting inputs (torch-slow-fall? glue?
  — recipes authored in the docs/28 §6 table when these land; docs/06
  mirror). Rare gem-chunk drops in deep-mine kinds tie the loop to smelting.
- **Feedback per docs/13/22**: floating damage numbers (small pixel text
  particles, client-derived), hit-flash tint, no screen shake, no blood —
  bone-puffs and slime-splats only. SFX set (swing-hit, arrow-thunk, slime
  squish, skeleton rattle, knockout sting) via the `game-music` skill.
- XP does not exist and combat grants none — progression stays gear, materials,
  and the docs/06 economy. (Skill trees may later hook kills as Knowledge
  events; not v1.)

## 10. Phasing

1. **Damage core**: `combat.ts` + new stat targets, arrows damage hostiles,
   `attackMelee`, NPC death/drops/`lastDamagedTick`, hit feedback — proven
   against a spawned test slime behind an owner debug reducer.
2. **Mines go live**: slime + skeleton rosters, AI FSM with light-based
   detection, danger-zone spawn tables + repopulation, engaged-cap.
3. **Players bleed**: creature attack path, invulnerability window, regen
   pause, `player_vitals_public`, knockout wiring end-to-end, two-client
   verification.
4. **Ranged + exotic**: skeleton bowman (NPC projectiles), bombschroom AoE,
   volcano + desert rosters with their stamps.
5. **Later hooks**: bow charge stages; hunting decision; spellcasting +
   mages (mana's first spender); boss stamps; goblin/orc camps; duels;
   "spooky nights" surface toggle; combat skill-tree branch.

## 11. Out of scope

PvP; wildlife damage; durability; XP/levels; spells and mana spending;
knockback physics; status ailments beyond existing effects (poison etc. come
with their sources); mounted combat (attacks stay dismounted per the standing
riding gates); difficulty settings.

## 12. Tests and acceptance

- **Unit (sim)**: damage-formula goldens named `32§3` (variance bounds, crit
  application, armor softcap, minimum-damage floor, determinism: same seed
  parts → same roll); FSM transition goldens on fixture layouts (aggro radius
  ±light, leash return, engaged-cap election, ranged kiting distance); drop
  table distributions; spawn-table zone gating (a peaceful chunk can never
  roll a hostile).
- **Reducer (world)**: `attackMelee` happy/`out_of_range`/wrong-target
  (player, wildlife, dialogue NPC)/Vigour-and-interval-gated/auth-failure;
  arrow damage + ammo consumption + recovery item; NPC death transaction
  (health 0 → drops + died-state → cleanup); player damage → knockout
  end-to-end; invulnerability window rejects double-hits.
- **Two-client**: A fights a skeleton, B sees identical health bars, flashes,
  death, and drops; B's presence pulls a second creature only up to the cap;
  A knocked out wakes at spawn with `winded` while B loots the gallery.
- **Browser**: full mine fight at UI scales 1–3 — readable in near-darkness
  with one torch; damage numbers legible, no overdraw regressions; danger
  zones honored (walk the surface at night untouched).

## 13. Bookkeeping

- **docs/06**: combat tuning section (weapon bases, creature statlines,
  drop tables, spawn densities). **docs/00**: doc-map row. **docs/14**:
  milestone entries.
- **docs/22**: §9's deferred authority-rate note resolved — annotate.
  **docs/25**: Phase 5 pointer here. **docs/26**: mines' "combat era" hooks
  now specified. **docs/29**: wildlife untargetable cross-note.
- **DECISIONS.md** on adoption: (1) combat is danger-zone-opt-in, hostiles
  only, no PvP, wildlife untargetable in v1; (2) authority stays 20 Hz for
  the combat era (resolves docs/22 deferral); (3) damage is deterministic
  stat-driven with stateless-hash variance/crits — no stored RNG; (4) light
  level halves hostile detection in dark spaces (light is safety).
