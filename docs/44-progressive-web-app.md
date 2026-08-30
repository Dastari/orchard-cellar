# Progressive Web App

Orchard & Cellar is installable as a Home Screen/web app while retaining the
same canvas gateway, loading frame, and game HUD used in a browser tab.

## Install contract

- `packages/client/public/manifest.webmanifest` owns the application identity,
  `/` scope, fullscreen preference, landscape/portrait support, theme colours,
  and standard plus maskable icons.
- iOS also receives an explicit Apple touch icon, standalone metadata, and
  portrait/landscape launch images. The launch art deliberately contains only
  the shared orchard sky/grass backdrop and the same apple emblem used by the
  in-canvas loading frame.
- Chromium browsers can use their normal Install action. On iOS/iPadOS, use the
  browser Share menu and **Add to Home Screen**.
- Installed mode does not bypass OIDC. Authentication remains in the secured
  popup flow and the installed client receives the resulting session normally.

## Update contract

Every production build emits a `service-worker.js` containing a unique build
revision. The worker downloads in the background but does **not** call
`skipWaiting()` by itself. This avoids replacing JavaScript while a player is
connected to a world whose client and generated bindings may belong to the
previous deployment.

The Escape menu exposes the lifecycle:

- **CHECK UPDATE** asks the registration to check immediately.
- **UPDATE** appears when a new worker is waiting.
- Pressing **UPDATE** sends `SKIP_WAITING`; the client reloads only after the new
  worker becomes the controller.
- A blocking in-game **UPDATE READY** prompt offers **REFRESH NOW** or **LATER**
  as soon as a waiting worker is observed. Dismissing it leaves **UPDATE** in the
  Escape menu for the remainder of the session.
- Visibility, reconnect, page-restore, and five-minute checks keep long-running
  installed sessions informed without forcing an update.
- If another open window activates the worker, the current live session still
  asks before reloading rather than silently replacing its client code.

The cache is intentionally limited to the same-origin application shell and
static art/audio. Navigation is network-first. Cross-origin OIDC traffic,
SpacetimeDB connections, WebSockets, mutations, and range requests are never
cached. Offline mode can reopen the visual client shell, but it does not claim
that the authoritative multiplayer world or sign-in service is available.

## Artwork generation

Run:

```sh
npm run pwa:assets
```

`packages/tools/src/build-pwa-assets.ts` reads `icon_resource_fruit` and the
canonical Orchard palette, then deterministically writes:

- 180, 192, and 512 pixel application icons;
- safe-zone maskable icons for Android launchers;
- 16/32 pixel favicon variants; and
- iPhone/iPad portrait and landscape startup images covering the declared CSS
  viewport and device-pixel-ratio matrix.

The root production build runs this generator before building the client. When
the shared apple or backdrop colours change, regenerate instead of hand-editing
the PNG files.

## Acceptance checks

1. Build the client and verify `dist/service-worker.js`,
   `dist/manifest.webmanifest`, and `dist/pwa/` exist.
2. Serve the build over HTTPS. Confirm the manifest has no icon or scope errors
   in browser application tooling.
3. Install on Android/desktop and launch from the app icon; verify browser chrome
   is absent and both orientations remain usable.
4. Add to Home Screen on iPhone and iPad; verify the apple icon and the matching
   native startup image before the in-canvas loading gateway appears.
5. Deploy a second build while the first remains open. The game must continue
   untouched until the **UPDATE READY** prompt appears and the Escape menu reports
   **UPDATE**. Pressing **REFRESH NOW** must activate the waiting worker and reload
   once into the second build.
6. Disable the network after one successful load. The app shell may open, but
   account/world connectivity must fail normally rather than presenting stale
   authenticated or authoritative data.

## Full-screen game shell

- The non-pausing **GAME MENU** offers native **FULLSCREEN** only in a browser
  tab that supports both the Fullscreen and Keyboard Lock APIs. Escape is locked
  synchronously with fullscreen entry so an ordinary press opens/closes the game
  menu instead of immediately leaving fullscreen; the browser's long-hold Escape
  safety exit remains intact. Installed standalone PWAs already own their display
  surface and render this action disabled. Unsupported web sessions do not show a
  misleading **WEB VERSION** substitute.
- Root overscroll containment plus non-passive gesture guards prevent document
  scrolling, pull-to-refresh, pinch/trackpad page zoom, and browser edge-history
  gestures from stealing Canvas input. Native hidden text fields are exempt so
  chat, filters, clipboard, software keyboards, and IME composition still work.
- Installed mode adds a same-URL history sentinel so Back/Forward edge gestures
  remain in the game; ordinary browser tabs keep normal navigation semantics.
- `viewport-fit=cover` lets the world Canvas render full-bleed behind notches,
  rounded corners, and home indicators. A separate safe HUD rectangle protects
  the top and side cutouts without creating blank strips around the world; the
  bottom-anchored HUD remains flush with the Canvas edge and pointer coordinates
  use the same layout.
- Dynamic viewport height prevents mobile browser chrome changes from producing
  a scrollable strip around the full-screen game. Installed standalone/fullscreen
  mode deliberately uses `100vh` because WebKit currently reports `100dvh`
  shorter by a safe-area inset for `viewport-fit=cover` PWAs.
- Canvas animation pauses while the installed app is hidden and resumes with a
  fresh safe-area/viewport measurement, avoiding needless background battery use.
