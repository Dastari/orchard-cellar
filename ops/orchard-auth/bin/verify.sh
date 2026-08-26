#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$SERVICE_DIR"
docker compose config --quiet
node -e "JSON.parse(require('fs').readFileSync('realm/orchard-realm.json','utf8'))"

docker compose ps --format json | node -e '
let s=""; process.stdin.on("data", d => s += d).on("end", () => {
  const rows = s.trim().split(/\n/).filter(Boolean).map(line => JSON.parse(line));
  for (const service of ["postgres", "keycloak"]) {
    const row = rows.find(candidate => candidate.Service === service);
    if (!row || row.Health !== "healthy") throw new Error(`${service}_not_healthy`);
  }
});'

curl --fail --silent --show-error --cacert tls/ca.crt \
  --resolve auth.orchard.dastari.net:8443:10.0.1.150 \
  https://auth.orchard.dastari.net:8443/realms/orchard/.well-known/openid-configuration \
  | node -e '
let s=""; process.stdin.on("data", d => s += d).on("end", () => {
  const discovery = JSON.parse(s);
  if (discovery.issuer !== "https://auth.orchard.dastari.net/realms/orchard") {
    throw new Error("issuer_mismatch");
  }
  if (!discovery.jwks_uri || !discovery.authorization_endpoint || !discovery.token_endpoint) {
    throw new Error("discovery_endpoints_missing");
  }
  console.log("private discovery issuer and endpoints pass");
});'
