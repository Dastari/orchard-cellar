# 09 — Authentication, Membership & Sessions

Binding auth design after the successful M5.5 SpaceTimeDB gate. Production uses an
OIDC identity accepted by SpaceTimeDB plus a private game membership record. A verified
new account is admitted automatically as a `friend`; privileged roles and moderation
remain owner-managed. Local host-issued anonymous identities are development-only,
disposable, and never a production account system.

## 1. Identity model

- The durable SpaceTimeDB `Identity` is the account key used by owned rows.
- Production connections must present a token from the configured OIDC issuer and
  audience. The module rejects anonymous, wrong-issuer, and wrong-audience identities
  before creating player state, then automatically provisions a valid first connection
  with the non-privileged `friend` role.
- The approved implementation baseline is self-hosted Keycloak with PostgreSQL, using
  issuer `https://auth.orchard.dastari.net/realms/orchard` and public browser client
  `orchard-web`. The digest-pinned production deployment and acceptance evidence are
  recorded in [24-self-hosted-oidc.md](24-self-hosted-oidc.md).
- Account linking/recovery must be explicitly tested before the provider is considered
  production-ready. Existing host-issued identities remain disposable unless the owner
  chooses a separately reviewed proof-of-both-identities migration. The owner approved
  discarding those development identities for this rollout.

## 2. Membership and moderation

A private membership table stores identity, role (`owner`, `friend`, `moderator`),
approval/revocation timestamps, and moderation state. A valid first-time Orchard OIDC
identity receives an audited `friend` row automatically. Only the owner may grant
privileged roles; owners and moderators may revoke or block friends. The bootstrap
owner identity is supplied as deployment configuration, never inferred from the first
arbitrary internet connection.

The module implements private membership/audit tables, owner/moderator role checks,
last-owner lockout protection, immediate presence removal on revocation, and membership
checks at connection and reducer boundaries. Production enforcement stays gated by a
non-empty OIDC client list until the captured owner identity is in the bootstrap
allowlist and backed up.

Identity-provider administration and game administration are deliberately separate.
The named Keycloak master-realm administrators operate accounts and recovery; the
captured Orchard identity is an `owner` in the private SpaceTimeDB membership table.
Keycloak roles may later be displayed as hints, but they are never authoritative game
permissions. This avoids token-lifetime permission lag and duplicate role state.

Owner-only world controls use audited SpaceTimeDB reducers. The caller-filtered
`own_membership` view lets the client reveal the controls only to an owner, while the
reducers independently enforce the current membership row. Shared calendar/weather
state is replicated from `world_environment`; no client-local date, time, or rain
override can mutate the world.

Revocation prevents new connections immediately and terminates active presence on the
next authorization check. Every sensitive reducer checks current membership and role;
connection admission alone is not sufficient for destructive or administrative acts.

## 3. Client token handling

The generated client SDK obtains and refreshes the identity token. Production token
storage follows the selected OIDC/SpaceTimeAuth browser SDK and must not expose tokens
to logs, URLs, game saves, screenshots, or authored assets.

During local development only, the host-issued token is stored in `localStorage` under
`orchard:world:<host>:<database>:<slot>:token`. Named `slot` values exist solely so
one browser profile can exercise two identities. They are not usernames or security
boundaries.

The application starts at `/`, where a player may remember up to twelve named slots
and continue the last-used slot. The local game URL remains on `/?slot=<name>`; there
are no separate account or overworld HTML entry points. This chooser only selects the
matching host-issued token above, and its labels explicitly identify it as a local
friends preview. This development UX must be replaced by the configured OIDC flow
before internet exposure.

The browser implements Authorization Code + PKCE against a configured OIDC provider.
Configure `VITE_OIDC_CLIENT_ID` and register the exact application root as an allowed
redirect URI; issuer and redirect overrides are documented in `.env.example`.
Identity and refresh tokens are kept in `sessionStorage`, never URL parameters or the
local profile store. The account screen handles account creation/sign-in, callback
validation, refresh, and sign-out. The local chooser is routed only when both Vite
development mode and `VITE_ENABLE_LOCAL_PROFILES=true` are present. A production build
with missing OIDC configuration fails closed at the account screen and never reuses a
local host token. The self-hosted production rollout is specified in
[24-self-hosted-oidc.md](24-self-hosted-oidc.md).

The account screen exposes separate Sign In, Create Account, and Recover Account
actions. All three start the same state/nonce/S256-PKCE transaction: registration adds
the standard `prompt=create`, while recovery uses Keycloak's supported
`forgot-credentials` authorization-path variant. Credentials are always entered into
real Keycloak forms. The versioned `orchard` Keycloak theme changes CSS, local art,
and copy only; it adds no JavaScript and does not embed, proxy, or reimplement a
password form inside the game. This preserves CSRF protection, password-manager and
accessibility semantics, verification, recovery, OTP, and future provider flows.

Before publishing an internet-facing module, copy the same public client ID into
`OIDC_CLIENT_IDS` in `packages/world/src/auth-policy.ts` and republish. A non-empty list
enforces a JWT from the pinned configured issuer and audience during connection;
the empty list is intentionally local-development-only. No client secret belongs in
either location.

## 4. Names and authored text

Display and farm names are labels, never lookup keys. They are 3–20 characters from
letters, digits, spaces, apostrophe, and hyphen; no leading/trailing or repeated spaces.
The authority validates writes and applies the in-repo denylist. Chat and guestbook
text use the bitmap-font character set and documented length/rate limits.

## 5. Security requirements

- Use `ctx.sender` for ownership. Reducers never accept an authoritative identity or
  position from the caller.
- Keep inventory, detailed progression, permissions, blocks, and moderation private;
  expose only sender-filtered views or projected public summaries.
- Treat spatial queries and subscription filters only as bandwidth controls.
- Apply server-side reach, role, cooldown, ownership, quantity, and rate validation in
  the same transaction as each mutation.
- Pin issuer, audience, SDK/runtime version, HTTPS reverse-proxy configuration, CSP,
  and token-redaction rules in deployment config.
- No global chat or public server browser for the friends-only launch.

## 6. Required M6 tests

- A valid newly registered OIDC identity is auto-provisioned as `friend` and reconnects
  to the same player.
- Anonymous, wrong issuer/audience, revoked, and blocked identities fail.
- Revocation affects an already-connected client.
- A second identity cannot read or mutate private inventory/progression.
- Owner/moderator membership operations are role-checked and audited.
- No reducer accepts spoofed owner/position fields.
- Tokens and claims never appear in logs or client-visible error strings.
- Two tabs for one identity maintain correct presence until the last connection closes.
