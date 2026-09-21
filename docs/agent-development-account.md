# Dedicated agent development account

The owner requested this reusable account on 2026-09-21 and manually verified its
email in Keycloak. The address has **no mailbox**; email recovery is unavailable.

- Account: `dev@orchard.dastari.net` (Orchard Agent).
- Realm: `orchard`; issuer: `https://auth.orchard.dastari.net/realms/orchard`.
- Game: `https://orchard.dastari.net/`; Studio: `https://cellar.dastari.net/`.
- Encrypted credential: `/home/toby/.local/state/orchard-agent/account.cred`.
- Encryption: user-scoped `systemd-creds`, host key, credential name
  `orchard-agent-account`. File mode is 0600; parent directory is 0700.
- Verification: password sign-in from encrypted storage succeeded on 2026-09-21.
  Character `OrchardAgent` was created through the normal game UI; the client
  reports connected, content ready, and no error.
- World identity:
  `c2008879d1c8357547804a5ef7f56c9315a31781d0875c6ca271977062f93dbe`.
- Permissions: friend membership plus **Content Editor** grant. The owner applied
  the grant in Studio on 2026-09-21; an authenticated `own_content_editor_grant`
  query verified this exact identity has an unrevoked grant. No Keycloak
  administration or world owner role was granted. Using this account does not
  authorize production releases or edits.

## Future agent use

Coordinate account/session ownership through Agent Mail. Use an isolated browser
profile and the normal OIDC flow. Do not sign another person out of their browser.
The initial local Playwright CLI session is `orchard-agent-account`, but it is
ephemeral: start a new session if it no longer exists.

On this machine, `/home/toby/.local/state/orchard-agent/fill-login.mjs <session>`
fills the canonical Keycloak email/password form from encrypted storage. Open the
game, select Sign in, and reach that form first. The helper checks the auth origin,
encrypts the form values to an ephemeral browser key, and returns only a boolean
result. Submit the form and confirm authenticated session presence without reading
tokens into tool output. It uses the Playwright skill's CLI wrapper.

The encrypted file is bound to this Linux user and machine. Do not copy it into
Git or assume it can be decrypted on another host. Never print its decrypted JSON,
password, OIDC tokens, browser cookies, or recovery links into chat, logs or docs.
Keep decrypted data in process memory. Release reconnect files are separate,
owner-private transient artifacts and retain single-writer refresh ownership.

For an authorized release, the local `capture-rejoin.mjs /dev/shm/new-file.json`
helper in the same credential directory encrypts the signed-in browser session
for local transfer, writes a mode-0600 reconnect file, clears browser session
storage, and navigates away to prevent competing refreshes. Read the helper
before use and validate the resulting file with the guarded refresh command in
`ops/orchard-runtime/PUBLISHING.md`. Refresh was verified on 2026-09-21. These
transient files must be removed after release verification.

## Password rotation

Because there is no mailbox, the owner must set a permanent password through
Keycloak's Credentials page (Temporary off). Then the owner runs:

```sh
python3 /home/toby/.local/state/orchard-agent/store-password.py
```

The hidden prompts encrypt directly to the same credential location without
echoing the password. Verify a fresh login after rotation. Do not ask for a
password or reset link in chat. The helper scripts are local operational files,
not application dependencies or plaintext credential stores.
