# Doc 59 P7 HUD cache design review

Read-only design task in existing reviewer worktree. Read doc59 P7, the
integrated overworld-main.ts uiDraw stage and OverworldUi drawing/model state.
Do not implement, commit, or edit root-owned files. P7 is not claimed yet.

Identify a conservative, pixel-identical cache boundary for the static HUD
that preserves ordering of nameplates, speech, tooltips, cursor, live minimap,
modal windows, touch controls and dynamic animations. Give an explicit revision
or dependency strategy; model identity changes every frame, and JSON-stringifying
all models is not an acceptable hot-path substitute. Account for fractional
DPR/UI transforms and translucent pixels when composing transparent cache layers.
Report exact consumers needing mechanical extraction before main logic changes.
No benchmarks/heavy checks. Record design evidence under P7 only if needed;
lint any scripts before copying canonical output.
