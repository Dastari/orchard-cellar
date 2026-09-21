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
