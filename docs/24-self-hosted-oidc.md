# 24 — Self-Hosted OIDC Implementation Plan

Status: **production enforcement deployed; final multi-account acceptance ongoing**. This document
is both the rollout contract and the sanitized deployment record for account authentication on the
`orchard` container.
Read [02-architecture.md](02-architecture.md), [09-auth.md](09-auth.md),
[15-agent-workflow.md](15-agent-workflow.md), [22-netcode.md](22-netcode.md), and
`DECISIONS.md` before changing code or infrastructure.

## 1. Outcome and non-goals

Deliver recoverable user accounts whose OIDC ID tokens are accepted by the browser and
the self-hosted SpaceTimeDB authority. Registration, email verification, login, token
refresh, logout, password reset, brute-force protection, and account administration
must work through an established identity provider. The game continues to authorize
all state with SpaceTimeDB `Identity` and `ctx.sender`.

Do not build a password database, password-reset flow, JWT signer, or login service in
the Orchard repository. Do not place a client secret, SMTP password, bootstrap admin
password, signing key, refresh token, or database password in Git, browser code, logs,
URLs, screenshots, or SpaceTimeDB rows. Do not enable production auth by merely hiding
the local profile chooser; the world module must reject missing and invalid JWTs.

## 2. Provider and topology gate

The implementation baseline is **Keycloak with PostgreSQL**, deployed by Docker Compose
on CT 105 (`orchard`, currently `10.0.1.150`). Keycloak is selected because it provides
OIDC Authorization Code + PKCE, self-registration, verified email, recovery, session
revocation, social identity brokering, and an administrative audit surface. Before
installing it, record the pinned Keycloak/PostgreSQL image digests and confirm that the
owner accepts the operational footprint. A different self-hosted provider is allowed
only if it meets every contract and test in this document; record that choice in
`DECISIONS.md` first.

Target routing:

```text
browser
  ├─ https://orchard.dastari.net/  → NPM → 10.0.1.150:5173 (Vite + /v1 proxy)
  └─ https://auth.orchard.dastari.net/ → NPM → 10.0.1.150:<private auth port>
                                                   ├─ Keycloak
                                                   └─ PostgreSQL (Docker network only)
```

The canonical issuer will be
`https://auth.orchard.dastari.net/realms/orchard`. Issuers are durable identity
namespaces: never change this URL after production users exist without an explicit
identity-migration plan.

Prerequisites requiring owner/external action:

- create public DNS for `auth.orchard.dastari.net` pointing to the existing NPM edge;
- provide an SMTP relay account and sender domain for verification/recovery messages;
- choose whether existing development identities may be discarded or must be linked;
- approve the pinned provider/database versions and backup destination.

## 3. Infrastructure phase

Create `/home/toby/services/orchard-auth/` on the Orchard container. Store Compose and
non-secret configuration there; store secrets in a root/user-readable deployment env
file with mode `0600`, outside the game repository. Use generated high-entropy values,
not example passwords. The Compose stack must include:

- Keycloak in production mode (`start`, never `start-dev`), pinned by digest;
- PostgreSQL pinned by digest, with a named persistent volume and no published port;
- health checks and dependency readiness, `restart: unless-stopped`, bounded logs, and
  an explicit Docker network;
- Keycloak health/metrics enabled only on an internal management listener;
- a bootstrap admin used once, then rotated or removed after a named administrator is
  established.

Expose the Keycloak application port only to the LAN interface needed by NPM. Firewall
it so only `10.0.1.248` and explicit administrator sources can reach it. Configure the
exact external hostname and `xforwarded` proxy-header handling; NPM must overwrite
`X-Forwarded-*` values rather than trust client-supplied ones. Prefer TLS on the NPM to
Keycloak hop; if the first rollout uses HTTP on the trusted LAN, record that temporary
exception and the upgrade task in `DECISIONS.md`.

On the NPM host (`toby@10.0.1.248`):

