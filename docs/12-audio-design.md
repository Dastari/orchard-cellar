# 12 — Audio Design: Music & Sound Effects

All audio is authored as text and synthesized at runtime through Web Audio: music as
tracker songs (`*.song.json`) and sound effects as synth parameter sets (`*.sfx.json`).
No recorded audio ships with the game.

## 1. Aesthetic target

Calm, warm, pastoral. Reference feel: Stardew Valley's spring themes, A Short Hike —
gentle tempo (72–96 BPM), major/lydian/mixolydian modes, soft attack instruments,
generous space between phrases. Nothing urgent, nothing chiptune-harsh: we use a
**"soft synth" patch set** (filtered triangle/sine leads, slow-attack pads, plucked
tones with fast decay), not NES square-wave bleeps.

## 2. Music system: tracker songs

Owner decision (2026-09-23): the score is **tracker songs only**. Every cue is a
`*.song.json` file in `packages/assets/music/`, rendered live by the engine's Web
Audio synth. There are no recorded or streamed music files; the build ships only the
small JSON sources (copied to `/generated/music/` by `npm run assets:build`).

Runtime pieces (all in `packages/engine/src/audio/`):

- `sequencer.ts` — compiles a song (swing, velocity, per-channel overrides) and runs a
  look-ahead scheduler: a 250 ms timer queues every note due in the next 1.5 s onto
  the sample-accurate audio clock, so a background tab throttled to 1 Hz still plays
  seamlessly. Humanised timing and velocity come from a deterministic hash, never
  `Math.random`, so a song renders identically every time.
- `music-synth.ts` — the instrument voices plus a shared effects mixer: algorithmic
  stereo hall reverb, two-voice stereo chorus, tempo-synced ping-pong echo, a
  45 Hz rumble filter, a gentle high-shelf cut and slow glue compression. Each
  playing song gets its own deck with four fade gains (dry and each send), so two
  songs cross-fade cleanly including their reverb tails.
- `patches.ts` — the closed patch set (§2.2).
- `music-director.ts` — the data-driven music director (§2.5): chooses what plays, and
  when, from `packages/assets/music/audio-assignment.json`.
- `audio-bus.ts` — carries out the director's commands (cross-fades, stingers),
  checkpoints, volume and background policy.

