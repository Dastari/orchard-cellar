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
