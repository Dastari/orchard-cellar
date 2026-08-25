#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR=$(cd "$(dirname "$0")/.." && pwd)
SERVICE_DIR=${1:-/home/toby/services/orchard-auth}
REPOSITORY_DIR=$(cd "$SOURCE_DIR/../.." && pwd)
SERVICE_DIR=$(realpath -m "$SERVICE_DIR")

case "$SERVICE_DIR/" in
  "$REPOSITORY_DIR"/*)
    echo 'Refusing to place deployment secrets inside the game repository.' >&2
    exit 1
    ;;
esac

if [[ -e "$SERVICE_DIR" ]]; then
  echo "Refusing to overwrite existing service directory: $SERVICE_DIR" >&2
  exit 1
fi

install -d -m 0700 "$SERVICE_DIR" "$SERVICE_DIR/bin" "$SERVICE_DIR/realm" "$SERVICE_DIR/tls"
install -m 0644 "$SOURCE_DIR/compose.yaml" "$SERVICE_DIR/compose.yaml"
install -m 0644 "$SOURCE_DIR/realm/orchard-realm.json" "$SERVICE_DIR/realm/orchard-realm.json"
install -m 0750 "$SOURCE_DIR"/bin/*.sh "$SERVICE_DIR/bin/"

umask 077
postgres_password=$(openssl rand -base64 48 | tr -d '\n')
bootstrap_password=$(openssl rand -base64 48 | tr -d '\n')
{
  printf 'POSTGRES_DB=keycloak\n'
  printf 'POSTGRES_USER=keycloak\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=bootstrap-orchard\n'
  printf 'KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=%s\n' "$bootstrap_password"
  printf 'AUTH_BACKUP_DIR=/home/toby/backups/orchard-auth\n'
  printf 'AUTH_BACKUP_RETENTION_DAYS=30\n'
  printf 'SMTP_HOST=\nSMTP_PORT=587\nSMTP_FROM=\n'
  printf 'SMTP_FROM_DISPLAY_NAME="Orchard and Cellar"\nSMTP_USER=\nSMTP_PASSWORD=\n'
  printf 'SMTP_STARTTLS=true\nSMTP_SSL=false\n'
} > "$SERVICE_DIR/.env"
chmod 0600 "$SERVICE_DIR/.env"
unset postgres_password bootstrap_password

# Optionally import deployment-only SMTP and NAS settings from an existing
# protected dotenv file. Values are copied verbatim and are never printed.
if [[ -n ${ORCHARD_AUTH_IMPORT_ENV:-} ]]; then
  import_env=$(realpath "$ORCHARD_AUTH_IMPORT_ENV")
  if [[ ! -f "$import_env" ]]; then
    echo "Import file does not exist: $import_env" >&2
    exit 1
  fi
  if [[ $(stat -c '%a' "$import_env") != 600 ]]; then
    echo "Import file must be mode 0600: $import_env" >&2
    exit 1
  fi
  for name in \
    SMTP_HOST SMTP_PORT SMTP_FROM SMTP_FROM_DISPLAY_NAME SMTP_USER \
    SMTP_PASSWORD SMTP_STARTTLS SMTP_SSL SMTP_AUTH SMTP_REPLY_TO \
    ORCHARD_BACKUP_HOST ORCHARD_BACKUP_PATH ORCHARD_BACKUP_USERNAME \
    ORCHARD_BACKUP_PASSWORD; do
    line=$(awk -F= -v key="$name" '$1 == key { print; exit }' "$import_env")
    if [[ -n "$line" ]]; then
      value=${line#*=}
      if [[ ${#value} -ge 2 && (( $value == \"*\" ) || ( $value == \'*\' )) ]]; then
        value=${value:1:${#value}-2}
      fi
      value=${value//\'/\'\\\'\'}
      printf "%s='%s'\n" "$name" "$value" >> "$SERVICE_DIR/.env"
    fi
  done
  unset line value import_env
  chmod 0600 "$SERVICE_DIR/.env"
fi

openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
  -subj '/CN=Orchard Auth Internal CA' \
  -keyout "$SERVICE_DIR/tls/ca.key" -out "$SERVICE_DIR/tls/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:3072 -sha256 -nodes \
  -subj '/CN=auth.orchard.dastari.net' \
  -addext 'subjectAltName=DNS:auth.orchard.dastari.net,DNS:keycloak,IP:10.0.1.150' \
  -keyout "$SERVICE_DIR/tls/server.key" -out "$SERVICE_DIR/tls/server.csr" >/dev/null 2>&1
openssl x509 -req -sha256 -days 825 \
  -in "$SERVICE_DIR/tls/server.csr" \
  -CA "$SERVICE_DIR/tls/ca.crt" -CAkey "$SERVICE_DIR/tls/ca.key" -CAcreateserial \
  -copy_extensions copyall -out "$SERVICE_DIR/tls/server.crt" >/dev/null 2>&1
chmod 0600 "$SERVICE_DIR/tls/ca.key" "$SERVICE_DIR/tls/server.key"
chmod 0644 "$SERVICE_DIR/tls/ca.crt" "$SERVICE_DIR/tls/server.crt"
openssl pkcs12 -export -nokeys -name orchard-auth-ca \
  -in "$SERVICE_DIR/tls/ca.crt" -out "$SERVICE_DIR/tls/truststore.p12" \
  -passout pass:changeit >/dev/null 2>&1
chmod 0644 "$SERVICE_DIR/tls/truststore.p12"

echo "Prepared $SERVICE_DIR without starting containers."
echo "SMTP remains disabled; do not enable registration until bin/configure-smtp.sh succeeds."