**Owner direction (2026-09-23, after listening to PR #69):** no constant drone or
bed. Music behaves like Minecraft's: short, sparse pieces arrive now and then, with
minutes of silence between them, and adapt to context. So:

- **No sustained pad beds.** The `pad` patch still exists, but it is voiced as a slow
  swell that breathes out (sustain 0.35) and none of the shipped songs uses it. Harmony
  comes from soft broken chords (pluck), occasional string swells and the bass.
- **The bass is plucked, not held:** short roots (sustain 0.12). It rests in the
  opening and closing sections of every theme.
- A shipped-song test fails if any non-string note holds for more than about eight
  seconds.

Title music loops. Everything else plays one pass and then falls silent for a
randomised interval, typically 2½–6 minutes outdoors. A piece is never cut when the
context changes if it also belongs to the new context. Otherwise it fades out and a
short entry silence follows.

The bus checkpoints the director's rule, the tracker position (in steps) and the
remaining silence once per second and on page hide, as version 2 of
`orchard-cellar.music-playback`. Reloads, browser restarts and account-page
transitions resume that checkpoint instead of restarting the song. Sustained notes
that were sounding at the saved step are re-entered with a soft attack. A saved
fight is never resumed. Version 1 checkpoints (seconds into the retired MP3s) are
ignored. Account-page navigation fades for 650 ms. The title theme then fades out
under the world's first silence. Explicit stop fades over one second.

### 2.1 Song format

```jsonc
{
  "name": "theme_summer_day",
  "bpm": 84, "swing": 0.08,             // 72–96 BPM, swing 0–0.12
  "kind": "theme",                      // theme | piece | combat | sting (default theme)
  "stepsPerBeat": 4, "beatsPerBar": 4, "loopBars": 48,   // see kinds below
  "masterGainDb": -6,                   // whole-song trim
  "key": "G", "mode": "mixolydian",     // documentation only
  "humanize": 1,                        // optional: 0 = machine-tight, 1 = patch default
  "fx": { "reverb": 0.9, "delayBeats": 0.75, "delayFeedback": 0.3 },  // optional
  "channels": [
    {"patch": "flute", "vol": 0.62, "patterns": ["A","A","B","A2"],
     "pan": 0.1,                                   // optional, -1 left … 1 right
     "sends": {"reverb": 0.4, "delay": 0.2},       // optional, per-channel send levels
     "instrument": {"amp": {"release": 0.6}}},     // optional patch tweaks (§2.2)
    {"patch": "pluck", "vol": 0.3, "patterns": ["Pa","Pa","Pb","Pa"]}
  ],
  "patterns": {
    // [step, note, lengthInSteps, velocity?]  velocity 0–1, default 0.8
    "A": {"steps": 64, "notes": [[0,"G4",4],[8,"B4",4,0.9],[16,"D5",8,0.7]]}
  },
  "loop": true
}
```

All fields added for the synth (`kind`, `humanize`, `fx`, `pan`, `sends`, `instrument`,
the fourth note element) are optional; older songs remain valid. `npm run assets:validate`
checks ranges.

| Kind | Length | Loop | Use |
|---|---|---|---|
| `theme` | 48, 64 or 96 bars | director decides | Long signature arrangements (`theme_*`) |
| `piece` | 8–96 bars | no | Sparse context pieces (`piece_*`), typically 16 bars |
| `combat` | 4–32 bars | yes | Fight loops (`combat_*`) |
| `sting` | 1–8 bars | must be `false` | Event flourishes (`sting_*`) |

**Patch set is closed** (the audio analog of the palette): `flute`, `pad`, `pluck`
(kalimba-ish), `bass`, `bells`, `strings`, `accordion`, `woodblock`, `shaker`.
Agents compose songs only from these — that is what makes the soundtrack cohesive.
New patches require a doc update, like palette colours. Channel `instrument`
overrides are for tuning a patch within a song (brighter flute, longer bell), not
for inventing new instruments.

### 2.2 Instrument parameters (for composers)

Each patch in `patches.ts` is one voice recipe. Per note the synth builds its
oscillator layers, adds optional filtered noise, runs everything through one
enveloped filter and an amplitude envelope, then the channel's pan and sends.
Any group below can be overridden per channel via `"instrument"`; nested groups merge
key by key, while `oscillators` replaces the whole list.

| Parameter | Meaning | Typical use |
|---|---|---|
| `oscillators[]` | Layers: `wave` (`sine`, `triangle`, `sawtooth`, `square`), `ratio` (frequency multiple: 1 unison, 2 octave, 2.76 bell partial), `detuneCents`, `gain` (mix), `decay` (seconds for that layer alone to die away), `pan` (-1…1 per layer) | Two saws at ±7–10 cents = warm chorused pad; sine partials with short `decay` = bell/tine shimmer; layer `pan` = wide pads |
| `noise` | Band-passed noise layer: `gain`, `filterHz`, `q`, `decay` (0 = sustains with the note) | Flute breath, string rosin, shaker, woodblock click |
| `amp` | `attack` (s to peak), `decay` (s to settle at sustain), `sustain` (0–1 of peak), `release` (s after the note ends) | Slow attack for pads/strings; `sustain: 0` for plucked and struck sounds |
| `filter` | `type` (`lowpass`, `bandpass`, `highpass`), `cutoffHz` (for middle C), `q`, `envOctaves` (how far it opens at note start), `envDecay` (s to close again), `keyTrack` (0–1, cutoff follows pitch), `velocityOctaves` (how much darker soft notes are) | Bright attack that mellows = `envOctaves` 1–1.5 with short `envDecay`; darker pads = lower `cutoffHz` |
| `vibrato` | `rateHz`, `depthCents`, `delay` (s before it fades in) | 5 Hz / 10–14 cents after 0.3 s for flute and strings |
| `pitchDrop` | Starts `cents` sharp and falls to pitch in `seconds` | Woody knock (350 cents), tine "ping" (10–20 cents) |
| `velocity` | 0 = all notes equal, 1 = velocity fully scales loudness (brightness always follows via `velocityOctaves`) | 0.4 pads, 0.7 plucks and bells |
| `gain` | Loudness trim so patches match at the same `vol` | Balance patches, not songs |
| `pan` | Default stereo position of the channel | Lead slightly off-centre, bass centred |
| `sends` | `reverb`, `chorus`, `delay` levels into the shared effects | Bells/pads wet, bass nearly dry |
| `oneShot` | Ignore note length; the note rings for attack + decay + release | Plucks, bells, percussion |
| `humanize` | `timingMs` (± random-but-repeatable offset), `velocity` (± fraction) | 6–14 ms; percussion more velocity variation |

Mixing guide: judge balance with `npm run music:render -- <song> --stems` (§2.3).
The lead sits highest ("loudest 400 ms" column). Plucked bass and soft broken chords
sit 6–10 dB below it, and the shaker about 16 dB below. Use the "loudest 400 ms"
figure, not RMS, to match songs: sparse pieces are mostly space, so their RMS is
naturally low. The shipped songs peak between −16 and −21 dBFS on that measure,
with peaks below −5 dBFS. Keep night within about 2 dB of day. Keep the low band
(below 200 Hz) under about half of the energy: the drone-free themes sit at
27–45 %, where they were 50–64 % with pads.

### 2.3 Listening and verification

- **Studio:** Author → Audio Preview (`/author/audio` on Cellar Studio) lists every
  `*.song.json` and `*.sfx.json` automatically and plays them through the exact game
  bus, with a live output meter.
- **Studio locally:** `npm run dev -w @orchard/studio -- --port 5184`, then open
  `http://localhost:5184/author/audio`. Port 5174 belongs to the live service.
- **Game (local):** `npm run dev`, open the client, and press a key on the title
  screen. In the world, the director waits for its entry silence before the first
  piece plays.
- **Offline renders:** `npm run music:render` renders every song through the same
  synth in headless Chrome's `OfflineAudioContext` and writes WAVs to
  `output/music-renders/` (git-ignored; never commit renders). It prints peak, RMS,
  loudest-400 ms level and clipped-sample counts and fails on clipping. Options:
  song names, `--passes=2` (check the loop seam), `--stems` (solo each channel).
  Requires Chrome (`CHROME_BIN`, default `/usr/bin/google-chrome`).

Performance budget: the shipped themes render 8–14× faster than real time in
headless Chrome on a desktop CPU with at most roughly a dozen overlapping voices;
each voice is 1–5 oscillators, one filter and a few gains. Keep melody density low
(a note every 1–2 beats) — that is both the house style and the CPU budget.

### 2.4 Shipped soundtrack

| Song | Kind | Director rule(s) | Character |
|---|---|---|---|
| `theme_title` | theme | `title` | The signature motif, gently arranged; loops on the title screen |
| `theme_spring` | theme | `day` | Flute motif, dew bells, plucked chords and a light shaker |
| `theme_night` | theme | `night` | The motif at half speed in bells over soft E-minor/C broken chords |
| `piece_dew` | piece | `day` | 16 bars: flute motif and answer over plucked chords |
| `piece_lantern` | piece | `night`, `rain` | 16 bars: slow bell motif, one string breath |
| `piece_rain` | piece | `rain` | 16 bars, lydian: soft plucks and a flute answer |
| `piece_hearth` | piece | `interior` | 16 bars: accordion motif with a light oom-pah |
| `piece_cellar` | piece | `cellar`, `delve`, `delve_volcanic` | 16 bars, E dorian: low pluck motif, drip bells |
| `piece_ember` | piece | `volcanic`, `delve_volcanic` | 16 bars, D dorian: distant bell motif, low breaths |
| `combat_skirmish` | combat | `combat` | 8-bar loop at 96 BPM, E dorian: plucked ostinato, woodblock/shaker pulse, bell quote |
| `sting_combat_start` | sting | `combat` enter | A one-bar rising pluck and bell |
| `sting_combat_end` | sting | `combat` exit | Two bars resolving home on G |

Still wanted: seasonal day variants (summer accordion/shaker, autumn pluck-forward,
winter sparse bells), `sting_vintage` (prestige), `sting_levelup` and a
visiting-farm variation. Add each one as a cue in the matching rule (§2.5).

Composition rule: every piece quotes the 4–8 note **signature motif**
(`orchard_home`, G–B–D … A–B–G). It may be transposed or slowed, and pieces
declare the quote in `quotesMotif`.

### 2.5 Music director and audio assignment

`packages/assets/music/audio-assignment.json` (format
`orchard-audio-assignment-v1`) is the authored mapping from game context to music.
It is plain data, so Studio's Audio tool can edit it. It is the seed for the doc 62
§3.3 `audio_assignment` content kind. `npm run assets:validate` checks it against
the song files.

**Context.** The game reports these fields each frame. The director only reacts when
something changes, or on its own one-second timer.

| Field | Values | Source |
|---|---|---|
| `scene` | `title`, `world` | Account page, overworld |
| `season`, `time` | season; `dawn`/`day`/`dusk`/`night` | Game calendar |
| `zone` | `overworld`, `homestead`, `interior`, `cellar`, `delve` | Active space |
| `biome` | map biome id under the player (outdoors) | Island map, e.g. `volcanic_ash`, `lava` |
| `weather` | `clear`, `rain` | Outdoor weather |
| `combat` | true/false | An awake enemy within 6 tiles, or the player hit an enemy in the last 4 s |
| `tags` | free-form mood tags | e.g. `delve:volcanic`, `delve:lobby`, `room:boss` |

**Rules.** Each rule has `id`, `priority`, a `when` block, `mode`, `cues` and optional
timings. The highest `priority` whose `when` matches wins; ties go to the rule listed
first. In a `when` block, lists match any listed value, `tags` requires all of its
tags, `anyTags` requires one, and conditions combine with AND. Cues are song names
or `{ "song", "weight" }` pairs. The director avoids repeating a rule's previous
piece when it has alternatives. An empty `cues` list is deliberate silence.

| Mode | Behaviour |
|---|---|
| `continuous` | Starts immediately (`fadeInSeconds`) and loops (title). |
| `sparse` | Waits `entrySilenceSeconds`, plays one piece, then waits `silenceSeconds` before the next. |
| `combat` | Plays `enterStinger` and cross-fades into a looping cue over `fadeInSeconds` (about 1 s). It holds through lulls shorter than `exitHoldSeconds`. On exit it fades over `fadeOutSeconds` and plays `exitStinger`, then waits `afterSilenceSeconds` before the underlying rule resumes. Stingers are rate-limited by `defaults.stingerCooldownSeconds`. |

Defaults (`defaults`) cover silences, fades and the stinger cooldown. Leaving a
rule fades its piece over `fadeOutSeconds`, unless the piece is also a cue of the new
rule. An in-progress silence is shortened, never lengthened, to the new rule's entry
silence. The director is a pure state machine: time is passed in and randomness is
seeded, so `music-director.test.ts` can step through scheduling exactly.

## 3. SFX: parametric synthesis (ZzFX-style)

`*.sfx.json` files hold synth parameter sets for a small in-repo synth
(`packages/engine/src/audio/sfx.ts` — oscillator + envelope + slide + filter + noise mix,
~150 lines, modeled on ZzFX's parameter space). Each SFX declares 2–4 param-jitter
ranges so repeats don't sound machine-gun identical.

Required set (launch): footsteps ×3 surfaces, tend-swish, fruit-pick *pop*, fruit
landing in basket, coin/purchase, error-buzz (soft, marimba-like — never harsh),
UI hover tick, UI confirm, door, press squeeze (wet creak), liquid pour, cask bubble,
bottle clink, vintage fanfare support, bird chirps ×3, wind gust, rain loop (filtered
noise), night crickets loop.

Mix rules: SFX bus −6 dB under music bus; walking footsteps −18 dB (present, not
noticeable); everything through a soft limiter. Master/music/SFX sliders and separate
"play in background" toggles for music and sounds live in settings and persist in
browser storage.

## 4. Ambience layer

A third bus running continuous procedural beds keyed to season/time/weather:
birds+breeze (day), crickets+owl (night), rain (weather), cellar room-tone (drips,
wood creaks). Implemented as sparse random-scheduled SFX over a filtered-noise bed.
This layer is cheap and contributes most of the "alive" feeling — build it early
(milestone M2, not last).

## 5. Autoplay & lifecycle

Web Audio can't start before a user gesture: the title screen's "Press any key"
doubles as the audio unlock. When hidden, music and sounds follow their independent
background-playback preferences. Paused music resumes at the same position and a
paused atmospheric gap keeps its remaining duration. When neither bus may play in
the background, suspend the complete AudioContext and fade it in for one second on
resume. All audio code lives behind `AudioBus` so tests can run headless with a null
implementation.

## 6. Music director next steps

The director (§2.5) is in place. Next steps are:

- a Studio editor for the audio assignment, with a context simulator for previews;
- more mood sources (quests, festivals, boss phases);
- stingers for non-combat events (level-up, vintage);
- musically aware transitions (entering on a bar line, since the sequencer knows the beat).

Preserve the long, randomised silences.
