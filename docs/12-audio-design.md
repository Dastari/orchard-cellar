# 12 — Audio Design: Music & Sound Effects

Like art, **audio is authored as text** and synthesized at runtime through Web Audio.
No binary audio files in the repo at launch. This keeps audio agent-authorable,
diffable, tiny (KB not MB), and stylistically consistent. A CC0 recorded-audio upgrade
path exists (§6) but is not the plan of record.

## 1. Aesthetic target

Calm, warm, pastoral. Reference feel: Stardew Valley's spring themes, A Short Hike —
gentle tempo (72–96 BPM), major/lydian/mixolydian modes, soft attack instruments,
generous space between phrases. Nothing urgent, nothing chiptune-harsh: we use a
**"soft synth" patch set** (filtered triangle/sine leads, slow-attack pads, plucked
tones with fast decay), not NES square-wave bleeps.

## 2. Music system: in-repo tracker

Songs are `*.song.json` in `packages/assets/music/`, played by the client's
sequencer (`client/src/audio/sequencer.ts`, built on Web Audio oscillators + one
noise buffer + biquad filters + a shared convolver reverb).

```jsonc
{
  "name": "theme_summer_day",
  "bpm": 84, "swing": 0.08,
  "key": "G", "mode": "mixolydian",
  "channels": [
    {"patch": "flute",  "vol": 0.8, "patterns": ["A","A","B","A2"]},
    {"patch": "pad",    "vol": 0.5, "patterns": ["Pa","Pa","Pb","Pa"]},
    {"patch": "pluck",  "vol": 0.6, "patterns": ["-","Qa","Qa","Qb"]},
    {"patch": "bass",   "vol": 0.7, "patterns": ["Ba","Ba","Bb","Ba"]}
  ],
  "patterns": {
    "A": {"steps": 32, "notes": [[0,"G4",4],[4,"A4",2],[6,"B4",6]]}   // [step, note, lengthInSteps]
  },
  "loop": true
}
```

**Patch set is closed** (the audio analog of the palette): `flute`, `pad`, `pluck`
(kalimba-ish), `bass`, `bells`, `strings`, `accordion`, `woodblock`, `shaker`. Patches
are defined once in `patches.ts` (oscillator mix, ADSR, filter, vibrato, reverb send).
Agents compose songs only from these — that is what makes the soundtrack cohesive.
New patches require a doc update, like palette colors.

### Required soundtrack (launch)

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
quote it in every seasonal theme. Day music crossfades (4 s) to night; interior music
ducks exterior entirely.

## 3. SFX: parametric synthesis (ZzFX-style)

`*.sfx.json` files hold synth parameter sets for a small in-repo synth
(`client/src/audio/sfx.ts` — oscillator + envelope + slide + filter + noise mix,
~150 lines, modeled on ZzFX's parameter space). Each SFX declares 2–4 param-jitter
ranges so repeats don't sound machine-gun identical.

Required set (launch): footsteps ×3 surfaces, tend-swish, fruit-pick *pop*, fruit
landing in basket, coin/purchase, error-buzz (soft, marimba-like — never harsh),
UI hover tick, UI confirm, door, press squeeze (wet creak), liquid pour, cask bubble,
bottle clink, vintage fanfare support, bird chirps ×3, wind gust, rain loop (filtered
noise), night crickets loop.

Mix rules: SFX bus −6 dB under music bus; walking footsteps −18 dB (present, not
noticeable); everything through a soft limiter. Master/music/SFX sliders in settings,
persisted per account.

## 4. Ambience layer

A third bus running continuous procedural beds keyed to season/time/weather:
birds+breeze (day), crickets+owl (night), rain (weather), cellar room-tone (drips,
wood creaks). Implemented as sparse random-scheduled SFX over a filtered-noise bed.
This layer is cheap and contributes most of the "alive" feeling — build it early
(milestone M2, not last).

## 5. Autoplay & lifecycle

Web Audio can't start before a user gesture: the title screen's "Press any key"
doubles as the audio unlock. Suspend the AudioContext when the tab is hidden;
fade-in 1 s on resume. All audio code lives behind `AudioBus` so tests can run
headless with a null implementation.

## 6. Upgrade path (post-launch, optional)

If the user later wants recorded music: the sequencer's song JSONs render offline to
OGG via a Node script (same code path, offline AudioContext), which can also serve as
stems for a human/DAW pass. Do not plan agent time for this now.
