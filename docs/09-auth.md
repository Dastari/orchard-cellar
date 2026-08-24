# 09 — Auth: Accounts, Login & Sessions

Binding auth design. Assumes the stack in [01-engine-decision.md](01-engine-decision.md) and
[02-architecture.md](02-architecture.md): Fastify HTTP + `ws`, SQLite + Drizzle
(`users` / `sessions` tables are defined in [08-database.md](08-database.md) — do not
redefine them here or elsewhere). All auth code lives in `packages/server/src/auth/`.
The login/register UI is the in-canvas `LoginScene` ([13-ui-ux.md](13-ui-ux.md)) calling
the JSON endpoints below; there is no DOM form. Deployment is single-node behind an
HTTPS reverse proxy (Caddy/nginx) — the Node process never terminates TLS itself.

## 1. Account model

An account is **email + password + display name** (the farmer name shown to visitors).

- **Password hashing**: Argon2id via `@node-rs/argon2` with exactly
  `{ memoryCost: 19456, timeCost: 2, parallelism: 1 }` (OWASP baseline, ~19 MiB).
  These parameters are constants in `auth/hashing.ts`; changing them later is fine —
  verify still works on old hashes, and rehash-on-login upgrades them lazily.
- **No email verification at launch.** We deliberately take no SMTP dependency.
  Emails are stored lowercased/trimmed and used only as the login identifier.
- **Recovery codes instead of email reset**: at registration the server generates
  **8 one-time recovery codes** (each 10 chars from a 32-char unambiguous alphabet,
  formatted `XXXXX-XXXXX`, from `crypto.randomBytes`). They are shown **exactly once**
  in the LoginScene post-register screen ("write these down") and stored only as
  SHA-256 hashes in `recovery_codes` (see 08). Each code resets the password once,
  then is deleted. Using a recovery code invalidates **all** sessions.
- **SMTP upgrade path** (later, do not build now): add `email_verified_at` to `users`,
  an outbound-mail module behind an interface, verification-link and reset-link flows.
  Recovery codes remain valid as a fallback; nothing in this doc's flows changes shape.

## 2. Sessions

Server-side opaque sessions. No JWTs — revocation must be instant and single-node
SQLite makes lookups free.

