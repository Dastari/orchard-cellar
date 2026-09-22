# Studio permission scopes (doc 62 F6)

## Specification

The authority checks content kinds and admin reducer families against explicit
scopes. Studio mirrors caller-private scope state. Active membership is always
required. Owner access cannot be removed through scope overrides.

Every current content kind has exactly one scope. Mixed change sets need every
scope, including deleted definitions and restores. Unknown kinds fail closed.
Explicit grants can be revoked; a revoked override denies the corresponding
legacy preset too. Grant changes record actor, target, reason and server time.

## Architecture decision: additive compatibility overlay

Accepted 2026-09-23. Keep existing membership, editor and support tables intact.
Resolve legacy access dynamically and overlay a private indexed scope table.
This requires no destructive migration or loss of grant provenance, and existing
revocations continue taking effect. Explicit scope grants authorize the complete
named domain; legacy support/moderator permissions retain their existing operation
and quantity caps. Existing content-editor grants do not gain live map publication
(the prior backend restricts it to owner/admin). New scripts scopes are opt-in.

Script submissions bind an immutable artifact SHA-256 to its authenticated author.
Approval requires scripts.approve and a different identity, and records a reason.
These records do not bypass the reviewed warm-build pipeline or deploy code.

## Validation and release

Tests cover complete kind mapping, blocked membership, legacy grant combinations,
override denial, mixed publishes/deletes/restores and separate script approval.
Regenerate bindings and deploy the additive world schema before a matching Studio
release. No production deployment is part of this PR. The schema must undergo a
populated-data release rehearsal under docs/08 before production publishing.

## API and compatibility details

`setStudioScope(identity, scope, granted, reason, clientMutationId, expectedVersion)`
uses `previewStudioScope` for server-generated previews and the version returned by
`adminStudioMembers` / `adminStudioScopes`. `studioScopeReceipt` returns the real
world audit ID. A repeated request ID with the same payload is a no-op; a changed
payload or stale version is rejected. Revoked overrides remain as deny records.
Delegates may grant only scopes they already hold; owners retain recovery access.
A scope manager does not gain permission to promote members to owner or admin.

`submitStudioScript` and `approveStudioScript` bind 64-character lowercase SHA-256
artifact identifiers to the caller and require a reason. `studioScriptReview`
returns the immutable author and approval identity/time to authorized authors or
approvers. The future scripting lane must bind these records to its exact bundle
and consume them in the reviewed build pipeline; these APIs alone do not execute
or publish scripts.

The compatibility overlay is the migration: no rows are backfilled or rewritten.
Legacy content, support and moderator operation limits still apply unless an
explicit operation-domain grant is issued. Domain grants intentionally authorize
the complete domain, so an explicit `operate.players` grant is broader than the
legacy capped support preset. Existing private read procedures retain their old
owner/admin restriction unless the caller has the explicit matching scope.

The shared policy lives in `packages/sim/src/studio-scopes.ts`; the world and
Studio import that same policy. New content kinds must add a mapping to its
exhaustive `Record<SupportedContentKind, StudioScope>` before they compile.

## Integration checkpoint (2026-09-23)

Authority, generated bindings, the shared policy, scope-aware routes, and the
Membership API/model are implemented. The final kit-only Membership controls and
operation-role presentation are prepared in a local patch but await the existing
exclusive `operate-canvas.ts` lease. This branch is not ready to merge until those
controls are integrated and checked.

Passed: repository typechecks, lint, world build, independent Studio production
build (reviewed UI-kit prebuild retained), and 297 focused regression tests across
61 files. The full `npm test` coverage/exhaustive run is still in progress. No world
or Studio deployment was performed.
