# Cellar Studio

The independently deployed editor lives in this workspace. Its reviewed Canvas
kit is imported through `@orchard/ui/studio`; the game uses `@orchard/ui` and its
build rejects editor components and UI Lab in the emitted module graph.

From the repository root:

```sh
npm ci
npm run assets:build
npm run studio:build -- --mode studio-production
```

Studio prebuild checks the kit and prepares only Studio's public icon copy from
`packages/ui/public`. Source art/content remain shared in `packages/assets`.
The production configuration comes from ignored `.env.studio-production.local`.
No game build, world publish or content change is required for editor-only updates.

The live service is `orchard-studio.service`, serving `packages/studio/dist` on
port 5174 behind https://cellar.dastari.net/. For staging, rollback, installation
and validation, follow [the runtime runbook](../../ops/orchard-runtime/README.md).
Edit source in a Git branch and deliver through a PR; never edit live dist files.

Migration, validation and cleanup evidence: [integration handoff](../../docs/studio-integration-handoff.md).

## Map placement and selection

Choose **Smart placement** for one palette entry per connected family or terrain
material. Drawing a fence connects neighboring cells using shared rules. Choose
**Exact placement** to expose individual object and terrain pieces; exact terrain
pieces are Ground Details overlays. Assistance stays local to the edited area.

Select an object to tint its sprite and edit labelled position, orientation and
supported appearance/growth properties. New same-layer object overlap is rejected.
Right-click opens Delete; right-drag pans. Authored edits and resource state edits
remain undoable drafts until **Publish changes**. Functional live placeable/chest
controls retain the explicit audited Preview/Confirm action flow.

Stateful-object support in Studio 0.12.0 also changes the shared game renderer and
world map commit handler. Deploy this feature with the matching game/world code;
it is not a standalone editor release. The full database schema and generated
public bindings remain unchanged. See [the verification and release handoff](../../docs/studio-smart-placement-handoff.md).

## Multi-space data boundary (F4)

`StudioLiveAdapter.spaceRegistry()` returns admin-authorized static, homestead,
residence, cellar and active rogue metadata. `setMapViewport` accepts every u16
space id; player presence stays subscribed across spaces as viewports change.
`studioSpaceRef` separates `/build/map/space/<id>` from editable documents. These
routes show read-only metadata in this backend increment. The later World Map
canvas consumes `studioRuntimeSpaceTerrain` with verified live content and world
seed/version; this returns generator terrain, never a publishable map document.

`studioLivePickerSources` supplies spaces, paged players/entities and container
inspection through the existing shell connection. Entity queries accept inclusive
nonnegative tile bounds up to 16,384 tiles, limit 1–100, kind/text filters and an
opaque cursor. Keep fetching while `nextCursor` is non-null even if a filtered
page is empty; at most 2,048 source rows are read per request. The cursor binds to
the bounds and filters, so reset it whenever they change. Pages reflect live
state rather than a multi-call snapshot. Object Manager's `setQuery` lets the
visual lane provide the current area instead of a hard-coded negative box.

For container slot editing, use `ContainerManagerModel.inspect`, `setReason`,
`preview({ operation: 'set_container_slot', slot, stack })`, then `commit()`. This
uses the existing server dry-run/version/fingerprint authority; the picker does
not bypass it. The area-page and registry procedures require a world module
release before this Studio version is deployed. Generated bindings must be
regenerated after integrating other world procedure changes. Retired private
`farm_parcel` rows stay retired: active farms come from the homestead registry.
