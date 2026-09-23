# F3 lifecycle hooks specification

Status: implementation; Wave 2, stacked on permission scopes #68 and state contracts #65.

## Objective and scope

Extend reviewed warm-built TypeScript beyond item `onUse`. Keep v1 item source and generated artifacts byte-compatible. Add v2 object spawn/interact/break/state enter/state exit and transition callbacks, NPC spawn/despawn/interact, dialogue choices, quest state changes and explicit action-objective progress. Encounter start/end names are reserved for a future encounter authority adapter and rejected as executable hooks today.

Graphs remain the default. Callback references in object transitions resolve by id and owning definition; arbitrary callback ids cannot invoke another definition's code. Existing external object events and state changes invoke matching transition callbacks. Timed/growth settlement remains the existing pure #65 contract; its returned firings can resolve callbacks through the same helper, without introducing a per-tick sweep or changing persistence.

## Contract and bounds

`orchard-lifecycle-source-v2`, engine API 2: bundle id, positive revision, 0–512 handlers sorted by id. Each handler has id, full definitionId, kind, hook and LF-only source up to 16 KiB. Allowed kind/hook pairs are exhaustive. Generated modules use hook-specific event types and a read-only snapshot; only emit/block/pass capabilities are exposed. AST and type checks reject unbounded or nested loops, dynamic code/imports, mutation, exception interception, arbitrary calls, type assertions, interpolated/concatenated string expansion and bigint operations other than addition/subtraction. Each callback and combined event retain the 64-effect cap; world reducer callback invocations share a 32-call limit. Failures reject and roll back the reducer.

## Decision record: trusted runtime approval

Date: 2026-09-23. Status: accepted for implementation under F3/A2.

Use a separate v2 compiler path and exact-source SHA-256 approval from #68's private `studio_script_review` row. The installed nonempty bundle runs only when its exact digest has a timestamped approval from someone other than its author. Missing approval blocks matching callbacks. The deterministic compiler/integrity output is provenance, not authorization. An approval JSON file carried alongside build output was rejected because it is forgeable; overloading v1 was rejected because it would alter deployed item artifact hashes. Trade-off: the approval row must exist in the target database before approved callbacks can execute. Review grants remain governed by #68; revoking a grant does not retroactively invalidate completed approvals.

## Build, audit and release

CLI verify/build dispatches by source format. Integrity validates both checked-in bundles and all generated outputs. The default v2 bundle has no callbacks and changes no gameplay. Successful invocations with effects are recorded with source hash, callback id, event and effect count in the existing private world admin audit. Rejected transactions use the reducer failure reason (transactional audit writes roll back too).

Apply #68 additive schema first, submit the exact v2 digest through `submitStudioScript`, and have a different scoped editor use `approveStudioScript`. Build and integrity-check reviewed source, then use the existing guarded world release pipeline. No dynamic loading, new schema, merge or deploy is part of this task.

## Validation and errors

Tests must cover every source kind/hook pair, malformed/oversized input, deterministic compilation, forbidden AST and wrapper escape, matching/mismatching definitions, state and transition routing, effect/call caps, exact hash approval and separation of author/approver. Typecheck generated callbacks; run focused reducer/graph tests, lint, world build and integrity. Missing refs, unsupported hook/API, invalid TypeScript, unapproved hash and limits fail closed. Existing v1 golden output must remain unchanged.

## Authoring example and handoff

A minimal candidate uses `format: "orchard-lifecycle-source-v2"`, `bundleId: "world-hooks"`, `revision: 2`, `engineApiVersion: 2`, and a sorted `handlers` array, for example:

```json
{
  "id": "object.chest.opened",
  "definitionId": "object:chest",
  "kind": "object",
  "hook": "onStateEnter",
  "source": "if (context.event.to.open === true) context.emit({ setLight: { enabled: true } });"
}
```

Use `npm run lifecycle:verify -- /absolute/source.json` to obtain the review digest and typecheck the hook-specific API. `npm run lifecycle:build -- /absolute/source.json /absolute/output` emits `lifecycle-hooks.ts`, `lifecycle-hook-metadata.json` and `build-provenance.json`. Install reviewed outputs under `packages/lifecycle-authoring/generated/hooks` alongside the corresponding checked-in source. Run `npm run lifecycle:integrity` before the guarded build/release. Approval of one digest never authorizes an edited source bundle.

`onInteract` maps to the authoritative `use` event. Quest/dialogue source definition ids are full content ids; runtime unprefixed ids are normalized for matching. `onObjective` reports admitted explicit action-objective increments; derived inventory/location/statistic objectives still use the existing quest-state completion notifications. NPC system hooks inherit their existing effect restrictions. No actor-only inventory capability becomes available to a system event.

Object event transitions resolve the first matching external transition in declaration order; state entry/exit hooks match crossing the declared state predicate. Their `run.callback` must bind an `onTransition` callback on the same definition; `run.graph` uses the existing bounded graph compiler. Pure lazy timed/growth settlement exposes its firing references through `transitionCallbackEvent`; durable timer/growth settlement integration is still a later adapter. Encounter hooks cannot be compiled until that event authority exists. These boundaries are explicit and do not claim full timed-object or encounter execution.

Validation checkpoint: 399 lifecycle/sim/world tests in 72 files, plus 12 targeted adapter/integrity tests passed. World build and 919-definition content validation passed. Final workspace checks and PR details are recorded below when complete. Nothing has been merged or deployed.

Final local checks: workspace typecheck, lint, world build, guarded Studio production build, lifecycle integrity (v1 + v2), schema regeneration check, 919-definition content validation, 399-test broader lifecycle suite, 26 focused compiler/adapter/schema/integrity tests and 21 follow-up hook/reference tests pass. Full `npm test` is running separately; no completion claim is made until its final summary is available. Build warnings are the existing terrain module cycle and Studio chunk-size notices. An initial local validation run was discarded after correcting a package metadata editing error and generating required local assets; it is not counted as successful evidence.

Review hardening: 16 compiler tests also pass after rejecting string doubling, bigint shifts and type-assertion bypasses. Candidate PR: https://github.com/Dastari/orchard-cellar/pull/78 (stacked on #68).
