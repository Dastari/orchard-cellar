# F1 — Content schema forms

Implements doc 62 §3.1 F1 (PR #63). Author tools must edit optional fields,
arrays, tuples, discriminated variants, enums and typed references without JSON.
JSON remains the advanced escape hatch; parser validation remains authoritative.

## Design decision

Generate field schemas from the existing TypeScript definition types, including
literal unions, template-literal reference IDs, tuple positions and property
comments. This avoids a second manually maintained catalogue and avoids changing
runtime parsing semantics. `scripts/generate-content-field-schemas.ts --check`
rejects stale generated schemas. Bootstrap parity tests check both parser and
structural schema; semantic bounds remain parser-owned and errors stay visible.
A schema graph uses named references to support recursive behaviour expressions.
No compiler package is shipped to the browser.

## Contract and acceptance

The kit receives a schema graph, a draft value and reference choices. It owns
form editing and exposes a complete value on Apply; hosts validate through their
existing model before publishing. Read-only fields cannot mutate drafts. Optional
fields can be added/removed; arrays can be added/removed/reordered; tuple lengths
are fixed. Enum and variant selection offer only type-declared choices. Reference
choices are filtered by kind and allow navigation with a preview when artwork is
available. Reverse references record source ID and field path.

Invalid JSON keeps the previous draft untouched. Invalid numeric input prevents
Apply with a field error. Parser or model errors remain in the form and do not
publish. Recursive structures are expanded only for existing values or explicit
Add actions. Unknown references remain visible for repair.

Items, Narrative and World Tables consume the same kit form. New item and recipe
actions create local drafts using unique IDs and existing parser validation.
Navigation selects a referenced definition in its owning tool; author navigation
never publishes content. Tests cover structural schema/parser bootstrap parity,
empty arrays, optional fields, enum/union changes, tuples, read-only behaviour,
reference filtering/navigation and reverse references.

## Implementation and integration handoff

The public parser module exports `CONTENT_FIELD_SCHEMAS`, `contentFieldErrors`,
`contentFieldDefault`, `contentFieldVariant` and `contentReferenceIndex`. Schemas
retain parser-type JSDoc and units for explicitly suffixed numeric fields. Runtime
bigint alternatives are omitted from JSON authoring unions. References are derived
from typed namespaced IDs; untyped engine identifiers remain text fields.

World Tables provides the typed-form fallback for `object`, `frame`, `tileset`,
`loot`, `loadout`, `enemy`, `encounter` and `balance`, so reference navigation opens
the intended definition even before those specialized tools gain selectors.
`item.new` and `recipe.new` are queued by the command palette and consumed once;
visible New buttons use the same model operation. Creation remains a local draft.

The kit exposes `ui.schemaForm`, `ui.arrayEditor`, `ui.referencePicker`, `ui.usedBy`
and explicit named exports from `@orchard/ui/studio`. Keep those named exports
when integrating the narrower Studio barrel from PR #67. Regenerate schemas after
merging new content types (including the object-state and rule-catalogue lanes).
Concurrent version changes must be reconciled during integration.

Validation: all 25 kinds / 919 bootstrap definitions pass schema/parser parity;
67 focused tests and all 546 lab tests pass, including nine viewport/scale combinations
per specimen, keyboard activation and the new pixel hash. Repository typecheck,
lint, content validation and the guarded Studio production-mode build pass.
Playwright rendered the exported specimen locally with kit art at scales 1 and 2.
No authenticated live write, merge or deployment was performed.

Integration verification: schema generation covers object-archetype states, growth
and transition alternatives from #65. Optional `never` keys are excluded from each
variant instead of offered as editable fields. The schema specimen is placed
after data controls so the forms district does not overlap the patterns heading;
`lab/placement.test.ts` checks this boundary. Explicit F1 exports remain under
#67’s narrowed Studio entry point.
