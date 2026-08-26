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

The email theme uses one email-safe HTML shell in `email/html/template.ftl`, so all
Keycloak-generated HTML mail inherits the Orchard palette and framed parchment
layout. Keep that shell table-based, self-contained, and free of JavaScript,
tracking pixels, web fonts, or external images: many email clients block those
features. Plain-text mail and the common account-flow wording live in
`email/messages/messages_en.properties`.
