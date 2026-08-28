# 13 — UI / UX: Screens, HUD & Menus

Binding spec for every screen, overlay, and interaction surface. All UI is rendered
**in-canvas** at the 480×270 virtual resolution, integer-scaled ([01-engine-decision.md](01-engine-decision.md)).
There are no DOM widgets, with exactly one exception (the login text input, §4).
Visual language — parchment panels, wood borders, bitmap fonts `font-5x7` / `font-8x12`,
icon rules, palette ramps R1–R12 — is defined in [10-art-style-guide.md](10-art-style-guide.md)
and is not restated here; this doc says *what* appears *where* and *how it behaves*.
UI sound names come from [12-audio-design.md](12-audio-design.md).

Inventory slot backing is driven by the item's definition-level `quality`:
common/default uses beige, uncommon green, rare blue, epic purple, and legendary
gold. These are authored states from the Cute Fantasy UI slot sheet, not painted
canvas tints. The explicit `item.quest_unique` gameplay tag is orthogonal to
quality and always overrides it with the authored white slot, so quest-owned
artifacts cannot be confused with legendary equipment. This presentation quality
does not imply a per-instance crafting-quality roll or add item-row schema.

## 1. Philosophy

1. **Diegetic where possible.** Menus live in the world: the main menu is a wooden
   signpost, the skill tree is a physical book (the *Estate Book*), the Vintage
   ceremony happens at the cellar table, mail is a letter at the farmhouse door.
   A floating rectangle is the fallback, never the first choice.
2. **Minimal HUD.** The farm view shows only: discovered resources, the day/season
   dial, the Vigour meter, the toolbelt, and at most one toast line. Everything else
   is an overlay you summon. If a HUD element has nothing to say, it is not drawn.
3. **Readable at 1×.** Every glyph, icon, and meter must be legible in the raw
   480×270 buffer before scaling. If a design needs sub-pixel finesse, it is wrong.
4. **The canvas is the truth.** UI state (open overlay, focused widget, cursor
   position) lives in `client/src/ui/`; scenes route input to the topmost focus
   holder. Overlays pause *rendering priority*, never the shared simulation.

## 2. Scene map & input canon

`TitleScene → LoginScene → FarmScene`, plus overlays pushed on FarmScene: Inventory,
Estate Book, Map, Settings, Vintage Ceremony, Visiting HUD. Exactly one overlay may
be open; opening another closes the first (with its close animation skipped).

| Input | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick / d-pad | Virtual stick (bottom-left, appears on touch) |
| Interact / Tend (hold to charge) | E / Space — **key auto-repeat must be ignored** (track keydown/keyup edges, not repeats) | A | Context button (bottom-right, shows current verb icon) |
| Inventory | Tab | Y | Toolbelt tap |
| Character | P | — | Character ribbon button |
| Skills | K | — | Skills ribbon button |
| Quests | J | — | Quest tracker / ribbon button |
| Map | M | Back/Select | Map icon tap (top-right of dial) |
| Estate Book | B | X | Book icon tap |
| Menu / back / close overlay | Esc | B / Start | On-screen ✕ in overlay corner |
| Toolbelt slot | 1–4 | LB/RB cycle | Tap slot |
| Emote wheel (visiting) | Hold G | Hold RT | Long-press context button |

All bindings are remappable (§10). Gamepad and touch produce the same `Action`
objects as keyboard ([02-architecture.md](02-architecture.md), `client/src/input/`).

## 3. TitleScene

A slow, warm establishing shot: an orchard vista at golden hour with gentle wind.

**Parallax layers** (each an asset; back to front; scroll factors relative to a
slow 4 px/s auto-pan that ping-pongs):

| Layer | Asset | Scroll | Notes |
|---|---|---|---|
| L0 Sky gradient | `title_sky` 480×270 | 0.0 | R7 blues dithering down into R6/R2 golden band at horizon; checkerboard dither only |
| L1 Distant hills | `title_hills` 960×96 | 0.2 | Two hill bands in R4 shade greens, no outlines |
| L2 Tree rows | `title_trees` 960×140 | 0.5 | Orchard rows in R3/R6, fruit dots catching the light |
| L3 Foreground grass | `title_grass` 960×64 | 1.0 | R3 grass tufts with 2–3 butterflies (3 frames @ 6 fps per §6 of the style guide) |

