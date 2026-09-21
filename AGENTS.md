# Project Agent Guidance

## Dedicated agent account

Use the owner-authorized development account documented in
[Agent development account](docs/agent-development-account.md). Its password is
stored only in encrypted local credential storage; never print credentials or
tokens. Account access does not grant release approval or world owner privileges.

## T3 shared browser preview

Use `https://orchard.dastari.net/` as the canonical Orchard & Cellar URL for
T3 shared-browser preview and visual verification.

## Cellar Studio rapid development

The user authorizes deploying Cellar Studio editor updates as part of each update.
After relevant checks, build with `--mode studio-production`, restart
`orchard-studio.service`, and verify `https://cellar.dastari.net/` using the
deployment procedure in `ops/orchard-runtime/README.md`. Do not stop to request
deployment confirmation for these editor updates.

### Cellar Studio source and independent build

Studio's reviewed UI kit and editor source live in this repository under
`packages/ui/src/kit` and `packages/studio`. Shared source assets live in
`packages/assets` and `packages/ui/public`; application public copies are generated.
Use this repository and normal Git/PR workflows for Studio updates.

Build Studio independently with `npm run studio:build -- --mode studio-production`.
For a staged release, use `scripts/build-reviewed-studio.sh` as documented in
`ops/orchard-runtime/README.md`. It stages only this repository. Preserve the
Studio UI-kit prebuild check. The live folder remains `packages/studio/dist`;
never edit generated live files as source. Studio updates do not require a game
or world deployment. See `.git/cellar-ui-release.md` for installed artifact/rollback.

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

## Agent Mail startup and coordination

At the start of every project session, before editing files:

1. Connect to the configured `mcp_agent_mail` MCP server at
   `http://127.0.0.1:8765/mcp/` and call `health_check`.
2. Call `ensure_project` with `human_key` set to
   `/home/toby/projects/orchard-cellar`. Use this same canonical `project_key`
   across all worktrees; never substitute the current branch's worktree path.
3. Call `register_agent` with your actual program/model and task description.
   Omit `name` to get a distinct session identity; retain the returned name.
4. Call `fetch_inbox` for that identity and inspect active reservations using
   `resource://file_reservations/{slug}?active_only=true`, using the `slug`
   returned by `ensure_project`.
5. Before edits, call `file_reservation_paths` for the specific paths/globs you
   will change. Check returned conflicts and resolve overlap before proceeding.
   Renew leases during long work and release them with
   `release_file_reservations` at completion or handoff.

If the local service is unavailable, run
`systemctl --user start orchard-agent-mail.service` and retry the health check.
If tools are missing from the session, report that the client needs a restart;
do not claim registration or reservation succeeded. Read-only investigation can
continue while connection problems are resolved. Follow user messaging permissions.

Setup, recovery and client configuration: [Agent Mail runbook](ops/agent-mail/README.md).

## Production publishing and credential handoff

Before preparing a deployment, read
[the agent publishing runbook](ops/orchard-runtime/PUBLISHING.md) and the linked
runtime procedure. Determine the actual code/content/full-schema scope, preserve
the reviewed Studio guard, and use the applicable guarded release lane. Obtain
reconnect credentials through the authorized shared browser and a private encrypted
local handoff; share only the resulting file path, never tokens in chat. Validate
refresh before handing the file to the publishing agent. Coordinate checkout and
credential ownership with that agent; do not race refreshes or bypass failed gates.
