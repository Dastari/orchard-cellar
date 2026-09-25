#!/usr/bin/env bash
set -euo pipefail

repository=${CLIENT_STATIC_REPOSITORY:-/home/toby/projects/orchard-cellar}
dist=${CLIENT_STATIC_DIST:-$repository/packages/client/dist}
unit=${CLIENT_STATIC_UNIT:-$repository/ops/orchard-runtime/systemd/orchard-frontend.service}
origin=${CLIENT_VALIDATE_ORIGIN:-}
dry_run=${CLIENT_STATIC_DRY_RUN:-false}
# Optional static-world check (plan S5a). Off by default: no world chunk heads are
# published yet, so current releases are unaffected until the S5b pipeline runs.
world_chunks=${CLIENT_VALIDATE_WORLD_CHUNKS:-0}
world_heads=${CLIENT_VALIDATE_WORLD_CHUNK_HEADS:-}

[[ "$dry_run" = true || "$dry_run" = false ]] || {
  printf 'CLIENT_STATIC_DRY_RUN must be true or false.\n' >&2; exit 64;
}
[[ "$world_chunks" = 0 || "$world_chunks" = 1 ]] || {
  printf 'CLIENT_VALIDATE_WORLD_CHUNKS must be 0 or 1.\n' >&2; exit 64;
}

