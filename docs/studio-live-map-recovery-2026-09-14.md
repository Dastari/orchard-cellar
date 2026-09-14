# Studio live-map recovery — 2026-09-14

Studio's reviewed canvas shell started in an offline sandbox and offered no live
connection action. Only the immediate OIDC callback connected; ordinary visits and
reloads showed the original map. The shell now exposes Connect live, distinguishes
OFFLINE SANDBOX from LIVE MAP R5, and restores an existing exact-origin Studio
session without starting an unsolicited sign-in redirect.

A second issue rejected the actual published map: parsing the older document adds
newer authored landmark roles, changing its calculated hash from `38ce9f5e` to
`2ace7cae`. Studio now verifies the original published canonical representation
before parsing and checks map identity and revision afterward. It still rejects
tampering, and retains existing local-draft conflict protection.

The authenticated server query confirms `live-island`, revision 5, hash `38ce9f5e`.
The published document passes the new verifier with 40,665 cells, 616 objects and
60 prefabs. Four focused test files / 42 tests pass, including session restoration,
live-head reconciliation, conflict handling and tamper rejection. Guarded Studio
typecheck, production build, and local/public static validation pass.

Reviewed source commit: `38c9f1d8485cf89130ea9a0a84991db1caaf6a71` on
`archive/reviewed-studio-20260914`. Active bundle: `/assets/index-CqAPCVNQ.js`.
Build and source manifests:
`/home/toby/.local/state/orchard-release/studio-map-20260914/work-v5`.
Previous static artifact:
`/home/toby/.local/state/orchard-release/studio-map-20260914/before-dist`.
The original reviewed source directory remains the deployment source. The main
checkout's UI-kit guard is unchanged. No game artifact, world module, content head,
map document or player data was published by this Studio-only recovery.

The signed-in browser reached LIVE MAP R5 with the first connection fix and
reproduced the parser conflict. Final visual confirmation after the parser fix is
pending: the shared preview reports its document hidden and pauses drawing.