1. Back up the NPM SQLite database and `/etc/gema/haproxy/gema-web-sni.lst`.
2. Add `auth.orchard.dastari.net` to the SNI allowlist and validate HAProxy before its
   brief reload.
3. Create an NPM proxy host to the restricted Keycloak listener.
4. Request a Let's Encrypt certificate, force HTTPS, enable HTTP/2, and leave caching
   disabled.
5. Verify the public discovery document and certificate chain before continuing.

## 4. Realm and browser-client phase

Create realm `orchard` and a public OIDC client `orchard-web`:

- standard Authorization Code flow enabled; implicit and password grants disabled;
- PKCE method fixed to `S256`; no browser client secret;
- exact redirect URI `https://orchard.dastari.net/`;
- exact web origin `https://orchard.dastari.net` (no wildcard);
- short access/ID-token lifetime, bounded SSO idle/max sessions, rotating refresh-token
  policy, and server-side session revocation;
- an audience mapper that places the public client ID in the ID token `aud` claim;
- self-registration enabled only after SMTP works; require verified email, enable
  forgot-password, brute-force detection, and administrative event auditing;
- collect only the claims Orchard uses (`sub`, display name, email verification and
  roles). Do not put game inventory, position, permissions, or progression in tokens.

Create a separate development client for `http://localhost:5173/` if local callback
testing is required. Do not add localhost or wildcard redirects to the production
client. Export a redacted realm configuration for disaster recovery only after proving
it contains no secrets.

## 5. Orchard client and authority phase

The existing browser already implements Authorization Code + PKCE and sends the OIDC
ID token to the SpaceTimeDB TypeScript SDK. Generalize the remaining provider-specific
copy and configuration:

1. Set deployment values in the ignored `.env.local`:

   ```dotenv
   VITE_OIDC_ISSUER=https://auth.orchard.dastari.net/realms/orchard
   VITE_OIDC_CLIENT_ID=<public-client-id>
   VITE_OIDC_REDIRECT_URI=https://orchard.dastari.net/
   ```

2. Replace the `SPACETIMEAUTH` label and provider-name promises in
   `packages/client/src/account-main.ts` with neutral wording driven by actual realm
   capabilities.
3. Update `OIDC_ISSUER` and `OIDC_CLIENT_IDS` in
   `packages/world/src/auth-policy.ts`. These are public trust values, not secrets.
4. Add tests for the Keycloak issuer, accepted audience, multiple-audience tokens,
   missing JWT, wrong issuer, and wrong audience.
5. Publish the world module only after the owner identity has been captured and the
   membership/bootstrap path is proven. A non-empty client-ID list is the switch that
   rejects anonymous production connections.
6. Remove or compile-gate the local profile chooser from the public build. Keep it
   available only to an explicitly local development configuration.

SpaceTimeDB derives a stable `Identity` from OIDC issuer and subject. Changing provider,
realm URL, or subject therefore creates a different game identity even for the same
human. Existing host-issued development identities must either be declared disposable
or migrated through a separately reviewed, one-time proof-of-both-identities linking
flow. Never transfer ownership based on email or display name alone.

## 6. Safe rollout order

1. Back up the Orchard repository, `.spacetime-data`, Keycloak PostgreSQL database,
   NPM database, and SNI configuration; document restore commands.
2. Deploy Keycloak/PostgreSQL privately and pass health checks.
3. Configure realm, SMTP, public client, exact redirects, PKCE, and audience mapping.
4. Publish the auth hostname through NPM and verify discovery/JWKS endpoints over TLS.
5. Configure the browser while SpaceTimeDB remains in permissive development mode.
6. Register, verify, log in, refresh, reconnect, and capture the owner's resulting
   SpaceTimeDB identity. Establish owner membership through an audited path.
7. Back up SpaceTimeDB again, configure the authority issuer/audience allowlist, build,
   republish, and verify that anonymous clients are rejected.
8. Remove the public local-profile fallback and test from a clean browser profile.
9. Run the full acceptance matrix, then take a fresh auth/database backup.

