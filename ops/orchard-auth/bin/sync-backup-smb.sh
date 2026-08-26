#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -d $1 ]]; then
  echo 'Usage: sync-backup-smb.sh /path/to/completed-backup-directory' >&2
  exit 2
fi

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a

source_dir=$(realpath "$1")
backup_root=$(realpath "${AUTH_BACKUP_DIR:?set AUTH_BACKUP_DIR}")
case "$source_dir/" in
  "$backup_root"/*/) ;;
  *) echo 'Refusing to copy a directory outside AUTH_BACKUP_DIR.' >&2; exit 1 ;;
esac

credentials="$SERVICE_DIR/.smb-credentials"
[[ -f "$credentials" && $(stat -c '%a' "$credentials") == 600 ]]
backup_files=(keycloak.pgdump keycloak.restore-list orchard-realm.redacted.json deployment-config.tgz SHA256SUMS)
for name in "${backup_files[@]}"; do
  [[ -f "$source_dir/$name" ]]
done
(cd "$source_dir" && sha256sum -c SHA256SUMS >/dev/null)

host=${ORCHARD_BACKUP_HOST:?set ORCHARD_BACKUP_HOST}
share=${ORCHARD_BACKUP_PATH:?set ORCHARD_BACKUP_PATH}
stamp=$(basename "$source_dir")
remote_dir="orchard\\auth\\$stamp"
commands="mkdir orchard; mkdir orchard\\auth; mkdir $remote_dir; cd $remote_dir"
for name in "${backup_files[@]}"; do
  commands+="; put $source_dir/$name $name"
done
smbclient "//$host/$share" -A "$credentials" -m SMB3 --client-protection=encrypt \
  -c "$commands" >/dev/null

verify_dir=$(mktemp -d /tmp/orchard-auth-smb-verify.XXXXXX)
chmod 0700 "$verify_dir"
cleanup() {
  for name in "${backup_files[@]}"; do
    [[ -f "$verify_dir/$name" ]] && shred -u "$verify_dir/$name"
  done
  rmdir "$verify_dir" 2>/dev/null || true
}
trap cleanup EXIT
get_commands="lcd $verify_dir"
for name in "${backup_files[@]}"; do
  get_commands+="; get $name"
done
smbclient "//$host/$share" -A "$credentials" -m SMB3 --client-protection=encrypt \
  -D "orchard/auth/$stamp" -c "$get_commands" >/dev/null
for name in "${backup_files[@]}"; do
  [[ $(sha256sum "$source_dir/$name" | cut -d' ' -f1) == $(sha256sum "$verify_dir/$name" | cut -d' ' -f1) ]]
done

unset ORCHARD_BACKUP_PASSWORD SMTP_PASSWORD KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD
echo "Encrypted SMB backup round-trip verified for $stamp."
