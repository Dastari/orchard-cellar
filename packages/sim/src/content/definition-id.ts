export const CONTENT_DEFINITION_ID_PATTERN = /^(item|recipe|process|shop|tileset|object|frame|loot|npc|dialogue|quest|balance|progression|crop|creature|spawn|space|skill_tree|effect|statistic|upgrade|balance_group|resource|loadout|enemy|encounter|world_rules):([a-z0-9]+(?:_[a-z0-9]+)*)$/;

export function definitionSlug(id: string): string | null {
  return CONTENT_DEFINITION_ID_PATTERN.exec(id)?.[2] ?? null;
}
