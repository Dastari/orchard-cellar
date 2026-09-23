# Wave 1 integration rehearsal

Status: every per-stage type/lint/world/Studio gate passed; final combined build/check running, 2026-09-23. Owner coordinator BrownHorizon will perform
GitHub merges only after every source PR is ready and its CI is green. This
throwaway branch must never be merged into main or deployed.

Requested order: #62 → #64 → #66 → #67 → #65 → #70 → #68 → #73 → #69 → #72 → #71;
design #63 can enter anywhere. Base: origin/main `2e1d9a4f`.

Each stage runs repository typecheck/lint, world build and guarded Studio
production build before advancing. The final integrated tree also runs full
coverage/exhaustive tests and the remaining check gates. All fixes must land on
source branches, with comments and coordinator notification.

## Stage evidence

| PR | Source head | Merge result | Validation |
| --- | --- | --- | --- |
| #62 | 98732c7e | Clean | Types/lint/world/Studio pass |
| #64 | c182c913 | Clean | Types/lint/world/Studio pass |
| #66 | e667565b | Source branch merged #62/#64; preserved native frames + exact parts/imports | Types/lint/world/Studio pass; 27 focused tests pass, 1 optional skip |
| #67 | ea0effd3 | Clean; source controller colour exception removed | Types/lint/world/Studio pass; 16 focused tests |
| #65 | 0794ab6b | Clean | Types/lint/world/Studio pass |
| #70 | 80d4a932 | Source dependencies merged; field generator optional-never + lab layout repairs | Types/lint/world/Studio pass; 13 focused tests |
| #68 | 37a7415a | Source access import/version conflicts resolved; kit Membership retained | Types/lint/world/Studio pass; 45 focused tests |

| #73 | 052f23e1 | Source version/docs conflicts; 14 reviewed cliff hashes + F1 regen; measured payload budget | Types/lint/world/Studio pass; 110 focused + budget test |
| #69 | 785784e8 | Clean | Types/lint/world/Studio pass |
| #72 | b4780767 | Source PWA conflict resolved: immutable packs retained, obsolete MP3 prefix removed | Types/lint/world/Studio pass; 20 focused tests |
| #71 | 37dc1917 | Source version/docs reconciliation; typed cell-part adapter + shared medium contract | Types/lint/world/Studio pass; 19 focused tests |

## Required integration checks

- Keep F1 schema generation current with object-state and catalogue definitions.
- Preserve F1/F6 explicit UI-kit exports under the narrowed Studio entry point.
- Remove the temporary editor colour allowlist after tokenizing ownership colours.
- Reconcile asset-pack and music PWA changes.
- Preserve higher package versions, all dependencies and all changelog entries.
- Refresh cliff goldens only for intended #62 behavior changes.
- Keep D6 medium separate from legacy walking/boat layers. No runtime switch.

## Release order

No rehearsal artifacts may be deployed. Once BrownHorizon merges approved source
PRs and verifies main, the publishing agent must follow
`ops/orchard-runtime/PUBLISHING.md`: world module first for #66’s parser and #68’s additive private schema,
then guarded Studio/game builds from reviewed main, matching content/assets and
any migration preflight required by the source PRs. Specific release details and
remaining gates will be finalized after the integrated checks.

Scope classification: #68 adds stored private tables, so wave-one world release
requires the guarded schema-only migration lane (`WORLD_RELEASE_MIGRATION_KIND=
schema-only`) after actual deployed/candidate full-schema comparison. Keep
`--delete-data=never`, backup/restoration rehearsal, populated-data parity and
validated same-identity reconnect evidence. Deploy the module/parser before
publishing #73 catalogue content or optional #65 components; capture and review
a live content-head candidate rather than replacing it with bootstrap data.
Retain #72 immutable dependencies across static releases and keep packs opt-in.
The chunk materializer remains offline; do not publish chunk heads or switch
runtime subscriptions in this wave. #69 music removes tracked MP3 files and
requires generated tracker songs in matching assets.

## Final candidate validation

Design #63 at `bda18bf2` merged cleanly after the implementation stages.
All source fixes are pushed to their original PR branches; the rehearsal contains
only merge commits and this evidence document beyond those source changes.

- Chunk standalone D6 source: 5,947 coverage tests / 964 files, all thresholds
  met; 101 exhaustive tests / seven files passed.
- Final combined `npm run build` and `npm run check`: running; not yet a pass.
- CI: source #62/#64/#65/#69 green at the latest scan; changed source heads
  rerunning/queued. #73 remains draft until integrated full validation passes.
- Merge order remains the requested order above. Source branches carry their
  predecessors where conflicts needed resolution; merge earlier PRs first so
  later diffs narrow to their own feature. Do not merge the rehearsal PR.
