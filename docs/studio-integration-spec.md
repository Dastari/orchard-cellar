# Reviewed Studio integration

Status: implementation authorized by the owner on 2026-09-21.

## Objective

Make this repository the single editable source for the reviewed Cellar Studio,
sharing current assets, content, authentication, simulation and bindings while
retaining Studio's own build, origin, authentication client and systemd service.

## Scope and invariants

- Integrate the reviewed UI kit, Studio tools and required adapters from the
  external source snapshot; preserve current game UI and shared runtime behavior.
- Keep the reviewed UI prebuild guard effective. A normal Studio production build
  must pass it without referring to an external source directory.
- Replace the two-source release overlay with staging from this repository only.
- Build Studio independently with studio-production; no game/world deployment,
  authored-content publication or database changes.
- Preserve live Studio auth, map hash verification, draft conflict protection,
  shared terrain workers, UI Lab and all existing authoring/admin tools.
- Publish a reviewable PR without merging it. Keep a verified rollback before
  stopping Studio, replace only Studio output, restart and verify the public URL.
- Archive the external source snapshot before removing it. Remove only verified
  obsolete, clean worktrees; retain active PR work and unique/uncommitted work.

## Implementation sequence

1. Record source/service baseline, rollback archive and independent review.
2. Integrate kit/Studio sources without overwriting newer shared gameplay code;
   resolve public exports and adapters explicitly.
3. Update standalone and coordinated Studio build paths, regression checks,
   package versions, operator docs and agent source guidance.
4. Run workspace typechecks/lint, meaningful Studio/kit/release tests and the full
   required suite, asset validation, independent Studio and game build checks.
5. Commit/push/open PR; install integrated source in the canonical repository
   without losing unrelated branch work, stop Studio for the artifact switch,
   restart and verify static headers, bundle identity, browser shell/tool rendering
   and same-origin API connectivity.
6. Retire the external source and verified obsolete worktrees; record all retained
   work and rollback locations in the handoff.

## Failure handling and success

A failed build never replaces live output. A failed public restart restores the
checked previous Studio artifact. Source differences and unmerged work must never
be discarded to force integration or cleanup. Authenticated checks depend on a
usable existing browser session and must not be claimed from anonymous checks.
Success is a self-contained Git source tree, independent Studio build and running
public service, preserved game artifact/service, no active external-source path,
passing checks, a PR, and a precise cleanup/rollback ledger.
