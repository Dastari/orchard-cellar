#!/usr/bin/env bash
set -euo pipefail

build_log=$(mktemp)
cleanup_build_log() {
  rm -f -- "$build_log"
}
trap cleanup_build_log EXIT INT TERM

build_status=0
spacetime build 2>&1 | tee "$build_log" || build_status=$?
if [[ "$build_status" -ne 0 ]]; then
  exit "$build_status"
fi

# SpaceTimeDB 2.8.2 can print a module-evaluation/schema-extraction error and still
# return status zero. Treat those diagnostics as hard failures so release gates
# cannot mistake an unusable module for a successful build.
if rg -q '(^Error: Uncaught|^Error: Errors occurred:|could not extract schema|Build failed)' "$build_log"; then
  printf 'SpaceTimeDB emitted a fatal build diagnostic despite returning success.\n' >&2
  exit 1
fi
