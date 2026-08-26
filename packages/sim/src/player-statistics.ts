export type PlayerStatisticCategory =
  | 'account'
  | 'social'
  | 'exploration'
  | 'items'
  | 'crafting'
  | 'commerce'
  | 'farming'
  | 'world'
  | 'tools'
  | 'creatures'
  | 'combat'
  | 'future';

export type PlayerStatisticUnit =
  | 'count'
  | 'authority_ticks'
  | 'fixed_distance'
  | 'bronze'
  | 'durability'
  | 'damage';

export type PlayerStatisticAggregation = 'counter' | 'maximum';

export type PlayerStatisticSubject =
  | 'none'
  | 'chat_kind'
  | 'movement_mode'
  | 'item_kind'
  | 'resource_kind'
  | 'tool_kind'
  | 'npc_kind'
  | 'hit_kind'
  | 'transaction_kind'
  | 'crop_kind'
  | 'fish_kind'
  | 'creature_kind'
  | 'damage_kind'
  | 'quest_kind';

export interface PlayerStatisticDefinition {
  readonly name: string;
  readonly description: string;
  readonly category: PlayerStatisticCategory;
  readonly unit: PlayerStatisticUnit;
  readonly aggregation: PlayerStatisticAggregation;
  readonly subject: PlayerStatisticSubject;
  readonly milestones: readonly bigint[];
  /** Reserved definitions document a required future hook without pretending
   * that the corresponding gameplay verb already exists. */
  readonly reserved?: boolean;
}

const COUNT_MILESTONES = [1n, 10n, 50n, 100n, 500n, 1_000n, 10_000n] as const;
const RARE_COUNT_MILESTONES = [1n, 5n, 10n, 25n, 50n, 100n] as const;
// TILE_SIZE_FIXED is 4,096: 100 / 1,000 / 10,000 / 100,000 travelled tiles.
const DISTANCE_MILESTONES = [409_600n, 4_096_000n, 40_960_000n, 409_600_000n] as const;
const JUMP_DISTANCE_MILESTONES = [4_096n, 8_192n, 12_288n, 16_384n] as const;
const PLAY_TIME_MILESTONES = [1_200n, 72_000n, 720_000n, 7_200_000n] as const;
const MONEY_MILESTONES = [100n, 1_000n, 10_000n, 100_000n, 1_000_000n] as const;

/**
 * The canonical registry for lifetime player statistics. New authority-owned
 * gameplay verbs must either record one or more registered definitions here,
 * or document why they have no persistent player outcome. Do not invent raw
 * string keys in reducers: that would make typos permanent database state.
 */
