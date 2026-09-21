# ADR 002: Shared local Agent Mail service

Date: 2026-09-21
Status: Accepted

## Context

The user requested MCP Agent Mail Rust for Orchard. Concurrent agent sessions and
Git worktrees need a common mailbox and advisory file reservations.

## Decision

Use a pinned upstream Linux binary as a headless systemd user service, with HTTP
MCP on loopback, external persistent state, and the primary clone's absolute path
as the canonical project identity. Configure both installed clients (Codex and
Claude Code). See the [contract and runbook](../../ops/agent-mail/README.md).

## Consequences and alternatives

A shared daemon gives all clients one writer/service lifecycle. Per-session stdio
servers would duplicate that lifecycle. A source build adds a Rust toolchain and
upstream build dependencies; the checksum-pinned release is reproducible here.
Loopback without bearer auth trusts local users, avoids secret distribution, and
must not be exposed publicly. Advisory reservations require agent cooperation.
This developer dependency adds no application runtime dependency or release bump.
