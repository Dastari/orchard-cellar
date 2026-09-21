# Orchard Agent Mail

## Contract

Provide persistent coordination for Codex and Claude Code using
[MCP Agent Mail Rust](https://github.com/Dicklesworthstone/mcp_agent_mail_rust),
pinned to **v0.3.36**. One systemd user service listens on
`http://127.0.0.1:8765/mcp/`; the operator UI is `/mail/`.
All Orchard worktrees use `/home/toby/projects/orchard-cellar` as `project_key`
(and as `human_key` for `ensure_project`). Other hosts use their primary clone's
absolute path consistently. Branch paths must not create separate mail projects.

The service owns SQLite indexing and a Git archive under
`~/.local/share/orchard-agent-mail/`. State, identities, messages and binaries
are outside the source checkout. Application builds and deployments are unaffected.
Loopback access is unauthenticated: this trusts local OS users and agents. Do not
expose this endpoint through a proxy or bind it publicly without configuring bearer
authentication and reviewing access. No credentials are committed.

## Install and connect

On Linux x86_64 with systemd user services, curl, tar, sha256sum and Python 3:

```bash
bash ops/agent-mail/install.sh
python3 ops/agent-mail/verify.py /home/toby/projects/orchard-cellar
```

The installer verifies a pinned release hash, installs binaries into
`~/.local/lib/orchard-agent-mail/v0.3.36/`, and enables
`orchard-agent-mail.service`. Re-running it preserves persistent state.
Checked-in `.codex/config.toml` and `.mcp.json` connect Codex and Claude Code
respectively when this branch is checked out (and after merge). Codex requires a
trusted project; Claude may require approving the project MCP server.
For existing worktrees without these files, register the same endpoint locally:

```bash
codex mcp add mcp_agent_mail --url http://127.0.0.1:8765/mcp/
claude mcp add --scope local --transport http mcp_agent_mail http://127.0.0.1:8765/mcp/
```

Run the Claude command from each existing checkout that needs it. The Codex command
registers at user scope. Restart agent sessions to load new MCP tools. Cursor and
Gemini are not installed on this host; their configuration is intentionally absent.
Do not run upstream automatic setup unless you intend its additional config and
hook changes. No Git hooks are installed here; reservations remain advisory.

## Agent workflow

1. Call `ensure_project` with the canonical `human_key`, then `register_agent`
   using your actual program/model and task description. Keep the returned name
   for the session; use a distinct identity for each concurrent session.
2. Read your inbox and active file reservations before edits. Reserve only your
   task's paths using `file_reservation_paths`; choose a finite TTL and refresh
   while working. Resolve conflicts with the owner before overlapping edits.
3. Use task/PR identifiers as thread IDs for authorized coordination messages.
   Follow the user's messaging permissions; setup does not itself authorize
   unsolicited messages. Acknowledge messages when requested.
4. Release reservations with `release_file_reservations` on completion or handoff.
   Keep PRs and repository handoff documents as the durable review record.

## Verification and recovery

`verify.py` performs MCP initialize, tool discovery, health check, canonical project
registration, and an isolated test identity's reservation/acquire/release cycle.
It sends no messages. It fails nonzero on protocol/tool errors or conflicts.
The test identity remains as a harmless audit record. Run it twice and after a
service restart to check persistence and repeatability.

```bash
systemctl --user status orchard-agent-mail.service
journalctl --user -u orchard-agent-mail.service -n 60 --no-pager
systemctl --user restart orchard-agent-mail.service
curl --fail http://127.0.0.1:8765/health
```

A download or checksum failure stops installation before replacing binaries.
An occupied port causes startup/verification failure: inspect the existing listener
before changing ports; keep service and both clients consistent. If the service
fails, inspect its journal and permissions on the state directory. Do not run
reset/repair commands against mailbox data without inspecting and backing it up.
For backup, stop the service and copy the **entire** state directory (database,
sidecars and archive), then start it. To restore, stop first and restore that copy.

To disable: `systemctl --user disable --now orchard-agent-mail.service`; remove
only the Agent Mail entries from client configs. Retain the state directory.
For a binary rollback, retain the old version directory and restore the previous
unit's `ExecStart`; run daemon-reload and restart. Database compatibility must be
checked against upstream release notes before a downgrade.
User services survive logout only when user lingering is enabled; check with
`loginctl show-user "$USER" -p Linger`.
