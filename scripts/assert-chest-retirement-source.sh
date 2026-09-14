#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [/absolute/repository]\n' "$0" >&2
  exit 64
}

[[ $# -le 1 ]] || usage
repository=${1:-/home/toby/projects/orchard-cellar}
[[ "$repository" = /* && -d "$repository" && ! -L "$repository" ]] || usage
repository=$(realpath "$repository")
world_source_root=$repository/packages/world/src
world_source=$world_source_root/index.ts
client_source_root=$repository/packages/client/src
bindings_root=$repository/packages/world-bindings/src
bindings_index=$bindings_root/index.ts
[[ -f "$world_source" && ! -L "$world_source"
  && -f "$bindings_index" && ! -L "$bindings_index" ]] || usage

# The status procedure remains as the post-drop receipt boundary. Every legacy
# storage/session/mapping declaration and callable legacy mutation must be gone.
mapfile -d '' world_runtime_sources < <(
  find "$world_source_root" -type f -name '*.ts' ! -name '*.test.ts' ! -name '*.spec.ts' -print0
)
if rg -n '\b(world_chest|world_chest_slot|world_chest_damage|active_chest|chest_migration_mapping)\b' \
  "${world_runtime_sources[@]}" >&2; then
  printf 'Retirement candidate still contains legacy chest storage, mapping, or session source.\n' >&2
  exit 65
fi

# Migration reducers and their dual-write implementation are useful rollback
# material in the retained transition checkout, but may not ship in the retired
# module.  The status procedure is intentionally excluded: it is the durable
# post-drop receipt used by the release gate.
if [[ -e "$world_source_root/chest-migration.ts" ]]; then
  printf 'Retirement candidate still contains the legacy chest migration runtime.\n' >&2
  exit 65
fi
if rg -n '\b(adminBackfillLegacyChests|adminDrainLegacyChests|adminSetChestMigrationPhase|adminVerifyLegacyChests|interactChestBehaviour|syncGenericChestLegacyMirror|syncLegacyChestGenericMirror|deleteGenericChestLegacyMirror)\b' \
  "${world_runtime_sources[@]}" >&2; then
  printf 'Retirement candidate still contains a legacy chest migration or adapter surface.\n' >&2
  exit 65
fi

# Once the old tables no longer exist, the retained authenticated status
# procedure becomes a retirement receipt. Its removed-table counters must be
# literal zeroes, never queries or inferred values, while generic-session state
# remains live.
rg -q 'export const adminChestMigrationStatus[[:space:]]*=' "$world_source" || {
  printf 'Retirement candidate is missing the retained chest status procedure.\n' >&2
  exit 66
}
rg -q "phase:[[:space:]]*['\"]drop_ready['\"]" "$world_source" || {
  printf 'Retirement candidate status does not report the terminal drop_ready phase.\n' >&2
  exit 66
}
for zero_field in legacyChestCount legacySlotCount legacyDamageCount mappingCount activeLegacySessionCount; do
  rg -q "${zero_field}:[[:space:]]*['\"]0['\"]" "$world_source" || {
    printf 'Retirement candidate status lacks literal-zero receipt field: %s\n' "$zero_field" >&2
    exit 66
  }
done

for forbidden in \
  world_chest_table.ts own_active_chest_table.ts own_open_chest_slots_table.ts \
  admin_backfill_legacy_chests_reducer.ts admin_drain_legacy_chests_reducer.ts \
  admin_set_chest_migration_phase_reducer.ts admin_verify_legacy_chests_reducer.ts \
  close_chest_reducer.ts distribute_chest_item_reducer.ts move_chest_item_reducer.ts; do
  if [[ -e "$bindings_root/$forbidden" ]]; then
    printf 'Retirement candidate still contains generated legacy binding: %s\n' "$forbidden" >&2
    exit 65
  fi
done

if rg -n '\b(worldChest|ownActiveChest|ownOpenChestSlots|adminBackfillLegacyChests|adminDrainLegacyChests|adminSetChestMigrationPhase|adminVerifyLegacyChests|closeChest|distributeChestItem|moveChestItem)\b' \
  "$bindings_index" >&2; then
  printf 'Retirement candidate still exports a generated legacy chest surface.\n' >&2
  exit 65
fi

# Public UI compatibility names such as closeChest may remain, but the retired
# browser must never call a generated legacy reducer.  It must route chest UI
# actions through the generic placeable reducers before publication.
if [[ -d "$client_source_root" ]] && rg -n \
  '\.reducers\.(closeChest|distributeChestItem|moveChestItem)\b' \
  "$client_source_root" >&2; then
  printf 'Retirement candidate client still invokes or imports a legacy chest reducer.\n' >&2
  exit 65
fi

for required in \
  world_placeable_table.ts own_active_placeable_table.ts own_open_placeable_slots_table.ts \
  own_placed_placeable_slots_table.ts own_placed_placeable_damage_table.ts \
  admin_chest_migration_status_procedure.ts; do
  [[ -f "$bindings_root/$required" && ! -L "$bindings_root/$required" ]] || {
    printf 'Retirement candidate is missing required generic/status binding: %s\n' "$required" >&2
    exit 66
  }
done

for required_symbol in worldPlaceable ownActivePlaceable ownOpenPlaceableSlots \
  ownPlacedPlaceableSlots ownPlacedPlaceableDamage adminChestMigrationStatus; do
  rg -q "\\b${required_symbol}\\b" "$bindings_index" || {
    printf 'Retirement candidate is missing required generated symbol: %s\n' "$required_symbol" >&2
    exit 66
  }
done

printf 'Retirement source/bindings are generic-only and retain the drop-readiness status boundary.\n'
