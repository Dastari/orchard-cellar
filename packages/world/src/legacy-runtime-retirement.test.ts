import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(
  new URL('../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);
const gameSource = readFileSync(
  new URL('../../client/src/overworld-main.ts', import.meta.url),
  'utf8',
);
const uiSource = readFileSync(new URL('../../ui/src/overworld-ui.ts', import.meta.url), 'utf8');
const worldRulesSource = readFileSync(new URL('./world-rules.ts', import.meta.url), 'utf8');
const merchantCartSource = readFileSync(new URL('../../sim/src/merchant-cart.ts', import.meta.url), 'utf8');
const itemContainersSource = readFileSync(new URL('../../sim/src/item-containers.ts', import.meta.url), 'utf8');
const adminInventorySource = readFileSync(new URL('./admin/inventory.ts', import.meta.url), 'utf8');
const adminObjectsSource = readFileSync(new URL('./admin/objects.ts', import.meta.url), 'utf8');
const bindingsDirectory = new URL('../../world-bindings/src/', import.meta.url);
const bootstrapLoaderSource = readFileSync(
  new URL('../../sim/src/content/bootstrap-pack-loader.ts', import.meta.url),
  'utf8',
);
const contentRegistrySource = readFileSync(
  new URL('../../sim/src/content/registry.ts', import.meta.url),
  'utf8',
);
const bootstrapRegistrySource = readFileSync(
  new URL('../../sim/src/content/bootstrap-registry.ts', import.meta.url),
  'utf8',
);
const simIndexSource = readFileSync(new URL('../../sim/src/index.ts', import.meta.url), 'utf8');

const retiredReducers = [
  'useHands', 'interactPlaceable', 'interactChest', 'toggleCampfire',
  'toggleWorldLantern', 'toggleHeldLantern', 'startCooking', 'collectCooking',
  'cancelCooking', 'sealBarrel', 'eatSelectedFood', 'readRecipeBook',
  'repairSelectedTool', 'harvestChest',
] as const;

const retiredOperatorSurfaces = [
  'grantDebugSkillPoints', 'adjustDebugBackpackSlots', 'debugUsePortal',
  'resetMyQuestProgress', 'grantPlayerGold', 'requestLastConnections',
  'requestBalanceTop', 'adminTeleport', 'adminRelocateHorse',
] as const;

const snake = (value: string): string => value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);

describe('Phase 6 legacy runtime retirement', () => {
  it('has no retired reducer/view export or generated binding', () => {
    for (const name of [...retiredReducers, ...retiredOperatorSurfaces]) {
      expect(worldSource, name).not.toContain(`export const ${name} =`);
      expect(clientSource, name).not.toMatch(new RegExp(`\\b${name}\\s*\\(`, 'u'));
      expect(existsSync(new URL(`${snake(name)}_reducer.ts`, bindingsDirectory)), name).toBe(false);
      expect(existsSync(new URL(`${snake(name)}_view.ts`, bindingsDirectory)), name).toBe(false);
    }
  });

  it('routes game behavior through the two generic authority entrypoints', () => {
    expect(worldSource).toContain('export const interactEntity = spacetimedb.reducer');
    expect(worldSource).toContain('export const useSelected = spacetimedb.reducer');
    expect(clientSource).toContain('interactEntity(');
    expect(clientSource).toContain('useSelected(');
    expect(gameSource).toContain("network.interactEntity('placeable'");
    expect(gameSource).toContain('network.useSelected(');
  });

  it('removes developer mutation controls from the game UI', () => {
    for (const name of ['grantDebugSkillPoints', 'adjustDebugBackpackSlots', 'resetMyQuestProgress']) {
      expect(uiSource, name).not.toContain(name);
    }
    expect(uiSource).toContain('ADMINISTRATION HAS MOVED TO ORCHARD STUDIO.');
  });

  it('retains legacy chest tables for the separately gated additive migration', () => {
    expect(worldSource).toContain("name: 'world_chest'");
    expect(worldSource).toContain("name: 'world_chest_slot'");
    expect(worldSource).toContain("name: 'world_chest_damage'");
  });

  it('uses the committed pack loader as the sole runtime bootstrap seed', () => {
    expect(bootstrapLoaderSource.match(/\.json' with \{ type: 'json' \}/gu)).toHaveLength(28);
    expect(bootstrapRegistrySource).toContain('deepFreeze([...loadBootstrapPackDefinitions()])');
    for (const literal of [
      'ITEM_DEFINITIONS', 'ITEM_ECONOMY', 'MERCHANT_OFFERS', 'RECIPES',
      'CAMPFIRE_COOKING_RECIPES', 'SMELTING_RECIPES', 'CROP_DEFINITIONS',
      'WILDLIFE_DEFINITIONS', 'QUEST_DEFINITIONS', 'EFFECT_DEFINITIONS',
    ]) {
      expect(contentRegistrySource, literal).not.toContain(literal);
    }
    for (const relative of [
      'item-containers.ts', 'commerce.ts', 'recipes.ts', 'food.ts', 'smelting.ts',
      'crops.ts', 'wildlife.ts', 'quests.ts',
      'dialogue.ts', 'spaces.ts', 'skill-trees.ts', 'player-statistics.ts',
      'homestead-upgrades.ts',
    ]) {
      const compatibility = readFileSync(new URL(`../../sim/src/${relative}`, import.meta.url), 'utf8');
      expect(compatibility, relative).toMatch(/from '\.\/content\/bootstrap-(?:pack-loader|projection)\.js'/u);
      expect(compatibility, relative).not.toContain('bootstrapContentRegistry');
    }
    const effects = readFileSync(new URL('../../sim/src/effects.ts', import.meta.url), 'utf8');
    expect(effects).not.toContain('bootstrap');
    expect(effects).not.toContain('EFFECT_DEFINITIONS');
    expect(effects).not.toContain('EFFECT_KINDS');
    const crafting = readFileSync(new URL('../../sim/src/crafting.ts', import.meta.url), 'utf8');
    expect(crafting).toContain("registry: Pick<ContentRegistry, 'objects'>");
    expect(crafting).not.toContain('bootstrap');
    const projection = readFileSync(new URL('../../sim/src/content/bootstrap-projection.ts', import.meta.url), 'utf8');
    expect(projection).toContain("from './bootstrap-pack-loader.js'");
    expect(projection).toContain('compiledProjection(');
    expect(projection).not.toContain('buildContentRegistry');
    for (const relative of [
      '../../sim/src/content/frame-definition.ts',
      '../../sim/src/content/npc-definition.ts',
      '../../sim/src/content/world-definition.ts',
      '../../sim/src/content/balance-definition.ts',
    ]) {
      const parser = readFileSync(new URL(relative, import.meta.url), 'utf8');
      expect(parser, relative).not.toMatch(/export function bootstrap(?:Frame|Npc|Dialogue|Quest|World|Loot|Support)/u);
    }
  });

  it('routes crop authority through the active live content registry', () => {
    expect(worldSource).not.toMatch(/\bcropDefinition(?:ForSeed)?\(/gu);
    expect(worldSource).toContain('runtimeCropDefinition(contentRegistry(ctx), cropKind)');
    expect(worldSource).toContain('runtimeCropDefinitionForSeed(contentRegistry(ctx), selected.itemKind)');
  });

  it('routes quest and dialogue authority through the active live content registry', () => {
    expect(worldSource).not.toMatch(/\bquestDefinition\(/gu);
    expect(worldSource).not.toMatch(/\bdialogueDefinition\(/gu);
    expect(worldSource).toContain('runtimeQuestDefinition(contentRegistry(ctx),');
    expect(worldSource).toContain('runtimeDialogueDefinition(contentRegistry(ctx),');
  });

  it('routes skill and statistic authority through the active live content registry', () => {
    expect(worldSource).not.toMatch(/\bskillNodeDefinition\(/gu);
    expect(worldSource).not.toMatch(/\bskillPurchaseRejection\(/gu);
    expect(worldSource).not.toMatch(/\bplayerStatisticDefinition\(/gu);
    expect(worldSource).toContain('runtimeSkillNodeDefinition(contentRegistry(ctx),');
    expect(worldSource).toContain('runtimeSkillPurchaseRejection(contentRegistry(ctx),');
    expect(worldSource).toContain('runtimeStatisticDefinition(contentRegistry(ctx), kind)');
  });

  it('routes live tool, vigour, and durability policy through authored content', () => {
    expect(worldSource).not.toContain('TOOL_VIGOUR_BALANCE');
    expect(gameSource).not.toContain('TOOL_VIGOUR_BALANCE');
    expect(uiSource).not.toContain('toolDurabilityDefinition');
    expect(worldRulesSource).not.toContain('toolSpecialization(');
    expect(worldRulesSource).toContain('runtimeTool: RuntimeToolDefinition | null');
    expect(worldRulesSource).toContain('registry: ContentRegistry');
    expect(merchantCartSource).not.toContain('normalizeToolDurability');
    expect(worldSource).toContain('runtimeVigourDefinition(registry, itemKind)');
    expect(worldSource).toContain('runtimeDurabilityDefinition(contentRegistry(ctx),');
    expect(gameSource).toContain('runtimeToolDefinition(latestSnapshot.content.registry, itemKind)');
    expect(uiSource).toContain('runtimeDurabilityDefinition(');
  });

  it('routes wildlife policy and generation through the active content registry', () => {
    for (const retired of [
      'resolveCreatureStats', 'wildlifeIsHuntable', 'WILDLIFE_LOOT_PROFILES',
      'WILDLIFE_PANIC_DURATION_TICKS', 'WILDLIFE_PANIC_RADIUS_FIXED',
      'stepAmbientWildlife(', 'stepPanickedWildlife(', 'knockbackWildlife(',
      'wildlifeMovementMedium(', 'wildlifeEatsHay(', 'generateSurvivalWildlife(',
    ]) expect(worldSource, retired).not.toContain(retired);
    expect(worldSource).toContain('generateSurvivalWildlifeForRegistry(wildlifeRegistry');
    expect(worldSource).toContain('runtimeResolveCreatureStats(');
    expect(worldSource).toContain('runtimeCreatureIsHuntable(');
    expect(worldSource).toContain('definitionId: creatureDefinition.id');
    expect(gameSource).toContain('runtimeCreatureIsHuntable(');
    expect(gameSource).toContain('runtimeResolveCreatureStats(');
    expect(existsSync(new URL('../../sim/src/content/loot-bootstrap.ts', import.meta.url))).toBe(false);
    expect(simIndexSource).not.toContain("./content/loot-bootstrap.js");
  });

  it('routes admin item mutations through an injected fail-closed content policy', () => {
    for (const source of [adminInventorySource, adminObjectsSource]) {
      expect(source).not.toMatch(/\bitemDefinition\(/gu);
      expect(source).not.toMatch(/\bisUniqueQuestItemKind\(/gu);
      expect(source).toContain('request.itemPolicy ?? FAIL_CLOSED_ITEM_POLICY');
    }
    expect(adminInventorySource).toContain('insertItemStackPartial(');
    expect(adminInventorySource).toContain('itemPolicy,');
    expect(itemContainersSource).toContain('definition?.retired === true');
  });
});