export const PLAYER_STATISTIC_DEFINITIONS = {
  time_played: { name: 'Time Played', description: 'Authority ticks spent in an active world session.', category: 'account', unit: 'authority_ticks', aggregation: 'counter', subject: 'none', milestones: PLAY_TIME_MILESTONES },
  connections_opened: { name: 'Connections Opened', description: 'Authenticated game connections accepted by the world.', category: 'account', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  world_entries: { name: 'World Entries', description: 'Play sessions started after the player had no active connection.', category: 'account', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },

  messages_sent: { name: 'Messages Sent', description: 'Accepted channel, whisper, say, and shout messages, split by kind.', category: 'social', unit: 'count', aggregation: 'counter', subject: 'chat_kind', milestones: COUNT_MILESTONES },
  chat_channels_created: { name: 'Chat Channels Created', description: 'Player-owned chat channels created.', category: 'social', unit: 'count', aggregation: 'counter', subject: 'none', milestones: RARE_COUNT_MILESTONES },
  chat_channels_joined: { name: 'Chat Channels Joined', description: 'Existing non-default chat channels joined.', category: 'social', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  chat_invitations_sent: { name: 'Chat Invitations Sent', description: 'Players successfully invited to private channels.', category: 'social', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  character_names_chosen: { name: 'Character Names Chosen', description: 'Permanent character names successfully chosen.', category: 'account', unit: 'count', aggregation: 'counter', subject: 'none', milestones: [1n] },
  npc_interactions: { name: 'NPC Conversations Started', description: 'Authority-approved conversations started, split by NPC kind.', category: 'social', unit: 'count', aggregation: 'counter', subject: 'npc_kind', milestones: COUNT_MILESTONES },
  dialogue_choices: { name: 'Dialogue Choices', description: 'Dialogue choices accepted by the authority.', category: 'social', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },

  distance_travelled: { name: 'Distance Travelled', description: 'Authoritative fixed-point distance travelled, split between foot and horse.', category: 'exploration', unit: 'fixed_distance', aggregation: 'counter', subject: 'movement_mode', milestones: DISTANCE_MILESTONES },
  horse_mounts: { name: 'Horses Mounted', description: 'Successful horse mounts.', category: 'exploration', unit: 'count', aggregation: 'counter', subject: 'none', milestones: RARE_COUNT_MILESTONES },
  horse_dismounts: { name: 'Horse Dismounts', description: 'Successful horse dismounts.', category: 'exploration', unit: 'count', aggregation: 'counter', subject: 'none', milestones: RARE_COUNT_MILESTONES },
  horse_jumps: { name: 'Horse Jumps', description: 'Successful horse jumps over terrain blockers.', category: 'exploration', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  longest_horse_jump: { name: 'Longest Horse Jump', description: 'Longest authoritative horse jump distance.', category: 'exploration', unit: 'fixed_distance', aggregation: 'maximum', subject: 'none', milestones: JUMP_DISTANCE_MILESTONES },
  admin_teleports: { name: 'Admin Teleports', description: 'Successful owner teleport commands.', category: 'exploration', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },

  items_obtained: { name: 'Items Obtained', description: 'Item units added through pickup, gathering, crafting, trade, or harvest.', category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  items_picked_up: { name: 'Ground Items Picked Up', description: 'Item units recovered from world drops.', category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  items_dropped: { name: 'Items Dropped', description: 'Item units deliberately dropped into the world.', category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  resources_gathered: { name: 'Resources Gathered by Hand', description: 'Loose renewable resources gathered directly, split by world resource.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'resource_kind', milestones: COUNT_MILESTONES },
  forage_bonus_items: { name: 'Lucky Forage Finds', description: 'Extra item units awarded by a successful Wisdom forage check.', category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  resource_hits: { name: 'Resource Hits', description: 'Successful tool hits against world resources, split by resource kind.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'resource_kind', milestones: COUNT_MILESTONES },
  resources_depleted: { name: 'Resources Depleted', description: 'World resources fully depleted by the player, split by resource kind.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'resource_kind', milestones: RARE_COUNT_MILESTONES },
  trees_cut_down: { name: 'Trees Cut Down', description: 'Deciduous, conifer, or fruit trees fully felled.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  rocks_broken: { name: 'Rocks Broken', description: 'Ordinary stone resources fully broken.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  ore_nodes_depleted: { name: 'Ore Nodes Depleted', description: 'Ore or gem nodes fully mined.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'resource_kind', milestones: RARE_COUNT_MILESTONES },

  tool_uses: { name: 'Tool Uses', description: 'Successful world-changing uses, split by tool kind.', category: 'tools', unit: 'count', aggregation: 'counter', subject: 'tool_kind', milestones: COUNT_MILESTONES },
  tool_whiffs: { name: 'Tool Whiffs', description: 'Authority-accepted swings that did not target a resource.', category: 'tools', unit: 'count', aggregation: 'counter', subject: 'tool_kind', milestones: COUNT_MILESTONES },
  tools_repaired: { name: 'Tools Repaired', description: 'Tools restored to full durability, split by kind.', category: 'tools', unit: 'count', aggregation: 'counter', subject: 'tool_kind', milestones: COUNT_MILESTONES },
  tools_broken: { name: 'Tools Worn Out', description: 'Tools reduced from usable to zero durability, split by kind.', category: 'tools', unit: 'count', aggregation: 'counter', subject: 'tool_kind', milestones: COUNT_MILESTONES },
  durability_restored: { name: 'Durability Restored', description: 'Total durability points restored, split by tool kind.', category: 'tools', unit: 'durability', aggregation: 'counter', subject: 'tool_kind', milestones: COUNT_MILESTONES },
  arrows_fired: { name: 'Arrows Fired', description: 'Valid arrows fired from a bow.', category: 'tools', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  arrows_hit: { name: 'Arrow Impacts', description: 'Arrow impacts, split by entity or terrain hit kind.', category: 'tools', unit: 'count', aggregation: 'counter', subject: 'hit_kind', milestones: COUNT_MILESTONES },

  farm_tiles_tilled: { name: 'Farm Tiles Tilled', description: 'Grass tiles converted to farmland.', category: 'farming', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  farm_tiles_watered: { name: 'Farm Tiles Watered', description: 'Farmland or crop tiles watered.', category: 'farming', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  farm_tiles_restored: { name: 'Farm Tiles Restored', description: 'Tilled soil returned to grass.', category: 'farming', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  crops_planted: { name: 'Crops Planted', description: 'Crop patches planted, split by crop kind when crops gain varieties.', category: 'farming', unit: 'count', aggregation: 'counter', subject: 'crop_kind', milestones: COUNT_MILESTONES },
  crops_harvested: { name: 'Crops Harvested', description: 'Crop patches harvested, split by crop kind when crops gain varieties.', category: 'farming', unit: 'count', aggregation: 'counter', subject: 'crop_kind', milestones: COUNT_MILESTONES },
  orchard_trees_tended: { name: 'Orchard Trees Tended', description: 'Successful care actions on orchard trees.', category: 'farming', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  orchard_tea_consumed: { name: 'Orchard Tea Consumed', description: 'Jars of Orchard Tea consumed.', category: 'farming', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },

  crafting_actions: { name: 'Crafting Actions', description: 'Successful recipe executions.', category: 'crafting', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  items_crafted: { name: 'Items Crafted', description: 'Output item units crafted, split by item kind.', category: 'crafting', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  largest_craft_batch: { name: 'Largest Craft Batch', description: 'Largest quantity produced by one crafting request.', category: 'crafting', unit: 'count', aggregation: 'maximum', subject: 'item_kind', milestones: COUNT_MILESTONES },
  placeables_placed: { name: 'Placeables Placed', description: 'Crafted placeable items committed to the world, split by item kind.', category: 'crafting', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  merchant_transactions: { name: 'Merchant Transactions', description: 'Completed purchases and sales, split by transaction kind.', category: 'commerce', unit: 'count', aggregation: 'counter', subject: 'transaction_kind', milestones: COUNT_MILESTONES },
  items_bought: { name: 'Items Bought', description: 'Item units bought, split by item kind.', category: 'commerce', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  items_sold: { name: 'Items Sold', description: 'Item units sold, split by item kind.', category: 'commerce', unit: 'count', aggregation: 'counter', subject: 'item_kind', milestones: COUNT_MILESTONES },
  bronze_spent: { name: 'Bronze Spent', description: 'Lifetime merchant spending in bronze-equivalent units.', category: 'commerce', unit: 'bronze', aggregation: 'counter', subject: 'none', milestones: MONEY_MILESTONES },
  bronze_earned: { name: 'Bronze Earned', description: 'Lifetime merchant revenue in bronze-equivalent units.', category: 'commerce', unit: 'bronze', aggregation: 'counter', subject: 'none', milestones: MONEY_MILESTONES },

  chests_placed: { name: 'Chests Placed', description: 'Chests placed into the world.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'none', milestones: RARE_COUNT_MILESTONES },
  chests_opened: { name: 'Chests Opened', description: 'Placed chests opened.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'none', milestones: COUNT_MILESTONES },
  chests_picked_up: { name: 'Chests Picked Up', description: 'Placed chests lifted or returned to inventory.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'none', milestones: RARE_COUNT_MILESTONES },
  chests_broken: { name: 'Chests Broken', description: 'Placed chests destroyed with an axe.', category: 'world', unit: 'count', aggregation: 'counter', subject: 'none', milestones: RARE_COUNT_MILESTONES },

  damage_dealt: { name: 'Damage Dealt', description: 'Future authoritative outgoing damage, split by creature kind.', category: 'combat', unit: 'damage', aggregation: 'counter', subject: 'creature_kind', milestones: COUNT_MILESTONES, reserved: true },
  damage_taken: { name: 'Damage Taken', description: 'Future authoritative incoming damage, split by damage kind.', category: 'combat', unit: 'damage', aggregation: 'counter', subject: 'damage_kind', milestones: COUNT_MILESTONES, reserved: true },
  enemies_defeated: { name: 'Enemies Defeated', description: 'Future hostile creatures defeated, split by creature kind.', category: 'combat', unit: 'count', aggregation: 'counter', subject: 'creature_kind', milestones: COUNT_MILESTONES, reserved: true },
  times_knocked_out: { name: 'Times Knocked Out', description: 'Future cozy knockouts at zero Health.', category: 'combat', unit: 'count', aggregation: 'counter', subject: 'none', milestones: RARE_COUNT_MILESTONES, reserved: true },
  fish_caught: { name: 'Fish Caught', description: 'Future caught fish, split by fish kind.', category: 'future', unit: 'count', aggregation: 'counter', subject: 'fish_kind', milestones: COUNT_MILESTONES, reserved: true },
  quests_completed: { name: 'Quests Completed', description: 'Future completed quests, split by quest kind.', category: 'future', unit: 'count', aggregation: 'counter', subject: 'quest_kind', milestones: RARE_COUNT_MILESTONES, reserved: true },
} as const satisfies Readonly<Record<string, PlayerStatisticDefinition>>;

export type PlayerStatisticKind = keyof typeof PLAYER_STATISTIC_DEFINITIONS;

export const MAX_PLAYER_STATISTIC_VALUE = (1n << 64n) - 1n;

export function playerStatisticDefinition(kind: string): PlayerStatisticDefinition | null {
  return Object.prototype.hasOwnProperty.call(PLAYER_STATISTIC_DEFINITIONS, kind)
    ? PLAYER_STATISTIC_DEFINITIONS[kind as PlayerStatisticKind]
    : null;
}

export function statisticSubjectIsValid(kind: PlayerStatisticKind, subjectKind: string): boolean {
  const definition = PLAYER_STATISTIC_DEFINITIONS[kind];
  if (definition.subject === 'none') return subjectKind === '';
  if (subjectKind.trim().length === 0) return false;
  if (definition.subject === 'chat_kind') {
    return ['channel', 'whisper', 'say', 'shout'].includes(subjectKind);
  }
  if (definition.subject === 'movement_mode') return subjectKind === 'foot' || subjectKind === 'horse';
  if (definition.subject === 'transaction_kind') return subjectKind === 'buy' || subjectKind === 'sell';
  return true;
}

export function statisticValueAfter(
  kind: PlayerStatisticKind,
  current: bigint,
  input: bigint,
): bigint {
  if (current < 0n || input < 0n) throw new Error('invalid_statistic_value');
  const definition = PLAYER_STATISTIC_DEFINITIONS[kind];
  if (definition.aggregation === 'maximum') return input > current ? input : current;
  const total = current + input;
  return total > MAX_PLAYER_STATISTIC_VALUE ? MAX_PLAYER_STATISTIC_VALUE : total;
}

export function statisticMilestonesCrossed(
  kind: PlayerStatisticKind,
  previous: bigint,
  next: bigint,
): readonly bigint[] {
  if (previous < 0n || next < previous) throw new Error('invalid_statistic_range');
  return PLAYER_STATISTIC_DEFINITIONS[kind].milestones
    .filter((threshold) => threshold > previous && threshold <= next);
}