| Property | Value |
|---|---|
| Token | 32 random bytes (`crypto.randomBytes(32)`), base64url — 256 bits |
| Storage | Only `sha256(token)` in `sessions.token_hash`; raw token never persisted or logged |
| Cookie | `oc_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` |
| Expiry | **30-day sliding**: any authenticated request seen >24 h after `last_seen_at` bumps `last_seen_at` and re-sets the cookie (write-throttled so we don't touch SQLite per request) |
| Logout | Deletes that session row, clears the cookie |
| Log out everywhere | Deletes **all** the user's session rows |
| Cleanup | Hourly sweep deletes rows with `last_seen_at` older than 30 days |

Login **always creates a new session token** (never reuses one present on the request)
— this is the session-fixation defence; test it (§8). `Secure` is set unconditionally;
local dev runs behind Vite's proxy on `localhost`, which browsers treat as trustworthy.

## 3. WebSocket authentication

The WS endpoint is same-origin (`wss://<host>/ws`), so the browser sends `oc_session`
on the upgrade request automatically. In the `ws` server's `handleUpgrade` path:

1. Parse `oc_session` from the upgrade request's `Cookie` header.
2. Look up `sha256(token)` in `sessions`; require not expired.
3. On failure: respond `401` and destroy the socket **before** upgrading.
4. On success: attach `{ userId, sessionId }` to the connection context used by the
   message router (`server/src/ws/`).

**Mid-play expiry / revocation** (logout-everywhere, password change, account delete):
the FarmRoom flushes a snapshot, the server sends `{t:'authExpired'}` and closes the
socket with code `4001`. On `authExpired` the client finishes any pending local save
notification and returns to `LoginScene`. The server also re-validates the session
whenever it sweeps expired sessions, so a revoked session dies within seconds, not on
next reconnect.

## 4. HTTP endpoints

All under `/api`, JSON in/out, validated with zod (§5). All responses use HTTP status
codes plus a typed body. Mutating endpoints require the `X-Requested-With` header (§5).

| Method & path | Auth | Purpose | Failure codes |
|---|---|---|---|
| `POST /api/register` | — | Create account, set session cookie, return recovery codes (only time ever) | `400` invalid, `409` generic (see §5 enumeration note) |
| `POST /api/login` | — | Verify credentials, rotate/set session cookie | `400`, `401` generic, `429` rate-limited |
| `POST /api/logout` | cookie | Delete current session, clear cookie | `401` |
| `POST /api/logout-all` | cookie | Delete all sessions for user, clear cookie | `401` |
| `POST /api/recover` | — | Email + recovery code + new password → reset, consume code, kill all sessions, set fresh cookie | `400`, `401` generic, `429` |
| `POST /api/change-password` | cookie | Current + new password; keeps current session, kills all others | `400`, `401` |
| `POST /api/delete-account` | cookie | Password confirm → soft-delete (§7) | `400`, `401` |
| `GET /api/me` | cookie | Who am I (drives Title→Login skip) | `401` |

Request/response types live in `packages/sim/src/protocol.ts` next to the game
protocol — one source of truth for both sides:

```ts
// packages/sim/src/protocol.ts (auth section)
export interface RegisterRequest { email: string; password: string; displayName: string }
export interface RegisterResponse { user: MeResponse; recoveryCodes: string[] } // shown once, never again

export interface LoginRequest { email: string; password: string }
export interface LoginResponse { user: MeResponse }

export interface RecoverRequest { email: string; recoveryCode: string; newPassword: string }
export interface RecoverResponse { user: MeResponse; recoveryCodesRemaining: number }

export interface ChangePasswordRequest { currentPassword: string; newPassword: string }
export interface DeleteAccountRequest { password: string }

export interface MeResponse { userId: string; email: string; displayName: string; farmId: string }

export interface ApiError { error: string }           // machine-readable code, e.g. 'invalid_credentials'
// Empty-body 200 for logout, logout-all, change-password, delete-account.
```

`ApiError.error` codes are stable identifiers (`invalid_credentials`, `rate_limited`,
`invalid_input`, `email_in_use_or_invalid`); the LoginScene maps them to bitmap-font
copy — never render server strings directly.

## 5. Security requirements (binding)

- **Rate limiting**: in-memory token buckets (no Redis — see 02 non-goals), keyed
  per-IP (`X-Forwarded-For` first hop, since we're behind the proxy) **and**
  per-account (lowercased email). `login` and `recover`: **10 attempts / 15 min**
  per key, refilling continuously; `register` and `delete-account`: 5 / 15 min per IP.
  Exceeding returns `429` with `{error:'rate_limited'}`. Buckets live in a `Map` with
  periodic pruning; losing them on restart is accepted.
- **Constant-time comparison**: session-token hashes and recovery-code hashes are
  compared with `crypto.timingSafeEqual` on equal-length buffers. Argon2 `verify` is
  inherently safe. Never `===` on secrets.
- **No username enumeration**: unknown email and wrong password both return
  `401 {error:'invalid_credentials'}` — same body, and run a dummy Argon2 verify on
  unknown email so timing matches. `register` on a taken email returns
  `409 {error:'email_in_use_or_invalid'}`; the client shows "If this email is
  unregistered, check your details and try again" — generic guidance, no confirmation.
  `recover` behaves identically for unknown email vs wrong code.
- **Password rules**: min **10** chars, max **128** (pre-hash cap), rejected if in the
  bundled top-1000 common-password list (`auth/common-passwords.txt`, checked
  lowercased). **No composition rules** — no forced digits/symbols/uppercase, ever.
- **CSRF stance**: `SameSite=Lax` cookie **plus** a required `X-Requested-With:
  orchard-cellar` header on every mutating endpoint (a non-simple header forces CORS
  preflight, which same-origin-only CORS config denies to third parties). We serve no
  cross-site embeds and have no GET side effects; this combination is sufficient — do
  not add token-based CSRF machinery.
- **Input validation**: every request body parsed by a zod schema at the Fastify
  boundary (schemas exported from `protocol.ts` alongside the types); parse failure →
  `400 {error:'invalid_input'}`. Unknown keys stripped.
- **Secure headers**: set via a Fastify `onSend` hook (no helmet dependency):
  `Content-Security-Policy: default-src 'self'; img-src 'self' data:` (canvas game —
  keep it strict), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(),
  geolocation=()`. HSTS is the reverse proxy's job.
- **Logging**: never log passwords, raw tokens, recovery codes, or full cookie
  headers. Log auth events as `{event, userId, ip}` only. Redaction is enforced by a
  serializer allowlist in the Fastify logger config, not by discipline.

## 6. Display names & farm names

Same rules for both (farm name defaults to `"<displayName>'s Farm"`, editable in-game):

- 3–20 chars; allowed charset: letters, digits, spaces, `'`, `-`. No leading/trailing
  space, no double spaces. This charset is a subset of the bitmap font
  ([10-art-style-guide.md](10-art-style-guide.md)), so anything stored renders.
- **Uniqueness NOT required** — `userId` is identity; names are labels. Never use a
  display name as a lookup key.
- Profanity filter: simple denylist file `auth/name-denylist.txt` (substring match on
  the lowercased, space-stripped name) → `400 {error:'invalid_input'}`. No external
  service, no cleverness; the list is editable in-repo.
- Names are shown to visitors: the charset restriction *is* the sanitization (no HTML
  path exists — everything renders through the bitmap font), but validate on write
  anyway so bad data never enters the DB.

## 7. Account lifecycle

- **Change password** (`/api/change-password`): requires current password; rehashes;
  deletes all sessions **except the current one**; sends `{t:'authExpired'}` on the
  user's other live WS connections.
- **Delete account** (`/api/delete-account`): requires password confirm. Sets
  `users.deleted_at = now` (soft delete), kills all sessions, closes WS. While
  soft-deleted: login is refused with the generic `invalid_credentials`, the farm is
  invisible to visitors. **7-day grace**: a recovery code + `/api/recover` within 7
  days clears `deleted_at` (un-deletes). A daily job hard-deletes accounts where
  `deleted_at` is >7 days old: user row, sessions, recovery codes, farm, and all
  snapshots ([08-database.md](08-database.md) cascade rules).

## 8. Testing checklist (implementing agents: turn each into a Vitest test)

- [ ] Register → login → `GET /api/me` round-trip; cookie present with `HttpOnly`,
      `Secure`, `SameSite=Lax`, `Path=/` (assert on the literal `set-cookie` header).
- [ ] **Session fixation**: token in the cookie after login differs from any
      pre-login cookie value; the old token no longer resolves.
- [ ] Logout deletes the row (subsequent `me` → 401); logout-all kills a second
      concurrent session too.
- [ ] Sliding expiry: with fake timers, a session used at day 29 survives day 31; an
      untouched session is rejected and swept after day 30.
- [ ] **Rate limiting with fake timers**: 10 failed logins → 11th is `429`; advancing
      15 min refills; per-account bucket trips across different IPs and vice versa.
- [ ] Enumeration: unknown-email and wrong-password responses are byte-identical;
      register-on-taken-email matches the invalid-email shape.
- [ ] Password rules: 9 chars rejected, 10 accepted, 129 rejected, `password123`
      (denylist) rejected; `Str0ng!` composition NOT required (a 10-char all-lowercase
      passphrase passes).
- [ ] Recovery: code works once, second use → 401; all sessions dead after use;
      remaining-codes count decrements.
- [ ] Mutating endpoint without `X-Requested-With` → 403.
- [ ] WS upgrade: no cookie / bad cookie → 401 before upgrade; valid cookie →
      `welcome`; deleting the session mid-connection produces `{t:'authExpired'}`
      then close `4001`.
- [ ] Soft delete: login refused during grace; recover within 7 days un-deletes;
      fake-timer advance past 7 days hard-deletes farm + snapshots.
- [ ] Grep-level test: no log line in the test run contains a raw token, password,
      or recovery code.
