#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a

backup_root=$(realpath "${AUTH_BACKUP_DIR:?set AUTH_BACKUP_DIR}")
retention_days=${AUTH_BACKUP_RETENTION_DAYS:-30}
[[ "$retention_days" =~ ^[0-9]+$ && "$retention_days" -ge 1 ]]
cutoff=$(date -u -d "$retention_days days ago" +%Y%m%dT%H%M%SZ)

for directory in "$backup_root"/*; do
  [[ -d "$directory" ]] || continue
  stamp=$(basename "$directory")
  [[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
  if [[ "$stamp" < "$cutoff" ]]; then
    find "$directory" -depth -delete
    echo "Pruned local auth backup $stamp."
  fi
done

host=${ORCHARD_BACKUP_HOST:?set ORCHARD_BACKUP_HOST}
share=${ORCHARD_BACKUP_PATH:?set ORCHARD_BACKUP_PATH}
credentials="$SERVICE_DIR/.smb-credentials"
remote_listing=$(smbclient "//$host/$share" -A "$credentials" -m SMB3 \
  --client-protection=encrypt -c 'cd orchard\auth; ls')
while IFS= read -r stamp; do
  [[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
  if [[ "$stamp" < "$cutoff" ]]; then
    smbclient "//$host/$share" -A "$credentials" -m SMB3 --client-protection=encrypt \
      -c "cd orchard\\auth; deltree $stamp" >/dev/null
    echo "Pruned off-machine auth backup $stamp."
  fi
done < <(printf '%s\n' "$remote_listing" | awk '$1 ~ /^[0-9]{8}T[0-9]{6}Z$/ && $2 == "D" { print $1 }')

unset ORCHARD_BACKUP_PASSWORD SMTP_PASSWORD KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD
echo "Retention pass complete; cutoff=$cutoff."
