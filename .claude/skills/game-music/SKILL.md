---
name: game-music
description: Compose music (*.song.json tracker files) and sound effects (*.sfx.json synth params) for Orchard & Cellar. Use for any audio work — songs, stings, SFX, ambience beds, mixing, or the Web Audio sequencer/synth code. Keeps the calm-farm sound cohesive.
---

# Music & SFX Authoring — Orchard & Cellar

Binding spec: [wiki: Systems/Audio & Music](https://wiki.orchard.dastari.net/Systems/Audio%20%26%20Music). Audio is text: tracker songs and synth
parameter files rendered at runtime via Web Audio. Music is **tracker songs only**
(owner decision 2026-09-23) — never add recorded/streamed music files. Target feel: calm, warm,
pastoral — Stardew spring themes, A Short Hike. Never harsh, never urgent.

## Composition rules (songs)

- **Patch set is closed**: flute, pad, pluck, bass, bells, strings, accordion,
  woodblock, shaker (defined in `packages/engine/src/audio/patches.ts`). Compose only
  with these. New patch = design change on the wiki page
  plus a row in the wiki [Decision Log](https://wiki.orchard.dastari.net/Decisions/Decision%20Log).
- Song format and every instrument parameter (oscillator layers, filter envelope,
  ADSR, vibrato, velocity, pan, reverb/chorus/echo sends, per-channel `instrument`
  overrides, `[step, note, length, velocity]` notes) are documented in
  [wiki: Systems/Audio & Music](https://wiki.orchard.dastari.net/Systems/Audio%20%26%20Music) (Song format, Instrument parameters). Shape phrases with velocity (peak note ~0.9,
  phrase ending ~0.7) rather than extra notes.
- Tempo 72–96 BPM, swing 0–0.12. Modes: major, lydian, mixolydian; dorian allowed
  for night/cellar. Avoid minor keys except transient color.
- **Quote the signature motif** (the 4–8 note phrase defined by `theme_title`) in
  every seasonal theme — it's what makes the soundtrack one work. Write the motif
  first if `theme_title` doesn't exist yet.
- Space is the instrument: rests between phrases; melody density low (a note every
  1–2 beats, not streams of 16ths). **No drones or beds** (owner, 2026-09-23): no
  sustained pad chords, no held bass — harmony comes from soft broken chords, short
  plucked bass roots and occasional string swells. Silence between pieces is part of
  the design (Minecraft-like).
- Song `kind`: `theme` 48/64/96 bars; `piece` 8–96 bars (usually 16) played once by
  the director; `combat` 4–32-bar loops; `sting` 1–8 bars, `"loop": false`.
- To make music play in the game, add the song as a cue in
  `packages/assets/music/audio-assignment.json` (the music director's context rules:
  zone, time, weather, biome, combat, mood tags — [wiki: Systems/Audio & Music](https://wiki.orchard.dastari.net/Systems/Audio%20%26%20Music), Music director).
- Structure per season: same motif, different arrangement — Spring = flute lead +
  bells; Summer = accordion + shaker warmth; Autumn = pluck-forward, busier;
  Winter = sparse pads + bells, half-time feel.

## Verification (do not skip)

After writing a song, actually listen: Studio → Author → Audio Preview
(`/author/audio`) lists and plays every song/sfx through the game bus (the
`npm run assets:preview` audio tab embeds the same player). Then run
`npm run music:render -- <song> --stems` (add `--passes=2` for the loop seam): it
renders WAVs to `output/music-renders/` (never commit them) and reports peak/RMS,
per-channel levels and clipping. Check: no clipping, no dissonant collisions between
channels, melody audible over pad (pad/bass ~6–8 dB under the lead), loop seam
inaudible. Iterate at least once —
first drafts of generated music are always too busy; the fix is nearly always
*deleting notes*.

## SFX rules

- Author `*.sfx.json` params for the in-repo ZzFX-style synth. Every SFX declares
  jitter ranges (pitch ±3–8%, decay ±10%) so repeats don't machine-gun.
- Character: soft attacks for UI, woody/organic for world (press creaks, cask
  bubbles), marimba-like for errors — never a harsh buzzer.
- Mix: SFX bus −6 dB under music; footsteps −18 dB; everything through the soft
  limiter. Respect the 100 ms feedback rule from [wiki: UI/Style Guide](https://wiki.orchard.dastari.net/UI/Style%20Guide).

## Ambience beds

Sparse random-scheduled events (bird chirps every 4–12 s, wind gusts) over filtered
noise, keyed to season/time/weather. Build variation through scheduling randomness,
not more assets.
