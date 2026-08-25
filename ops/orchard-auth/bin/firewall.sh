#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo 'Run with sudo.' >&2
  exit 1
fi

lan_interface=${AUTH_LAN_INTERFACE:-eth0}
auth_port=${AUTH_PORT:-8443}
npm_source=${NPM_SOURCE:-10.0.1.248/32}

ensure_rule() {
  if ! iptables -C DOCKER-USER "$@" 2>/dev/null; then
    iptables -I DOCKER-USER 1 "$@"
  fi
}

# Docker DNAT occurs before DOCKER-USER. --ctorigdstport matches the published
# listener while keeping the rule independent of the container's bridge IP.
# Insert the catch-all deny first. Later inserts land above it, so the explicit
# source allows are evaluated before the deny regardless of whether this script
# is being run for the first time or converging an existing rule set.
ensure_rule -i "$lan_interface" -p tcp -m conntrack --ctorigdstport "$auth_port" -j DROP
ensure_rule -i "$lan_interface" -p tcp -s "$npm_source" -m conntrack --ctorigdstport "$auth_port" -j ACCEPT
for source in "$@"; do
  ensure_rule -i "$lan_interface" -p tcp -s "$source" -m conntrack --ctorigdstport "$auth_port" -j ACCEPT
done

iptables -S DOCKER-USER