**Wind**: L2 and L3 use the 2-frame tree-sway/tuft-sway cycle at 1.5 fps, offset per
column so the wind reads as a wave crossing the screen. Reduced-motion (§10) freezes
parallax and sway; butterflies remain.

**Wordmark**: hand-authored sprite `title_wordmark`, ~200×48, centered at y≈56.
Two-tone R6 gold (`#e0a62d` body, `#f7c94b`/`#ffe98a` top-light) with a 1 px R1
`#2b1d0e` outline. It is a drawn sprite with hand-kerned letterforms — **not** text
set in the bitmap fonts.

**Flow**: "Press any key" in `font-5x7` pulses (alpha 60↔100% on a 1.6 s sine) under
the wordmark. The first key/click/touch is the **Web Audio unlock**
([12-audio-design.md](12-audio-design.md) §5): resume the AudioContext, start
`theme_title`, play *UI confirm*, and slide in the menu.

**Menu — wooden signpost motif**: a post at screen-right with five nailed-on plank
signs, each a small wood panel (R1/R2) with `font-8x12` text:
`Continue` (hidden if no session) / `New Estate` / `Visit a Friend` / `Settings` /
`Credits`. The selected plank shifts 2 px left and gains the R6 corner-bracket
cursor; moving selection plays *UI hover tick*, activating plays *UI confirm*.
`Visit a Friend` goes to login first if unauthenticated, then straight to the
friend-code entry (§8).

## 4. LoginScene

A parchment card (9-slice per style guide §7), 220×150, centered on a blurred-by-
darkening title vista (R12 `#232338` at 40% dither over the frozen title layers).

- Fields: **Email**, **Password**, drawn as inset parchment rows with `font-5x7`
  labels; a `Log in` wood button; a `font-5x7` toggle link beneath:
  `"New here? Found an estate"` ↔ `"Have an estate? Log in"`. Register mode adds a
  **Confirm password** row and renames the button `Found Estate`.
- **Recovery-code flow**: registering shows a one-time modal with 8 recovery codes
  on a parchment note ("Copy these — write them in a real book"), with a `Copy all`
  button (clipboard API) and a required checkbox `I saved them`. Login screen has a
  `Lost password?` link → enter email + one recovery code → set new password
  (see 09-auth.md).
- **Error toasts**: server/auth errors slide up from the card's bottom edge — a small
  parchment strip, `font-5x7`, R5 `#c03a2b` left border, with *error-buzz*; auto-
  dismiss 4 s. Field-level problems also flash the offending field (§9).

**Hidden DOM input (the one exception).** Canvas cannot summon IMEs or mobile
keyboards, so each text field is backed by a real `<input>`:

- One `<input>` element (plus one `type=password`) lives over the canvas with
  `opacity: 0`, `border: none`, `background: transparent`, `caret-color: transparent`,
  and `font-size: 16px` (prevents iOS zoom-on-focus). Never `display:none` or
  `visibility:hidden` — that kills focus and IME.
- Each frame the client computes the focused field's virtual-space rect, multiplies
  by the current integer scale + canvas offset, and sets the input's absolute
  CSS position/size to match, so the OS keyboard/IME anchors correctly and password
  managers overlay the right spot.
- The canvas renders the truth: it reads `input.value` + `selectionStart` every frame
  and draws the text in `font-5x7` with a 1 px blinking caret (530 ms period).
  Focus follows the canvas UI: clicking/tabbing a canvas field calls `.focus()` on
  the DOM input; Esc blurs it. On scene exit the inputs are cleared and blurred.

## 5. FarmScene HUD