If any step after authority enforcement fails, roll back the world module to permissive
development auth only while access is restricted at NPM; do not leave a public module
accepting anonymous clients as a silent long-term fallback.

## 7. Acceptance matrix

The implementing agent must report commands, sanitized results, and exact changed files
for all of the following:

- discovery document issuer exactly matches the configured issuer;
- JWKS fetch, certificate hostname/chain, NPM redirect, forwarded scheme, and origin
  checks pass;
- registration, verification email, login, logout, password reset, expired-token
  refresh, refresh failure, and administrator session revocation work;
- a clean browser reaches `/`, completes PKCE without a secret, returns to `/`, and
  reconnects to the same SpaceTimeDB `Identity`;
- a valid first-time identity is admitted as an audited `friend`; wrong issuer, wrong
  audience, anonymous, revoked, and blocked users are rejected by authority tests;
- two tabs for one identity preserve presence until the last connection closes;
- a second identity cannot read or mutate private inventory/progression;
- tokens, authorization codes, SMTP credentials, passwords, claims, and secrets do not
  appear in application/NPM/Keycloak logs, URLs, Git, screenshots, or client errors;
- `npm run check`, world build/publish, a two-client smoke test, and restart/reconnect
  tests pass;
- PostgreSQL and realm backups restore successfully into an isolated test stack.

## 8. Definition of done

Auth is complete only when the public game has no anonymous/local-profile path, account
recovery works, the world rejects invalid JWTs at connection time and again at sensitive
reducers, the owner cannot be locked out by a routine restart, automated backups exist,
and the acceptance evidence is recorded. Update this document, [09-auth.md](09-auth.md),
the roadmap, and `DECISIONS.md` with the final provider/version, issuer, client IDs,
identity-migration decision, and backup/restore location.

## 9. Primary references

