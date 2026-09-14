# Project Agent Guidance

## T3 shared browser preview

Use `https://orchard.dastari.net/` as the canonical Orchard & Cellar URL for
T3 shared-browser preview and visual verification.

## Cellar Studio rapid development

The user authorizes deploying Cellar Studio editor updates as part of each update.
After relevant checks, build with `--mode studio-production`, restart
`orchard-studio.service`, and verify `https://cellar.dastari.net/` using the
deployment procedure in `ops/orchard-runtime/README.md`. Do not stop to request
deployment confirmation for these editor updates.

### Cellar UI release source

Cellar's reviewed kit/workspace source is currently isolated at
`/home/toby/projects/orchard-cellar-studio-release`. This checkout still contains
Studio's retired renderer. Its Studio prebuild guard intentionally rejects a
rebuild until the reviewed kit is integrated; use the release source for editor
updates. See `.git/cellar-ui-release.md` for the active artifact and rollback.
Preserve this guard during unrelated frontend or performance work. Do not deploy
Studio output produced by bypassing it.
