#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || $1 == "$2" ]]; then
  echo 'Usage: remove-bootstrap-admin.sh <first-admin-username> <second-admin-username>' >&2
  exit 2
fi

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
"$SERVICE_DIR/bin/refresh-admin-truststore.sh" >/dev/null
set -a
# shellcheck disable=SC1091
source ./.env
set +a

run_kcadm() {
  docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/orchard-kcadm.config
}
run_kcadm config truststore /run/orchard-tls/truststore.p12 --trustpass changeit >/dev/null
run_kcadm config credentials --server https://keycloak:8443 --realm master \
  --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

for username in "$@"; do
  user_json=$(run_kcadm get users -r master -q "username=$username" --fields id,username,enabled,requiredActions)
  user_id=$(printf '%s' "$user_json" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const users=JSON.parse(s); const user=users[0];
  if (!user || user.enabled !== true || (user.requiredActions ?? []).length !== 0) process.exit(1);
  process.stdout.write(user.id);
});')
  roles=$(run_kcadm get "users/$user_id/role-mappings" -r master)
  printf '%s' "$roles" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const mappings=JSON.parse(s);
  if (!(mappings.realmMappings ?? []).some((role) => role.name === "admin")) process.exit(1);
});'
done

bootstrap_json=$(run_kcadm get users -r master -q "username=$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" --fields id,username)
bootstrap_id=$(printf '%s' "$bootstrap_json" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const user=JSON.parse(s)[0]; if (user) process.stdout.write(user.id);
});')
if [[ -n "$bootstrap_id" ]]; then
  run_kcadm delete "users/$bootstrap_id" -r master
fi
unset KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD SMTP_PASSWORD ORCHARD_BACKUP_PASSWORD
echo 'Bootstrap administrator removed after two named administrators passed the guard.'
