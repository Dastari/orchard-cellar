# Project Agent Guidance

## Documentation lives in the wiki

Design, decisions, plans and runbooks live in the project wiki:
**https://wiki.orchard.dastari.net/** (SilverBullet; start at `Home` or `Index`).
The repository's `docs/` directory is retired: it keeps only files that tooling or
tests read, write or byte-check (see `docs/README.md`).

- **Read and search.** Use the `orchard-wiki` MCP server: `search`, `read_page`,
  `list_pages`, `backlinks`, `list_attachments`. If it is not configured, add it
  with `claude mcp add --scope user orchard-wiki -- /home/toby/.nvm/versions/node/v24.19.0/bin/node /home/toby/projects/orchard-wiki/mcp/src/server.ts`
  (or `--transport http orchard-wiki http://127.0.0.1:3312/mcp` when the service
  runs). Codex and other clients: see `mcp/README.md` in the wiki repository.
- **Write.** Use `write_page` (it commits and pushes to the wiki's `main`; pass the
  `sha` from `read_page` as `expected_sha`), or clone the private wiki repository
  `Dastari/orchard-wiki` into your own directory, edit `space/<Section>/<Page>.md`,
  then `git pull --rebase && git push origin main`. Wiki content goes straight to
  wiki `main`; the game repo's PR-only rule applies to this repository, not to wiki
  pages. Never edit the live checkout `/var/lib/orchard-wiki/live`. Follow the wiki
  repository's `AGENTS.md` for conventions (full-path `[[Section/Page]]` links,
  frontmatter, attachments, table rules).
- **Where things go.** Design docs, plans, specs, decisions, ADRs, handoffs, audits,
  reviews and release records go to the wiki, never to `docs/`. Record decisions and
  deviations in `Decisions/` (the register and its Decision Log; `DECISIONS.md` is
  only a pointer), plans in `Roadmap/`, release records in `Operations/Releases` and
  `History/`. Link the wiki pages you touched from your PR.
- **Owner decisions.** The section pages (Systems, World, Studio, Architecture and
  so on) state what the owner has decided, and `Roadmap/Owner Questions` lists what
  is still waiting for the owner. Check them before re-litigating a design choice,
  and add new open questions there rather than guessing.
- **Generated content tables.** After a content change on `main`
  (`packages/assets/content/**`, item or creature art), regenerate the wiki's
  item, recipe, creature and loot tables from the wiki repository:
  `node tools/generate-content-tables.mjs --game /home/toby/projects/orchard-cellar --ref origin/main`,
  check with `--check`, and commit the result. Other generated wiki pages are listed
  on `Operations/Wiki Publishing Jobs`.

## Dedicated agent account

Use the owner-authorized development account documented in
[Agent development account](docs/agent-development-account.md). Its password is
stored only in encrypted local credential storage; never print credentials or
tokens. Account access does not grant release approval or world owner privileges.

## T3 shared browser preview

Use `https://orchard.dastari.net/` as the canonical Orchard & Cellar URL for
T3 shared-browser preview and visual verification.

## Cellar Studio rapid development

The user authorizes deploying Cellar Studio editor updates, but **only from `main`
after the PR has merged** (owner decision 61-D5, wiki page
`Decisions/61-D5 Studio Deploys Only From Main`). Never deploy Studio from an
unmerged branch or PR worktree: parallel lane builds would overwrite each other in
`packages/studio/dist`. Once the change is merged and the relevant checks pass,
build from an up-to-date `main` with `--mode studio-production`, restart
`orchard-studio.service`, and verify `https://cellar.dastari.net/` using the
deployment procedure in `ops/orchard-runtime/README.md`. Do not stop to request
deployment confirmation for these merged editor updates.

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
Record each release in the wiki (`Operations/Releases` index and a `History/` page),
not in `docs/`.
