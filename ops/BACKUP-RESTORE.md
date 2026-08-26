# Orchard pre-auth backup and restore commands

The 2026-08-25 pre-change snapshot is permission-restricted at
`/home/toby/backups/orchard/2026-08-25-pre-oidc/`. It contains:

- `repository.bundle`: all committed refs;
- `worktree.patch`: tracked uncommitted changes as a binary patch;
- `worktree.tar.gz`: the working tree without Git, dependency/build, and coverage
  directories (it is mode `0600` because ignored local credentials may be present);
- `spacetime-data.tar.gz`: a quiesced copy of `.spacetime-data`.

The SHA-256 values printed at backup time are recorded in doc 24 acceptance evidence.
Re-run `sha256sum -c` from a separately stored manifest before restoring after any copy.

## Repository restore test

Restore into a new empty directory, never over the current checkout:

```bash
git clone /approved/backup/repository.bundle orchard-restore
git -C orchard-restore apply --check /approved/backup/worktree.patch
tar -C orchard-restore -xzf /approved/backup/worktree.tar.gz
npm ci --ignore-scripts
```

The tar archive is the full dirty-worktree recovery source; the patch is an independent
reviewable record of tracked changes. Keep both encrypted or on owner-only storage.

## SpaceTimeDB restore test

The archive was captured only after confirming no SpaceTimeDB process was running. For
a future production backup, discover and record the actual service manager first, stop
or quiesce it, and confirm the process has exited before archiving the data directory.

Restore into a new directory and bind a test-only loopback port:

```bash
install -d -m 0700 /srv/orchard-restore-test
tar -C /srv/orchard-restore-test -xzf /approved/backup/spacetime-data.tar.gz
spacetime start --listen-addr 127.0.0.1:3300 \
  --data-dir /srv/orchard-restore-test/.spacetime-data --non-interactive
```

In another shell, publish nothing and connect the two saved OIDC test identities to the
restored database through the test port. Verify identity, membership, private inventory,
world entities, positions, and clock before stopping the test host. Never point the
restore test at the live NPM route or overwrite the sole live data directory.

## Authentication and NPM

Keycloak/PostgreSQL isolated restore commands are implemented by
`orchard-auth/bin/restore-test.sh`; the NPM discovery, backup, and rollback procedure is
in `orchard-auth/README.md`. NPM paths and service/container names must be recorded from
the verified host rather than guessed.
