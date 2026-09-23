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
- `audio-bus.ts` — cue selection, cross-fades, silence gaps, checkpoints, volume and
  background policy.

| Runtime cue | Song source | Behaviour | Context |
|---|---|---|---|
| `theme_title` | `theme_title.song.json` | Loops continuously | Account/title screen |
| `theme_spring` | `theme_spring.song.json` | One pass, then 55–140 s of silence | Dawn and daytime exterior; cellar |
| `theme_night` | `theme_night.song.json` | One pass, then 40–105 s of silence | Dusk and night exterior |

Title music loops after the first user gesture. World cues play one pass, fade over
their final eight seconds, and leave a randomised quiet interval before returning, so
music stays an atmospheric event rather than a constant bed. Changing cue cross-fades
over eight seconds (2.5 s for the first cue after unlock).

The bus checkpoints cue, tracker position (in steps) and remaining quiet interval
once per second and on page hide, as version 2 of `orchard-cellar.music-playback`.
Reloads, browser restarts and account-page transitions resume that checkpoint
instead of restarting the song; sustained notes that were sounding at the saved
step are re-entered with a soft attack. Version 1 checkpoints (seconds into the
retired MP3s) are ignored. Account-page navigation fades for 650 ms; explicit stop
fades over one second.

### 2.1 Song format

```jsonc
{
  "name": "theme_summer_day",
  "bpm": 84, "swing": 0.08,             // 72–96 BPM, swing 0–0.12
  "stepsPerBeat": 4, "beatsPerBar": 4, "loopBars": 48,   // 48, 64 or 96 bars
  "masterGainDb": -6,                   // whole-song trim
  "key": "G", "mode": "mixolydian",     // documentation only
  "humanize": 1,                        // optional: 0 = machine-tight, 1 = patch default
  "fx": { "reverb": 0.9, "delayBeats": 0.75, "delayFeedback": 0.3 },  // optional
  "channels": [
    {"patch": "flute", "vol": 0.62, "patterns": ["A","A","B","A2"],
     "pan": 0.1,                                   // optional, -1 left … 1 right
     "sends": {"reverb": 0.4, "delay": 0.2},       // optional, per-channel send levels
     "instrument": {"amp": {"release": 0.6}}},     // optional patch tweaks (§2.2)
    {"patch": "pad",  "vol": 0.4, "patterns": ["Pa","Pa","Pb","Pa"]}
  ],
  "patterns": {
    // [step, note, lengthInSteps, velocity?]  velocity 0–1, default 0.8
    "A": {"steps": 64, "notes": [[0,"G4",4],[8,"B4",4,0.9],[16,"D5",8,0.7]]}
  },
  "loop": true
}
```

All fields added for the synth (`humanize`, `fx`, `pan`, `sends`, `instrument`, the
fourth note element) are optional; older songs remain valid. `npm run assets:validate`
checks ranges.

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
In the shipped themes the lead sits highest; pad and bass about 6–8 dB below it
("loudest 400 ms" column); plucks, bells and strings 8–10 dB below; shaker about
16 dB below. Aim for whole-song RMS near −21 dBFS for day/title and about −28 dBFS
for night, with peaks below −6 dBFS.

### 2.3 Listening and verification

- **Studio:** Author → Audio Preview (`/author/audio` on Cellar Studio) lists every
  `*.song.json` and `*.sfx.json` automatically and plays them through the exact game
  bus, with a live output meter.
- **Game (local):** `npm run dev`, open the client, and press a key on the title screen.
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

### 2.4 Required soundtrack (launch)

| Song | Context | Character |
|---|---|---|
| `theme_title` | Title screen | Warm, nostalgic, slow build, signature motif |
| `theme_spring` / `summer` / `autumn` / `winter` | Farm by season | Same signature motif re-arranged per season (unifies the score) |
| `theme_night` | After sundown, any season | Sparse pads + bells, crickets ambience |
| `theme_cellar` | Cellar interior | Close, woody, slow pluck, heavy reverb |
| `theme_visiting` | On a friend's farm | Lighter social variation of season theme |
| `sting_vintage` | Prestige moment | 8-bar celebratory cadence, non-looping |
| `sting_levelup` | Skill/knowledge gain | 2-bar motif |

Composition rule: write the 4–8 note **signature motif** first (title theme), then
quote it in every seasonal theme. Day music crossfades (8 s) to night; interior music
ducks exterior entirely.

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

## 6. Future music director

Expand the current time-of-day selector into a proper atmospheric director: multiple
cues per biome and season, recent-play avoidance, weather weighting, location stingers,
and musically aware transition points (e.g. cross-fading on a bar line, since the
sequencer knows the beat). Preserve randomized silence.