- [SpaceTimeDB authentication](https://spacetimedb.com/docs/core-concepts/authentication/)
- [SpaceTimeDB auth claims and issuer/audience checks](https://spacetimedb.com/docs/core-concepts/authentication/usage/)
- [Keycloak production containers](https://www.keycloak.org/server/containers)
- [Keycloak production configuration](https://www.keycloak.org/server/configuration-production)
- [Keycloak reverse-proxy requirements](https://www.keycloak.org/server/reverseproxy)
- [Keycloak server administration](https://www.keycloak.org/docs/latest/server_admin/)

## 10. Implementation and acceptance evidence (2026-08-25)

Deployed implementation:

- Keycloak 26.7.2 is pinned to `sha256:eb81d22b…cfab`; PostgreSQL
  17.11-alpine3.24 is pinned to `sha256:7456ef82…73aee`. Keycloak runs an optimized
  production image with a read-only root filesystem; PostgreSQL has no published port.
- Keycloak is healthy on private TLS `10.0.1.150:8443`. `DOCKER-USER` permits only the
  NPM host `10.0.1.248` to that published port. The database and management listener
  remain internal. The public issuer is exactly
  `https://auth.orchard.dastari.net/realms/orchard`.
- NPM proxy host 32 uses certificate 42, HTTP/2, forced HTTPS/HSTS, caching disabled,
  verified TLS to the private CA, exact forwarded host/port/proto, and a reviewed log
  format containing `$uri` rather than query strings. HAProxy SNI and NPM SQLite were
  backed up before the change and both configurations validated before reload.
- Realm `orchard` and public client `orchard-web` use authorization code + S256 PKCE,
  exact redirect/origin, no client secret, no implicit/password grant, bounded sessions,
  refresh rotation, audience mapping, verified email, recovery mail, brute-force
  protection, registration, and database-backed realm/admin event retention.
- Keycloak console event logging is suppressed while database event auditing remains
  enabled because failed account-console events can include complete redirect URIs.
  The old container log was rotated; a harmless authorization-marker probe and the
  deployment secret scanner both pass.
- Named master-realm administrators `toby` and `toby-recovery` are enabled with the
  master `admin` role and no pending required actions. The bootstrap administrator and
  both temporary-password files were removed only after the two-admin guard passed.
- The browser discovers standard OIDC endpoints, validates the exact issuer/client,
  requires `azp` for multiple audiences, verifies RS256 ID-token signatures from JWKS,
  removes callback parameters before asset/network work, uses session storage, rotates
  refresh tokens, revokes them at sign-out, and performs provider logout without putting
  an ID token in the logout URL. `VITE_ENABLE_LOCAL_PROFILES=false` is live; an explicit
  public `?slot=Alice` probe remains on the account screen and does not load the world.
- The world uses the canonical Keycloak issuer and implements private membership and
  audit tables, audited automatic `friend` admission for valid new identities,
  owner/moderator management, blocked/revoked checks, last-owner lockout protection,
  immediate presence removal, and repeated authorization checks in every client
  reducer. `OIDC_CLIENT_IDS=['orchard-web']`; the exact captured owner
  identity `c20058849873441b3f59477e064818ce70ab5d3646ba5de1e6231b7278aaa291`
  is bootstrapped and has connected successfully under enforcement.
- Keycloak account administration and game administration are separate. The game owner
  receives a caller-filtered membership projection and alone sees date/time/weather
  controls. Owner-only reducers persist `world_environment`, every client renders the
  same state, and changes are recorded in private `world_admin_audit` rows.

Sanitized acceptance results:

| Check | Result |
|---|---|
| Pre-change and enforcement backups | Pass; repository/worktree plus quiesced `.spacetime-data` SHA-256 backups exist locally and at `//10.0.1.190/backups/orchard` |
| Provider health and private discovery | Pass; both containers healthy and private discovery has the exact issuer/endpoints |
| Public edge | Pass; discovery, JWKS, redirect, hostname/chain, exact origin and upstream TLS verification; public certificate expires 2026-11-22 |
| Registration and account mail | Pass by owner confirmation; verification and password-action/recovery mail arrived and the actions reported success |
| Owner login and authority gate | Pass; the exact Keycloak-derived identity connected, bootstrapped `owner`, reconnected through repeated world publishes, and local/wrong-issuer CLI identity was rejected |
| Open player registration | Pass; a second production OIDC identity previously rejected as `membership_required` was automatically admitted as an audited `friend`, reconnected after a quiesced backup/restart, and retained its membership |
| Browser and policy tests | Pass; issuer/audience/`azp`/nonce/expiry/session rules plus first-login friend admission, missing/wrong issuer/audience, revoked, blocked, role, and owner-world-control policy |
| Clean-browser/local fallback | Pass; clean profile shows OIDC account UI; `?slot=Alice` cannot load the overworld; production build retains strict style CSP |
| Isolated two-client smoke | Pass; distinct/reconnect identity, two-tab presence, last-tab removal, private-read and cross-identity mutation isolation, and spoof rejection |
| Repository gate | Pass; `npm run check`: world build, all typechecks, lint, 51 test files/253 tests, and 119-asset validation |
| Log/secret scan | Pass after removing one expired authorization code from a failed redirect log and disabling only console event duplication; no credentials, JWTs, codes, or tracked secrets detected |
| PostgreSQL/realm restore | Pass from a newly downloaded encrypted NAS copy in isolated PostgreSQL + Keycloak containers, including realm/client rows, health and discovery |
| Automated off-machine backup | Pass; systemd oneshot completed encrypted SMB upload/download hash verification and 30-day retention; timer enabled/active |

Still requiring a deliberate manual acceptance session before this document may be
marked fully complete: logout followed by login, forced token-expiry refresh and refresh
failure, administrator session revocation, two simultaneous production OIDC tabs, and a
second production OIDC identity exercising live revoke/block and private-state
isolation. Automatic friend admission and restart persistence now pass in production;
the remaining corresponding unit and isolated-smoke paths pass, but they are not yet
represented here as live production evidence.

## 11. Orchard account-theme rollout (2026-08-26)

The account flow now feels continuous with the canvas UI without moving credential
entry into game code. The account screen has distinct Sign In, Create Account, and
Recover Account actions. Each retains Authorization Code + S256 PKCE, state, nonce,
the exact callback, and the canonical issuer. Registration uses the OIDC
`prompt=create` standard; recovery uses Keycloak's documented
`/forgot-credentials` authorization-flow path. The existing identity namespace and
every existing account remain unchanged.

The versioned `ops/orchard-auth/themes/orchard` theme extends Keycloak 26.7.2's
`keycloak.v2` login theme and bundled email theme. It overrides presentation and
messages only, contains no JavaScript, and is mounted read-only. Small derived button,
panel, ribbon, and UI-font resources are built reproducibly from the ignored licensed
Cute Fantasy pack for use by this project. The complete source sheets remain excluded. The realm selects
`orchard` for `loginTheme` and
`emailTheme`; the redacted disaster-recovery realm now records those settings and the
already-live open-registration state.

Rollout evidence:

- Before the live change, `bin/backup.sh` produced database, restore-list, redacted
  realm, and deployment-configuration artifacts. Every file was SHA-256 verified
  locally, uploaded over encrypted SMB, downloaded again, and verified at
  `20260825T224029Z`. Future backups include the deployment scripts and theme without
  including `.env`, SMB credentials, or TLS private keys.
- With all Keycloak nodes stopped, the supported `bootstrap-admin user` maintenance
  command created one random in-memory administrator. It selected both realm themes,
  confirmed registration, verified email, and recovery remained enabled, deleted that
  administrator, verified its database row was absent, and restarted Keycloak to clear
  its temporary CLI session. The named administrators were untouched.
- Public discovery still reports the exact canonical issuer. Harmless PKCE probes
  reached themed sign-in, direct registration, and recovery pages; the Orchard CSS,
  panels, buttons, and banner all loaded. CSP retained `frame-ancestors 'self'`,
  Keycloak remained healthy after restart, and the credential/token/log secret scan
  passed.
- Client and tools TypeScript checks passed, as did the focused OIDC suite (5 tests),
  including all three supported entry paths. No live account was created, reset, or
  signed in during automated visual acceptance, so the earlier owner-confirmed mail
  and identity-migration evidence remains the applicable end-to-end credential proof.
- The final repository gate passed: world build, every workspace typecheck, lint, 78
  test files/471 tests with coverage, and validation of 488 art assets.
- After all checks, the complete themed state was backed up again at
  `20260825T225600Z`; database, realm, deployment configuration, and theme passed the
  same encrypted SMB upload/download hash-verification gate. That database dump then
  passed the isolated PostgreSQL restore, realm/client-row, Keycloak health, and
  canonical-discovery test.
- The first visual follow-up replaced vertically stretched frame backgrounds with
  native-proportion ribbon art and true nine-slice wood/parchment borders, collapsed
  Keycloak's nested footer into the shared panel, restored the licensed project UI
  typeface, and tightened the sign-in, registration, and recovery layouts. All three
  templates fit without horizontal overflow in the automated desktop layout check.
  The refined deployment was backed up and NAS round-trip verified at
  `20260825T232733Z`.
- The next UI follow-up constrains the primary provider action to a 220-pixel
  nine-slice button, removes the rectangular color showing behind its transparent
  corners, and increases title, label, input, action, and helper typography. It also
  fixes the authenticated account panel's missing Enter-the-Orchard pointer action and
  forces a clean root reload after a callback. Pure hit-area tests cover Enter, Sign
  Out, Sign In, Register, and Recover; a browser callback-state simulation moved from
  the signed-in panel to the shared overworld without a manual refresh. Public edge,
  secret-scan, and health checks passed, and the resulting deployment backup completed
  the encrypted NAS round-trip at `20260826T001935Z`.