# Heads file: one published head per line, "<spaceId> <contentHash> <byteLength>";
# blank lines and #-comments are ignored.
head_spaces=()
head_hashes=()
head_sizes=()
if [[ "$world_chunks" = 1 ]]; then
  [[ "$world_heads" = /* && -f "$world_heads" && ! -L "$world_heads" && -r "$world_heads" ]] || {
    printf 'CLIENT_VALIDATE_WORLD_CHUNK_HEADS must be an absolute, regular, readable heads file.\n' >&2; exit 64;
  }
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%%#*}
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^[[:space:]]*(0|[1-9][0-9]{0,15})[[:space:]]+([a-f0-9]{64})[[:space:]]+([1-9][0-9]{0,6})[[:space:]]*$ ]] \
      && (( BASH_REMATCH[3] <= 1048576 )); then
      head_spaces+=("${BASH_REMATCH[1]}")
      head_hashes+=("${BASH_REMATCH[2]}")
      head_sizes+=("${BASH_REMATCH[3]}")
    else
      printf 'World chunk heads file has an invalid line: %s\n' "$line" >&2; exit 65
    fi
  done < "$world_heads"
  (( ${#head_hashes[@]} > 0 )) || {
    printf 'World chunk heads file lists no heads.\n' >&2; exit 65;
  }
fi
[[ -f "$dist/index.html" && -f "$unit" ]] || {
  printf 'Game static artifact or unit is missing.\n' >&2; exit 66;
}
[[ "$(realpath "$dist")" = "$(realpath "$repository/packages/client/dist")" ]] || {
  printf 'Game dist path must resolve to the checked production artifact.\n' >&2; exit 65;
}

grep -Fq "ConditionPathExists=$repository/packages/client/dist/index.html" "$unit"
grep -Fq 'npm run preview -w @orchard/client' "$unit"
if grep -Eq 'vite[[:space:]]+dev|npm[[:space:]]+run[[:space:]]+dev' "$unit"; then
  printf 'Game unit must never serve source or run the dev server.\n' >&2; exit 65
fi

reject_dev_html() {
  local html=$1
  if grep -Eq "/@vite/client|/src/|/@fs/|<script[^>]+src=['\"][^'\"]+[.]tsx?([?'\"])" "$html"; then
    printf 'Game response contains a Vite development or source-module path.\n' >&2
    return 1
  fi
  grep -Eq "<script[^>]+type=['\"]module['\"][^>]+src=['\"]/assets/[^'\"]+[.]js['\"]" "$html" || {
    printf 'Game response does not reference a hashed static module asset.\n' >&2
    return 1
  }
}

reject_dev_html "$dist/index.html" || exit 65

if [[ "$dry_run" = true ]]; then
  printf 'Game static dry-run passed: built artifact and static-only unit validated.\n'
  if [[ "$world_chunks" = 1 ]]; then
    printf 'World chunk heads file parsed (%d heads); blob checks need the public origin.\n' "${#head_hashes[@]}"
  fi
  exit 0
fi

[[ "$origin" =~ ^https://orchard\.dastari\.net/?$ ]] || {
  printf 'CLIENT_VALIDATE_ORIGIN must be the canonical HTTPS game origin.\n' >&2; exit 64;
}
headers=$(mktemp)
html=$(mktemp)
blob=$(mktemp)
trap 'rm -f -- "$headers" "$html" "$blob"' EXIT INT TERM
curl -fsS -D "$headers" -o "$html" "$origin"
grep -Fiq 'content-type: text/html' "$headers" || {
  printf 'Public game response is not HTML.\n' >&2; exit 69;
}
reject_dev_html "$html" || exit 69
curl -fsS "${origin%/}/v1/ping" >/dev/null
printf 'Game static service and canonical public route validation passed.\n'

hex_bytes() { od -An -v -tx1 | tr -d ' \n'; }

# Every listed head must be served over the public origin with immutable caching
# and must be a genuine chunk: OCCHNK magic, and sha256(bytes[40:]) equal to both
# the address hash and the digest embedded at bytes[8:40] (see world-chunk.ts).
# --compressed exercises the precompressed br/gzip siblings through the proxy.
if [[ "$world_chunks" = 1 ]]; then
  declare -A served_encodings=()
  for index in "${!head_hashes[@]}"; do
    space=${head_spaces[$index]}
    hash=${head_hashes[$index]}
    size=${head_sizes[$index]}
    label="world chunk $space/$hash"
    curl -fsS --compressed -D "$headers" -o "$blob" "${origin%/}/world/$space/$hash.bin" || {
      printf '%s is not served.\n' "$label" >&2; exit 69;
    }
    grep -Eiq '^cache-control:.*immutable' "$headers" || {
      printf '%s is not served with immutable caching.\n' "$label" >&2; exit 69;
    }
    grep -Eiq '^content-type:[[:space:]]*application/octet-stream' "$headers" || {
      printf '%s is not served as application/octet-stream.\n' "$label" >&2; exit 69;
    }
    [[ "$(stat -c %s "$blob")" = "$size" ]] || {
      printf '%s has the wrong byte length.\n' "$label" >&2; exit 69;
    }
    [[ "$(head -c 8 "$blob" | hex_bytes)" = 4f4343484e4b0100 ]] || {
      printf '%s is not a world chunk envelope.\n' "$label" >&2; exit 69;
    }
    [[ "$(tail -c +41 "$blob" | sha256sum | cut -d ' ' -f 1)" = "$hash" \
      && "$(head -c 40 "$blob" | tail -c 32 | hex_bytes)" = "$hash" ]] || {
      printf '%s bytes do not match its content hash.\n' "$label" >&2; exit 69;
    }
    encoding=$(sed -nE 's/^[Cc]ontent-[Ee]ncoding:[[:space:]]*([A-Za-z0-9-]+).*/\1/p' "$headers" | tail -n 1)
    encoding=${encoding:-identity}
    served_encodings[$encoding]=$(( ${served_encodings[$encoding]:-0} + 1 ))
  done
  # A missing blob must be a real 404, never the SPA index.html fallback.
  curl -sS -D "$headers" -o /dev/null "${origin%/}/world/0/$(printf '0%.0s' {1..64}).bin" || true
  [[ "$(sed -n '1s/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$headers")" = 404 ]] || {
    printf 'A missing world chunk is not answered with 404.\n' >&2; exit 69;
  }
  summary=
  for encoding in "${!served_encodings[@]}"; do summary+=" $encoding=${served_encodings[$encoding]}"; done
  printf 'World chunk validation passed: %d heads served and verified (encodings:%s).\n' \
    "${#head_hashes[@]}" "$summary"
fi