All HUD chrome sits inside a 4 px safe margin. Wireframe of the 480×270 buffer:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────┐                            ┌─────────────┐  │
│ │ ◆12  ▲340  ●28  ◗5         │                            │  DAY/SEASON │  │
│ │ resource strip (top-left)  │                            │  DIAL 28×28 │  │
│ └────────────────────────────┘                            │  (top-right)│  │
│                                                           └─────────────┘  │
│                                                                            │
│                          ┌───────────┐                                     │
│                          │ [E] Tend  │  ← contextual prompt,               │
│                          └─────┬─────┘    floats over target tile          │
│                             ▒▒▒▒▒▒                                         │
│                             ▒tree▒                                         │
│                                                                            │
│                                                  ┌──────────────────────┐  │
│                                                  │ +3 Fruit gathered    │  │ ← toast/log line
│                 ┌───────────────────┐            └──────────────────────┘  │
│                 │ VIGOUR ▓▓▓▓▓░░ 71%│            ┌────┬────┬────┬────┐     │
│                 └───────────────────┘            │ T1 │ T2 │ T3 │ T4 │     │
│                  (bottom-center)                 └────┴────┴────┴────┘     │
│                                                   toolbelt (bottom-right)  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Resource strip** (top-left, y=4): one 16×16 icon cell + `font-5x7` count per
  resource, 6 px gap. Order: Fruit, Pomace, Must, Bottles, Terroir, Seeds — but
  **only resources the player has discovered** are drawn; a newly discovered resource
  slides its cell in from the left with a *fruit-pick pop*. Counts abbreviate per the
  notation setting (§6 Settings). A count that just changed ticks up over ≤300 ms
  and its icon does a 1-frame squash.
- **Day/season dial** (top-right, 28×28): a circular dial whose outer 2 px ring is
  season-colored — spring R9 blossom pink, summer R3 green, autumn R6/R5 gold-red,
  winter R7 ice blue — echoing the original game's season arc. A sun/moon pip
  travels the ring over the 15-minute day; at night the moon pip uses the current
  one of all eight lunar silhouettes from [27](27-lighting-design.md) §7 and the
  disc face darkens toward the phase-controlled ambient. Center shows `D3` (day
  of season) in `font-5x7`. Hover/tap tooltip includes the phase, for example:
  `"Summer, Day 3 — Year 2 — Last Quarter"`.
- **Vigour meter** (bottom-center, 96×10 wood-framed bar): fills over time (rate set
  in `sim/balance.ts`). At 100% the frame gains a 2-frame R6 glow pulse. Holding
  interact on a tendable target charges the tend action: the bar overlays the charge
  percentage in `font-5x7` (`71%`) and drains on release. No numeric label when idle.
- **Toolbelt** (bottom-right): four 20×20 wood-framed slots showing tool icons,
  selected slot gets the R6 corner-bracket cursor. Keys 1–4 / LB-RB / tap select.
- **Toast/log line** (right-aligned above toolbelt): one parchment strip at a time,
  `font-5x7`, max 34 chars, slide-in 100 ms, hold 3 s, fade 300 ms. Server `ev`
  toasts ([02-architecture.md](02-architecture.md)) queue FIFO, max queue 4;
  overflow drops the oldest.
- **Contextual interact prompt**: when the avatar faces an interactive tile, a small
  parchment chip floats 4 px above that tile: `[E] Tend`, `[E] Press fruit`,
  `[E] Read letter`, `[E] Sign guestbook`… On gamepad it shows `(A)`, on touch the
  context button morphs to the verb's icon instead. Exactly one prompt at a time
  (nearest facing target).

## 6. Overlays

Every overlay opens over a R12 40%-dither scrim, animates in, and closes on Esc/B/✕.
Open plays *UI confirm*; close plays *UI hover tick* (pitched −3 st via SFX jitter);
navigating within plays *UI hover tick*; purchases play *coin/purchase*.

**Estate Book** (B) — a physical book, 420×240, opening with a **3-frame book-flip**
animation (closed → half → open, 10 fps; reverse on close; add `ui_page_flip.sfx.json`
to the SFX set — a soft filtered-noise flutter, same synth as *wind gust* but 90 ms).
Four leather tab markers along the top edge (Q/E or bumpers cycle):

1. **Skills** — the Knowledge-gated tree drawn as an inked orchard diagram across the
   spread; pannable with move keys / drag (clamped to content). Nodes are 16×16
   icons on branch lines; locked nodes are R8 grey with a knowledge-cost chip;
   affordable nodes pulse the R6 bracket. Selecting shows a side parchment note with
   name, effect, cost; confirm buys (*coin/purchase*, then `sting_levelup`).
