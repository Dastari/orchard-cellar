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
