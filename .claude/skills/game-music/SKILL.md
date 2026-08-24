---
name: game-music
description: Compose music (*.song.json tracker files) and sound effects (*.sfx.json synth params) for Orchard & Cellar. Use for any audio work — songs, stings, SFX, ambience beds, mixing, or the Web Audio sequencer/synth code. Keeps the calm-farm sound cohesive.
---

# Music & SFX Authoring — Orchard & Cellar

Binding spec: `docs/12-audio-design.md`. Audio is text: tracker songs and synth
parameter files rendered at runtime via Web Audio. Target feel: calm, warm,
pastoral — Stardew spring themes, A Short Hike. Never harsh, never urgent.

## Composition rules (songs)

- **Patch set is closed**: flute, pad, pluck, bass, bells, strings, accordion,
  woodblock, shaker (defined in `client/src/audio/patches.ts`). Compose only with
  these. New patch = doc change + DECISIONS.md entry.
- Tempo 72–96 BPM, swing 0–0.12. Modes: major, lydian, mixolydian; dorian allowed
  for night/cellar. Avoid minor keys except transient color.
- **Quote the signature motif** (the 4–8 note phrase defined by `theme_title`) in
  every seasonal theme — it's what makes the soundtrack one work. Write the motif
  first if `theme_title` doesn't exist yet.
- Space is the instrument: rests between phrases; melody density low (a note every
  1–2 beats, not streams of 16ths); pads sustain under everything.
- Loop lengths 48–96 bars for themes (short loops fatigue); stings 2–8 bars,
  non-looping.
- Structure per season: same motif, different arrangement — Spring = flute lead +
  bells; Summer = accordion + shaker warmth; Autumn = pluck-forward, busier;
  Winter = sparse pads + bells, half-time feel.

## Verification (do not skip)

After writing a song, actually listen: `npm run assets:preview` audio tab plays any
song/sfx. Check: no clipping (master meter), no dissonant collisions between
channels, melody audible over pad, loop seam inaudible. Iterate at least once —
first drafts of generated music are always too busy; the fix is nearly always
*deleting notes*.

## SFX rules

- Author `*.sfx.json` params for the in-repo ZzFX-style synth. Every SFX declares
  jitter ranges (pitch ±3–8%, decay ±10%) so repeats don't machine-gun.
- Character: soft attacks for UI, woody/organic for world (press creaks, cask
  bubbles), marimba-like for errors — never a harsh buzzer.
- Mix: SFX bus −6 dB under music; footsteps −18 dB; everything through the soft
  limiter. Respect the 100 ms feedback rule from `docs/13-ui-ux.md`.

## Ambience beds

Sparse random-scheduled events (bird chirps every 4–12 s, wind gusts) over filtered
noise, keyed to season/time/weather. Build variation through scheduling randomness,
not more assets.