2. **Almanac** — records: yields per season, best vintage, days played, lineage log.
3. **Achievements** — grid of stamped wax seals; locked = embossed outline only.
4. **Cultivars** — collection pages, one illustrated card per discovered cultivar;
   undiscovered show a silhouette and hint line.

**Inventory** (Tab) — parchment panel, 8×4 grid of 20×20 cells; cursor moves with
keys/stick, hover shows a `font-5x7` tooltip chip (name + one-line use). Bottom row
is the toolbelt mirror: press 1–4 on a hovered tool to assign it. Open/close is a
2-frame unfold (satchel flap), 80 ms.

**Character** (P) — a parchment character sheet showing the shared equipment paper
doll, Health/Mana/Vigour, base-to-resolved attributes, active effects, and Combat /
Explorer / Farming levels. The appearance controls cycle only authored variants and
commit through server validation.

**Skills** (K) — a one-track-at-a-time Combat / Explorer / Farming tree. Drag the
canvas to pan, wheel to zoom, inspect nodes in the side panel, and spend or reset
points through authoritative reducers. Owner developer tools may grant test points;
ordinary clients can never submit XP or point totals.

**Map** (M) — full-screen hand-drawn parchment map of the estate (drawn asset, not a
live minimap) with inked icons for farmhouse, cellar, gate, and the player's position
pip. Visiting shows the friend's map with visitor pips.

**Settings** (via Esc menu) — tabbed parchment panel:
- *Audio*: Master / Music / SFX sliders (wooden slider knobs), persisted per account.
- *Controls*: full keybind remap list (§10), gamepad mapping, hold-vs-toggle.
- *Display*: UI scale 1×/2×, reduced motion, text speed, big-number notation —
  `Plain (12,400)` / `Short (12.4K)` / `Words (12.4 thousand)`; default Short.

The **Esc menu** itself is a small signpost-style list: Resume / Settings /
Guestbook (visiting) / Save & Quit to Title.

## 7. Ceremony flows (Vintage / Succession / Lineage)

Prestige is rare and momentous; the UI supplies friction proportional to severity
(mechanics in 06-progression-economy.md; sim in `sim/prestige.ts`).

| Ceremony | Setting | Confirm friction | Audio |
|---|---|---|---|
| **Vintage** (yearly) | Cellar table: modal shows the year's bottles arrayed on the table | Single confirm button `Seal the Vintage` | `sting_vintage` + *bottle clink* |
| **Succession** | Farmhouse: letter-writing modal ("To my successor…") | **Type the farm's name** exactly to enable the confirm button | `sting_vintage` variant + *door* |
| **Lineage** | Estate gate at dawn | **Hold-to-confirm 3 s** — wax seal fills as a radial meter; releasing early resets with no penalty | `sting_vintage` + the game's only sanctioned 2 px screen-shake (§9) |

Each ceremony ends on a **summary screen**: parchment certificate listing gains
(Terroir earned, bonuses unlocked, records set), lines stamping in one by one
(120 ms apart, *UI hover tick* each), then a single `Begin anew` button. Ceremonies
are the only modals that suppress all HUD.

## 8. Visiting UX

- **Friend-code entry** (`Visit a Friend`, or the estate gate in-world): parchment
  card with a monospaced code field `ORCH-XXXX-XXXX` (auto-uppercased, hyphens
  auto-inserted; uses the hidden DOM input, §4), plus a list of previously visited
  farms (name, owner, last visit). Your own code is shown beneath with `Copy`.
- **Arrival transition**: fade to R12 black-blue (400 ms) with a *door* + carriage
  rattle, then fade in at the friend's **estate gate** facing inward. Reverse on
  leaving. A toast announces `Visiting <Farm Name>`.
- **Visitor nameplates**: `font-5x7` name on a 1 px R12-backed strip, centered 2 px
  above each remote player's sprite; owner's plate gets a small R6 crest. Plates
  hide during ceremonies and screenshots (F2). An offline persisted avatar uses a
  stone tint and an authored pulsing lightning icon inside the plate before its name;
  it is a presence marker, never an interaction or collision target.
- **Guestbook**: a lectern near the gate; `[E] Sign guestbook` opens a parchment
  spread of recent entries (name, date, 80-char message via hidden input). Owner
  gets a toast + mailbox flag on next login.
