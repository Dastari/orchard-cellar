#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'Usage: create-named-admin.sh <username> <verified-admin-email>' >&2
  exit 2
fi

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
"$SERVICE_DIR/bin/refresh-admin-truststore.sh" >/dev/null
set -a
# shellcheck disable=SC1091
source ./.env
set +a

username=$1
email=$2
password_file="$SERVICE_DIR/.named-admin-initial-password"
umask 077
openssl rand -base64 48 | tr -d '\n' > "$password_file"
printf '\n' >> "$password_file"
initial_password=$(tr -d '\n' < "$password_file")

run_kcadm() {
  docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/orchard-kcadm.config
}
run_kcadm config truststore /run/orchard-tls/truststore.p12 --trustpass changeit >/dev/null
run_kcadm config credentials --server https://keycloak:8443 --realm master \
  --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" \
  >/dev/null
admin_id=$(run_kcadm get users -r master -q "username=$username" --fields id,username \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const user=JSON.parse(s)[0];if(user)process.stdout.write(user.id)})")
if [[ -z "$admin_id" ]]; then
  run_kcadm create users -r master -s "username=$username" -s "email=$email" \
    -s enabled=true -s emailVerified=true >/dev/null
  admin_id=$(run_kcadm get users -r master -q "username=$username" --fields id,username \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s)[0].id))")
fi
run_kcadm set-password -r master --userid "$admin_id" --new-password "$initial_password" --temporary
run_kcadm add-roles -r master --uid "$admin_id" --rolename admin

unset initial_password KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD
echo "Named administrator created; initial temporary password is in $password_file (mode 0600)."
echo 'Bootstrap remains active until two named administrators verify access.'
echo 'Delete the password file after this administrator changes the temporary password.'
