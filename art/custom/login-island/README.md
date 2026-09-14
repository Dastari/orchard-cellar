# Island sign-in background

The loading, account, OIDC login/registration/recovery, and installed PWA launch
screens share a static render of the generated island. It shows the woodland
between Marlow's camp and Fin's lake at world zoom 1. No account, player, or live
world data is read to create or display it.

Regenerate the image, Keycloak theme assets, and native PWA splash screens with:

```sh
npm run login:background
```

This uses the existing generated atlases and a local Chrome/Chromium executable.
The renderer records the actual seed, camera, source hashes, atlas revision, and
image hash in `provenance.json`. The canonical PNG is
`packages/client/public/ui/island-background.png`; the Keycloak theme contains the
same bytes under a content-hashed local filename. Native app icons are unchanged.

Screens use a centered cover crop, nearest-neighbor scaling, and an 18% dark tint
of `#101813`. The client preloads and caches the image without delaying sign-in
when the image is unavailable. A decoded viewport image is reused between frames;
no island generation or game connection runs behind the login form.

Deployment remains part of the next combined release (currently 0.5.0 in the shared worktree). The Keycloak theme has its
own presentation-only installation procedure in `ops/orchard-auth/THEME.md`.
