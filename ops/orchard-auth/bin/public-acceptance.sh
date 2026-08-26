#!/usr/bin/env bash
set -euo pipefail

issuer=https://auth.orchard.dastari.net/realms/orchard
origin=https://orchard.dastari.net
discovery_file=$(mktemp)
headers_file=$(mktemp)
trap 'rm -f "$discovery_file" "$headers_file"' EXIT

curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
  "$issuer/.well-known/openid-configuration" > "$discovery_file"
node -e '
const fs = require("fs"); const discovery = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (discovery.issuer !== "https://auth.orchard.dastari.net/realms/orchard") throw new Error("issuer_mismatch");
for (const field of ["jwks_uri", "authorization_endpoint", "token_endpoint", "end_session_endpoint", "revocation_endpoint"]) {
  if (typeof discovery[field] !== "string" || !discovery[field].startsWith("https://auth.orchard.dastari.net/")) {
    throw new Error(`${field}_invalid`);
  }
}
' "$discovery_file"

jwks_uri=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).jwks_uri" "$discovery_file")
token_endpoint=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).token_endpoint" "$discovery_file")
curl --proto '=https' --tlsv1.2 --fail --silent --show-error "$jwks_uri" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(!Array.isArray(x.keys)||!x.keys.some(k=>k.kty==="RSA"&&k.use==="sig"))throw new Error("signing_key_missing")})'

redirect=$(curl --silent --output /dev/null --write-out '%{redirect_url}' http://auth.orchard.dastari.net/)
[[ "$redirect" == https://auth.orchard.dastari.net/* ]]
curl --proto '=https' --tlsv1.2 --silent --show-error --dump-header "$headers_file" --output /dev/null \
  --request OPTIONS --header "Origin: $origin" --header 'Access-Control-Request-Method: POST' "$token_endpoint"
tr -d '\r' < "$headers_file" | grep -Fqi "access-control-allow-origin: $origin"

certificate_end=$(openssl s_client -connect auth.orchard.dastari.net:443 \
  -servername auth.orchard.dastari.net -verify_return_error </dev/null 2>/dev/null \
  | openssl x509 -noout -enddate)
echo "Discovery/JWKS/TLS redirect/exact-origin checks pass; $certificate_end"
