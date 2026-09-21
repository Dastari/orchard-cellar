#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -sm)" == 'Linux x86_64' ]] || {
  echo 'This pinned installer supports Linux x86_64 only.' >&2; exit 1;
}
for command in curl tar sha256sum python3 systemctl; do
  command -v "$command" >/dev/null || { echo "Missing $command" >&2; exit 1; }
done
systemctl --user show-environment >/dev/null
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
version=0.3.36
release_dir="$HOME/.local/lib/orchard-agent-mail/v$version"
archive_hash=6b1cfa177894a12bd69675d837cb08756f52028cdeddc6f9412c14f04f01bf18
# Refuse to replace another installation's command names.
for binary in mcp-agent-mail am; do
  command_path="$HOME/.local/bin/$binary"
  if [[ -e "$command_path" || -L "$command_path" ]]; then
    [[ "$(readlink -- "$command_path")" == "$release_dir/$binary" ]] || {
      echo "Existing command is not managed by this installer: $command_path" >&2
      exit 1
    }
  fi
done
scratch="$(mktemp -d)"
trap 'rm -rf -- "$scratch"' EXIT
curl --fail --silent --show-error --location --retry 3 --connect-timeout 15 --max-time 300 \
  "https://github.com/Dicklesworthstone/mcp_agent_mail_rust/releases/download/v$version/mcp-agent-mail-x86_64-unknown-linux-musl.tar.xz" \
  -o "$scratch/release.tar.xz"
printf '%s  %s\n' "$archive_hash" "$scratch/release.tar.xz" | sha256sum --check
# Extract only the two expected executables, never upstream config/install hooks.
tar -xJf "$scratch/release.tar.xz" -C "$scratch" mcp-agent-mail am
"$scratch/mcp-agent-mail" --version
mkdir -p "$release_dir" "$HOME/.local/bin" "$HOME/.config/systemd/user"
install -m 700 -d "$HOME/.local/share/orchard-agent-mail"
# Atomic replacement also works while a previous service binary is running.
for binary in mcp-agent-mail am; do
  install -m 755 "$scratch/$binary" "$release_dir/$binary.new"
  mv -f -- "$release_dir/$binary.new" "$release_dir/$binary"
  ln -sfn -- "$release_dir/$binary" "$HOME/.local/bin/$binary"
done
unit="$HOME/.config/systemd/user/orchard-agent-mail.service"
if [[ -f "$unit" ]]; then cp -p -- "$unit" "$unit.previous"; fi
install -m 644 "$script_dir/orchard-agent-mail.service" "$unit"
systemctl --user daemon-reload
systemctl --user enable orchard-agent-mail.service
systemctl --user restart orchard-agent-mail.service
for ((attempt = 0; attempt < 30; attempt++)); do
  if curl --fail --silent --connect-timeout 2 --max-time 3 http://127.0.0.1:8765/health >/dev/null && \
     systemctl --user is-active --quiet orchard-agent-mail.service; then
    echo 'Agent Mail running at http://127.0.0.1:8765/mcp/'
    exit 0
  fi
  sleep 1
done
journalctl --user -u orchard-agent-mail.service -n 30 --no-pager >&2
exit 1
