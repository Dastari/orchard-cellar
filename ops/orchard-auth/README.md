# Orchard authentication deployment runbook

This directory is the reviewed, non-secret source for the CT 105 authentication
stack. Production files live at `/home/toby/services/orchard-auth`; its `.env`, TLS
private keys, database volume, live exports, and backups must never be copied into
Git.

## Immutable deployment inputs

- Keycloak `26.7.2`, released 2026-08-19, linux/amd64 manifest digest
  `sha256:eb81d22bb82bc358ee10bdd4ab15dea2caae0add01416a1b146e2c7c7eb9cfab`.
- PostgreSQL `17.11-alpine3.24`, linux/amd64 manifest digest
  `sha256:7456ef82e5f5bc43d997f4781bbd7c0d6389bff397564649a356e206ba473aee`.
- Issuer `https://auth.orchard.dastari.net/realms/orchard`.
- Public browser client `orchard-web`; no client secret.
- Private TLS listener `10.0.1.150:8443`; only NPM `10.0.1.248/32` and explicitly
  passed administrator CIDRs may cross `DOCKER-USER`.

Do not run `prepare-service.sh` or pull/start the stack until the owner has approved
these two image/version pins, the operational footprint, and the off-machine backup
destination. DNS, SMTP, NPM access, and the identity-migration choice are separate
hard gates.

## Rollout (keep this order)

1. Record the owner approvals and identity-migration decision in `DECISIONS.md`.
   Confirm `auth.orchard.dastari.net` resolves to the existing NPM edge and verify the
   NPM host key out of band before accepting it into `known_hosts`.
2. Take the repository and quiesced SpaceTimeDB backups. On NPM, locate the running
   NPM data mount rather than assuming it, then back up its SQLite database (including
   `-wal`/`-shm` after a SQLite online backup or quiesce) and
   `/etc/gema/haproxy/gema-web-sni.lst`. Record SHA-256 hashes and restore paths.
3. Run `bin/prepare-service.sh`. It generates 48-byte random database/bootstrap
   credentials, a private CA, a 3072-bit internal TLS key, and a PKCS#12 truststore.
   It prints no secrets. Confirm `.env`, `tls/*.key`, and the generated administrator
   password file (when present) are mode `0600`.
4. Run `sudo bin/firewall.sh` before starting Compose. Add administrator CIDRs only as
   explicit arguments. Start privately with `docker compose pull` and
   `docker compose pull postgres`, build the immutable Keycloak runtime with
   `docker compose build --pull keycloak`, and run `docker compose up -d`; pass
   `bin/verify.sh`, then run `bin/refresh-admin-truststore.sh` before any
   administrative CLI script.
5. Fill the SMTP fields in the mode-`0600` `.env`, run `bin/configure-smtp.sh`, then
   prove verification and password-reset delivery before leaving registration on.
   If either test fails, set `registrationAllowed=false` again immediately.
   Mount `themes/orchard` read-only as declared by Compose and select `orchard` for
   both the realm login and email themes. See `THEME.md`; theme changes never alter
   the canonical issuer or replace Keycloak's credential and OIDC forms.
6. Run `bin/create-named-admin.sh <username> <email>` for each of two named
   administrators. Sign in as each administrator, change its temporary password,
   verify both can reach the admin console, and delete the generated password file
   after each password change. Then run
   `bin/remove-bootstrap-admin.sh <first-username> <second-username>`. The guarded
   finalizer refuses to remove bootstrap unless both named accounts are enabled,
   have no pending password action, and hold the master `admin` role; the now-inert bootstrap
   environment values remain only so Compose can restart without rewriting the
   deployment.
7. On NPM, append `auth.orchard.dastari.net` to the SNI allowlist without changing
   existing entries. Validate the exact HAProxy configuration before the brief reload.
   Create the proxy host to `https://10.0.1.150:8443`, trust `tls/ca.crt`, disable
   caching, overwrite (do not append) `X-Forwarded-For`, `X-Forwarded-Host`,
   `X-Forwarded-Port`, and `X-Forwarded-Proto`, and enable WebSocket/HTTP2. Request a
   Let's Encrypt certificate and force HTTPS.
8. Configure Orchard's NPM host access log to use `$uri`, never `$request_uri`, so the
   transient OIDC authorization code is not logged. Add CSP, HSTS, `no-store` on auth
   responses, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
   Do not enable proxy caching for discovery, JWKS, authorization, token, or logout.
9. Run `bin/public-acceptance.sh`. Its expected output contains only pass/fail metadata
   and certificate expiry, never discovery claims or tokens.
10. Build the browser with the ignored `.env.local` while the SpaceTimeDB module still
    has an empty `OIDC_CLIENT_IDS`. Register/verify the owner, log in, refresh,
    reconnect, and capture the stable SpaceTimeDB identity. Do the same for the second
    acceptance identity if it will be approved before enforcement.
11. Back up SpaceTimeDB again. Put only the captured owner identity hex in
    `BOOTSTRAP_OWNER_IDENTITIES`, set `OIDC_CLIENT_IDS` to `['orchard-web']`, build and
    publish additively. The owner connects first and creates the audited owner row;
    the owner then calls `approve_member` for the already captured second identity.
    Never bootstrap or transfer ownership by email, username, or display name.
12. Prove anonymous/wrong-issuer/wrong-audience/unapproved/revoked/blocked rejection,
    role-checked membership audit, two-tab presence, and private-state isolation. Run
    `npm run check`, `npm run world:smoke` with OIDC test-user ID tokens supplied only
    through the process environment, restart/reconnect checks, and `bin/secret-scan.sh`.
13. Run `bin/backup.sh`, copy that completed directory to the approved off-machine
    destination, and run `bin/restore-test.sh` against the copied `keycloak.pgdump`.
    Install and enable the provided systemd timer only after the off-machine copy and
    retention policy are automated and monitored.

## NPM restore

If the auth proxy rollout fails, remove only the new proxy-host row through NPM or
restore the pre-change NPM SQLite backup while NPM is quiesced. Restore the exact SNI
backup, validate HAProxy, then reload it. Do not guess database paths, container names,
or HAProxy service names; record the discovered values in the acceptance evidence.

## Keycloak restore

`bin/restore-test.sh /approved/copy/keycloak.pgdump` creates uniquely named temporary
Docker resources, restores PostgreSQL, verifies the `orchard` realm and `orchard-web`
client rows, boots the pinned Keycloak image, and checks canonical discovery. Its trap
removes only those generated test containers/network/volume.

For a real restore, stop Keycloak, restore the custom-format dump into an empty pinned
PostgreSQL volume, start Keycloak, and run both verification scripts before routing
traffic. Never restore over the only live database.

## Authority rollback

If a post-enforcement check fails, republish the last backed-up module with empty
`OIDC_CLIENT_IDS` only after NPM restricts the game host to administrator sources.
Record the incident. This is a short maintenance state, never an anonymous public
fallback.
