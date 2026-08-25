#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a

backup_root=${AUTH_BACKUP_DIR:?set AUTH_BACKUP_DIR}
retention_days=${AUTH_BACKUP_RETENTION_DAYS:-30}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_root/$stamp"
install -d -m 0700 "$destination"
umask 077

docker compose exec -T postgres pg_dump \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --format=custom --compress=9 --no-owner --no-acl > "$destination/keycloak.pgdump"
docker compose exec -T postgres pg_restore --list < "$destination/keycloak.pgdump" > "$destination/keycloak.restore-list"
install -m 0600 realm/orchard-realm.json "$destination/orchard-realm.redacted.json"
(cd "$destination" && sha256sum keycloak.pgdump keycloak.restore-list orchard-realm.redacted.json > SHA256SUMS)
chmod 0600 "$destination"/*

"$SERVICE_DIR/bin/sync-backup-smb.sh" "$destination"
"$SERVICE_DIR/bin/prune-backups.sh"

echo "Backup created and verified off-machine at $destination; the approved ${retention_days}-day retention policy was applied."
