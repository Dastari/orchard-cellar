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

## Git Workflow



All substantive changes MUST be delivered through a GitHub Pull Request.



Never commit directly to `main`.

Never push directly to `main`.

Never merge a PR unless explicitly instructed by the user.



For every task:



1. Fetch the latest remote state.

2. Inspect existing branches and open PRs.

3. Create a descriptive branch from the current upstream `main`.

4. Make changes.

5. Run the project's required tests, linting and build checks.

6. Commit logical units of work using descriptive commits.

7. Push the branch to `origin`.

8. Create or update a GitHub Pull Request using `gh`.

9. Include:

   - Summary

   - Changes made

   - Testing performed

   - Any risks or outstanding issues

10. Return the PR URL to the user.



The task is not considered complete until the PR exists.

## Production publishing and credential handoff

Before preparing a deployment, read
[the agent publishing runbook](ops/orchard-runtime/PUBLISHING.md) and the linked
runtime procedure. Determine the actual code/content/full-schema scope, preserve
the reviewed Studio guard, and use the applicable guarded release lane. Obtain
reconnect credentials through the authorized shared browser and a private encrypted
local handoff; share only the resulting file path, never tokens in chat. Validate
refresh before handing the file to the publishing agent. Coordinate checkout and
credential ownership with that agent; do not race refreshes or bypass failed gates.
