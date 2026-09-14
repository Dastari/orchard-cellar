#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || -z $1 ]]; then
  printf 'Usage: %s named-keycloak-admin\n' "$0" >&2
  exit 64
fi

service_directory=$(cd "$(dirname "$0")/.." && pwd)
cd "$service_directory"
[[ -f .env && -f realm/orchard-realm.json ]] || {
  printf 'Run this command from the installed Orchard auth deployment.\n' >&2
  exit 66
}

client_json=$(mktemp /tmp/orchard-studio-client.XXXXXX.json)
query_json=$(mktemp /tmp/orchard-studio-query.XXXXXX.json)
effective_json=$(mktemp /tmp/orchard-studio-effective.XXXXXX.json)
chmod 0600 "$client_json" "$query_json" "$effective_json"
kcadm_config=/tmp/orchard-kcadm.config
cleanup() {
  docker compose exec -T keycloak rm -f "$kcadm_config" >/dev/null 2>&1 || true
  rm -f "$client_json" "$query_json" "$effective_json"
  unset admin_password KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD SMTP_PASSWORD
}
trap cleanup EXIT INT TERM

node - "$client_json" <<'NODE'
const fs = require('node:fs');
const output = process.argv[2];
const realm = JSON.parse(fs.readFileSync('realm/orchard-realm.json', 'utf8'));
const matches = (realm.clients ?? []).filter(({ clientId }) => clientId === 'orchard-studio');
if (matches.length !== 1) throw new Error(`expected one orchard-studio client template, found ${matches.length}`);
fs.writeFileSync(output, `${JSON.stringify(matches[0])}\n`, { mode: 0o600 });
NODE

bin/refresh-admin-truststore.sh >/dev/null
set -a
# shellcheck disable=SC1091
source ./.env
set +a
read -rsp "Password for Keycloak administrator $1: " admin_password
printf '\n' >&2

compose=(docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh)
"${compose[@]}" config truststore /run/orchard-tls/truststore.p12 --trustpass changeit \
  --config "$kcadm_config" >/dev/null
"${compose[@]}" config credentials --server https://keycloak:8443 --realm master \
  --user "$1" --password "$admin_password" --config "$kcadm_config" >/dev/null
unset admin_password

"${compose[@]}" get clients -r orchard -q clientId=orchard-studio \
  --config "$kcadm_config" --fields id,clientId > "$query_json"
client_id=$(node - "$query_json" <<'NODE'
const fs = require('node:fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(rows) || rows.length > 1) throw new Error(`ambiguous orchard-studio rows: ${rows.length}`);
process.stdout.write(rows[0]?.id ?? '');
NODE
)

if [[ -z "$client_id" ]]; then
  "${compose[@]}" create clients -r orchard -f - \
    --config "$kcadm_config" < "$client_json" >/dev/null
  action=created
else
  "${compose[@]}" update "clients/$client_id" -r orchard -f - \
    --config "$kcadm_config" < "$client_json" >/dev/null
  action=updated
fi

"${compose[@]}" get clients -r orchard -q clientId=orchard-studio \
  --config "$kcadm_config" > "$effective_json"
node - "$effective_json" <<'NODE'
const fs = require('node:fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(rows) || rows.length !== 1) throw new Error('orchard-studio client is not unique');
const client = rows[0];
const exact = (value, expected) => JSON.stringify(value) === JSON.stringify(expected);
if (client.enabled !== true || client.publicClient !== true || client.standardFlowEnabled !== true
  || client.implicitFlowEnabled !== false || client.directAccessGrantsEnabled !== false
  || client.serviceAccountsEnabled !== false
  || !exact(client.redirectUris, ['https://cellar.dastari.net/'])
  || !exact(client.webOrigins, ['https://cellar.dastari.net'])
  || client.attributes?.['pkce.code.challenge.method'] !== 'S256'
  || client.attributes?.['post.logout.redirect.uris'] !== 'https://cellar.dastari.net/') {
  throw new Error('orchard-studio effective client settings do not match the reviewed template');
}
const audience = (client.protocolMappers ?? []).filter((mapper) =>
  mapper.protocolMapper === 'oidc-audience-mapper'
  && mapper.config?.['included.client.audience'] === 'orchard-studio'
  && mapper.config?.['id.token.claim'] === 'true');
if (audience.length !== 1) throw new Error('orchard-studio audience mapper missing or ambiguous');
NODE

issuer=https://auth.orchard.dastari.net/realms/orchard/protocol/openid-connect/auth
common='client_id=orchard-studio&response_type=code&scope=openid&code_challenge_method=S256&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
valid_status=$(curl -sS -o /dev/null -w '%{http_code}' "$issuer?$common&redirect_uri=https%3A%2F%2Fcellar.dastari.net%2F")
game_status=$(curl -sS -o /dev/null -w '%{http_code}' "$issuer?$common&redirect_uri=https%3A%2F%2Forchard.dastari.net%2F")
local_status=$(curl -sS -o /dev/null -w '%{http_code}' "$issuer?$common&redirect_uri=http%3A%2F%2Flocalhost%3A5174%2F")
[[ "$valid_status" = 200 || "$valid_status" = 302 || "$valid_status" = 303 ]]
[[ "$game_status" = 400 ]]
[[ "$local_status" = 400 ]]

printf 'orchard-studio %s and verified: valid_redirect=%s game_redirect=%s localhost_redirect=%s\n' \
  "$action" "$valid_status" "$game_status" "$local_status"