- **Emote wheel**: hold G (hold RT / long-press context) opens a 6-slice radial
  wheel around the avatar: **Wave, Heart, Laugh, Cheers, Music note, Question**.
  Release on a slice to emote — a 12×12 bubble icon over the head for 2 s
  (♪ and ♥ come from the font charset rules; all six are drawn icon sprites).
  Chat (200-char, visiting only) shows as timed speech strips above plates.
- **Leave / go home**: Esc menu `Go Home`, or walk out the gate → confirm chip
  `[E] Head home`. Visitors are read-mostly guests; anything a visitor cannot do
  simply shows no interact prompt (never an error).

## 9. Feedback rules (binding)

1. **Every player action produces visual + audio feedback within 100 ms** — locally,
   before server confirmation (prediction/optimism per
   [02-architecture.md](02-architecture.md)); rollback shows a toast, never silence.
2. **Floating pickups**: gathered resources spawn a `+N` + icon that arcs up 8 px and
   fades over 600 ms (the 6-frame pickup animation, style guide §6). Cap 6
   concurrent; further pickups merge into the newest number.
3. **Screen-shake NEVER exceeds 2 px** and is used *only* for prestige moments
   (Lineage seal, Vintage stamp). Nothing else shakes — not harvests, not errors.
4. **Errors** ("can't afford", "not ready"): soft *error-buzz* + a 2-frame R5
   `#c03a2b` flash **on the specific UI element only** (the count, the button, the
   slot) — never full-screen red, never modal.
5. **Day-end**: 2 s fade toward the R12 night tint with the day-summary toast;
   music crossfades per [12-audio-design.md](12-audio-design.md).
6. Hover/selection changes always tick (*UI hover tick*); silence means "nothing
   happened", so nothing may happen silently.

## 10. Accessibility

- **Remappable keys**: every binding in §2 is rebindable in Settings → Controls;
  conflicts are flagged in R5 and refuse to save. Stored per account.
- **Hold vs toggle**: charged tend and the emote wheel each offer `Hold` (default)
  or `Toggle` (press to start, press to release) modes.
- **Colorblind-safe resources**: icons are shape-distinct first, color second —
  Fruit = round berry, Pomace = mound, Must = drop, Bottles = bottle, Terroir =
  layered soil wedge, Seeds = teardrop pair. No information is ever color-only
  (season dial ring also carries the `☀/❄`-style glyph of its season).
- **Text speed**: letter/ceremony text reveal at Slow/Normal/Instant.
- **Reduced motion**: disables parallax auto-pan, sway offsets, screen-shake, and
  toast slide (fades instead). Simulation and gameplay animations are unaffected.
- **UI scale 1×/2×**: at 2×, HUD chrome and overlay text render from the same
  bitmap fonts at double size (nearest-neighbor, so `font-5x7` stays crisp);
  overlays reflow to fewer columns. World rendering is untouched.

## 11. First-run onboarding

**No tutorial popups, no arrows, no darkened "click here" overlays.**

- **The letter**: a new estate begins with the avatar at the farmhouse door and one
  interact prompt: `[E] Read letter`. A letter from the previous estate owner
  (parchment full-screen, text-speed aware) delivers the fantasy and the first goal
  in-fiction: tend the old trees, press what they give, and one day seal a vintage
  of your own. It remains re-readable at the door.
- **Contextual first-time prompts**: at most **6**, each fires **exactly once** per
  account (persisted flags), each a normal toast-sized chip anchored to its subject:

| # | Trigger | Prompt |
|---|---|---|
| 1 | First time near a tendable tree | `Hold [E] to tend — longer hold, better tend` |
| 2 | First Fruit in inventory | `Press fruit at the cellar` |
| 3 | Vigour first reaches 100% | `Your Vigour is full — a charged tend awaits` |
| 4 | First Knowledge point earned | `[B] Your Estate Book has a new page` |
| 5 | First bottle sealed | `Bottles age toward your first Vintage` |
| 6 | First season change | `Seasons turn — the dial shows the year` |

Nothing else explains itself with words; the world, the prompts above, and the
Estate Book's Almanac carry the rest. If a player skips the letter, the game still
works — onboarding is an invitation, not a gate.
