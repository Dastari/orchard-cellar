/** Ordered migration metadata. Units and bounds apply to named fields and legacy tuples. */
export const BALANCE_FIELD_METADATA = {
  character_combat: [
    { name: "baseAttribute", unit: "count", minimum: 1, maximum: 9007199254740991, help: "Default value for each character attribute; minimum ≤ base ≤ maximum." },
    { name: "minimumAttribute", unit: "count", minimum: 1, maximum: 9007199254740991, help: "Lower clamp for resolved attributes." },
    { name: "maximumAttribute", unit: "count", minimum: 1, maximum: 9007199254740991, help: "Upper clamp for resolved attributes." },
    { name: "basisPoints", unit: "basis points", minimum: 1, maximum: 9007199254740991, help: "Denominator for percentage modifiers (10000 means 100%)." },
    { name: "centiUnitsPerDisplayUnit", unit: "count", minimum: 1, maximum: 9007199254740991, help: "Number of stored centi-units shown as one health, mana or vigour unit." },
    { name: "healthCentiPerStrength", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Health centi per strength." },
    { name: "manaCentiPerIntelligence", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Mana centi per intelligence." },
    { name: "vigourCentiPerConstitution", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Vigour centi per constitution." },
    { name: "healthRegenCentiPerSecond", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Health regen centi per second." },
    { name: "manaRegenCentiPerWisdom", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Mana regen centi per wisdom." },
    { name: "vigourRegenCentiPerConstitution", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Vigour regen centi per constitution." },
    { name: "regenSweepTicks", unit: "ticks", minimum: 1, maximum: 9007199254740991, help: "Authority ticks between character regeneration sweeps." },
    { name: "bowBaseDamageCenti", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Bow base damage centi." },
    { name: "swordBaseDamageCenti", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Sword base damage centi." },
    { name: "combatMinimumDamageCenti", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Combat minimum damage centi." },
    { name: "archeryTargetMaxHealthCenti", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Archery target max health centi." },
    { name: "archeryTargetRegenCentiPerSecond", unit: "centi-units", minimum: 1, maximum: 9007199254740991, help: "Archery target regen centi per second." },
    { name: "archeryTargetRegenIntervalTicks", unit: "ticks", minimum: 1, maximum: 9007199254740991, help: "Archery target regen interval ticks." },
  ],
  world_policy: [
    { name: "fiberTillDropPercent", unit: "percent", minimum: 1, maximum: 100, help: "Fiber till drop percent." },
    { name: "craftingStationReachTiles", unit: "tiles", minimum: 1, maximum: 64, help: "Crafting station reach tiles." },
    { name: "itemDespawnTicks", unit: "ticks", minimum: 1, maximum: 10000000, help: "Item despawn ticks." },
    { name: "survivalSpawnSearchRadiusTiles", unit: "tiles", minimum: 1, maximum: 32000, help: "Survival spawn search radius tiles." },
    { name: "proceduralWorldChunkTiles", unit: "tiles", minimum: 1, maximum: 1024, help: "Procedural world chunk tiles." },
    { name: "proceduralWorldExtentTiles", unit: "tiles", minimum: 1, maximum: 1000000, help: "World extent in tiles; must be divisible by chunk size." },
    { name: "proceduralSpawnPregenRadiusChunks", unit: "chunks", minimum: 1, maximum: 1024, help: "Procedural spawn pregen radius chunks." },
    { name: "proceduralGenerationLookaheadChunks", unit: "chunks", minimum: 1, maximum: 1024, help: "Lookahead radius; cannot exceed spawn pregeneration radius." },
    { name: "survivalTerrainMaxElevation", unit: "count", minimum: 1, maximum: 255, help: "Survival terrain max elevation." },
    { name: "survivalTerrainContourInsetTiles", unit: "tiles", minimum: 1, maximum: 255, help: "Survival terrain contour inset tiles." },
    { name: "survivalTerrainMinimumSummitTiles", unit: "tiles", minimum: 1, maximum: 1000000, help: "Survival terrain minimum summit tiles." },
  ],
  residence_construction: [
    { name: "recipeVersion", unit: "count", minimum: 1, maximum: 65535, help: "Saved recipe identity; create a new version when changing historical construction costs." },
    { name: "wood", unit: "item reference", help: "Active item definition used for Wood construction costs." },
    { name: "stone", unit: "item reference", help: "Active item definition used for Stone construction costs." },
    { name: "copper", unit: "item reference", help: "Active item definition used for Copper construction costs." },
    { name: "rusticWood", unit: "count", minimum: 1, maximum: 8192, help: "Rustic wood." },
    { name: "townhouseWood", unit: "count", minimum: 1, maximum: 8192, help: "Townhouse wood." },
    { name: "townhouseStone", unit: "count", minimum: 1, maximum: 8192, help: "Townhouse stone." },
    { name: "wallWood", unit: "count", minimum: 1, maximum: 8192, help: "Wall wood." },
    { name: "wallStone", unit: "count", minimum: 1, maximum: 8192, help: "Wall stone." },
    { name: "doorwayWood", unit: "count", minimum: 1, maximum: 8192, help: "Doorway wood." },
    { name: "windowWood", unit: "count", minimum: 1, maximum: 8192, help: "Window wood." },
    { name: "windowCopper", unit: "count", minimum: 1, maximum: 8192, help: "Window copper." },
  ],
} as const;

export function balanceTupleFields<P extends keyof typeof BALANCE_FIELD_METADATA>(profile: P, values: readonly unknown[]): Record<string, unknown> {
  return Object.fromEntries(BALANCE_FIELD_METADATA[profile].map((field, index) => [field.name, values[index]]));
}

export function balanceFieldsTuple(profile: keyof typeof BALANCE_FIELD_METADATA, fields: object): readonly unknown[] {
  return BALANCE_FIELD_METADATA[profile].map(({ name }) => (fields as Record<string, unknown>)[name]);
}
