# Orchard Keycloak theme

The `orchard` login and email themes extend Keycloak's bundled themes. They deliberately
override presentation and message strings only: Keycloak retains the real forms,
accessibility semantics, password-manager support, CSRF protection, registration,
verification, recovery, OTP, and OIDC Authorization Code + PKCE flow.

Build the small, licensed UI crops from the ignored Cute Fantasy source pack with:

```sh
npm run extract:keycloak-theme -w @orchard/tools
```

Deploy this directory read-only at `/opt/keycloak/themes/orchard`, select `orchard` as
the realm login and email theme, and retain production theme caching. Do not add
JavaScript, credentials, signing material, or full source sheets to this directory.
The licensed UI font is included only as a runtime project resource alongside the
small theme crops; neither the complete source sheets nor editable pack files are
published.

Login pages use a deliberate hybrid typography rule shared with the game shell:
the Cute Fantasy pixel font is reserved for the Orchard ribbon, while page headings,
actions, form labels, field values, instructions, validation, and recovery copy use
the readable UI-monospace stack. Do not reapply the decorative pixel font globally.
The provider background uses the same zoomed-out generated island PNG as the
account/loading screens, sourced from `packages/client/public/ui/island-background.png`.
The theme asset command copies the exact image into the local theme and emits
content-hashed PNG and CSS filenames, so cached pages remain coherent without
depending on the game origin. The fixed, centred cover image has a subtle dark
overlay behind the opaque parchment forms and scales to mobile viewports. Form fields use a single
slightly rounded outline; the password reveal action is part of that same outline and
is separated only by its left divider. Browser autofill is recolored to that same
field surface so it cannot expose a shorter native input box. The Orchard ribbon uses
the game's short, wide overlap across the top rail, and the outer frame retains the
source panel's asymmetric `13/12/11/13` nine-slice instead of adding a separate drop
shadow beneath its lower rail.

For a theme-only update, retain a checksum-verified copy of the currently deployed
`/home/toby/services/orchard-auth/themes/orchard` directory, stage this complete
theme, and verify its local CSS/font/image references before installing. The
Compose mount is read-only inside Keycloak; PostgreSQL, realm configuration,
credentials, and the game/world deployment are outside this change. Keep theme
caching enabled. A controlled Keycloak-only restart loads changed theme metadata;
schedule it after any active sign-in exchange has completed. Verify readiness,
canonical discovery, and rendered login/registration/recovery forms and their
hashed resources before accepting the update. If validation fails, restore the
retained theme bytes and restart only Keycloak. No theme update or restart is
implied by running the local asset generator.

The email theme uses one email-safe HTML shell in `email/html/template.ftl`, so all
Keycloak-generated HTML mail inherits the Orchard palette and framed parchment
layout. Keep that shell table-based, self-contained, and free of JavaScript,
tracking pixels, web fonts, or external images: many email clients block those
features. Plain-text mail and the common account-flow wording live in
`email/messages/messages_en.properties`.
