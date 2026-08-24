# 24 — Self-Hosted OIDC Implementation Plan

Status: **approved direction, not implemented**. This document is the handoff contract
for the agent that deploys production account authentication on the `orchard` container.
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
- wrong issuer, wrong audience, anonymous, unapproved, revoked, and blocked users are
  rejected by authority tests;
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
