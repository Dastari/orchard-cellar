export const SKILL_TRACKS = ['combat', 'explorer', 'farming'] as const;
export type SkillTrack = (typeof SKILL_TRACKS)[number];

export const SKILL_LEVEL_CAP = 50;

export interface SkillNodeDefinition {
  readonly id: string;
  readonly track: SkillTrack;
  readonly name: string;
  readonly description: string;
  readonly position: readonly [x: number, y: number];
  readonly connects: readonly string[];
  readonly maxRank: number;
  readonly pointCost: number;
  readonly requiresLevel?: number;
  readonly root?: boolean;
}

const nodes = [
  // Explorer — movement, discovery, and creature comforts.
  { id: 'explorer_root', track: 'explorer', name: 'Wanderlust', description: 'The road begins here.', position: [0, 0], connects: ['trailblazer', 'measured_stride', 'keen_senses'], maxRank: 0, pointCost: 0, root: true },
  { id: 'trailblazer', track: 'explorer', name: 'Trailblazer', description: 'Planned: gain 2% more top speed while running per rank.', position: [-92, -52], connects: ['explorer_root', 'pathfinder', 'surefooted'], maxRank: 5, pointCost: 1 },
  { id: 'measured_stride', track: 'explorer', name: 'Measured Stride', description: 'Planned: running consumes 6% less Vigour per rank.', position: [0, -92], connects: ['explorer_root', 'second_wind', 'night_eyes'], maxRank: 3, pointCost: 1 },
  { id: 'keen_senses', track: 'explorer', name: 'Keen Senses', description: 'Planned: notice hidden caves and secret passages from farther away.', position: [92, -52], connects: ['explorer_root', 'cave_whisperer', 'field_notes'], maxRank: 3, pointCost: 1 },
  { id: 'pathfinder', track: 'explorer', name: 'Pathfinder', description: 'Planned: move faster on roads, tracks, and well-worn paths.', position: [-158, -112], connects: ['trailblazer', 'horizon_chaser'], maxRank: 3, pointCost: 1, requiresLevel: 3 },
  { id: 'surefooted', track: 'explorer', name: 'Surefooted', description: 'Planned: jump narrow streams, cracks, and other small gaps.', position: [-154, 24], connects: ['trailblazer', 'steeplechase'], maxRank: 1, pointCost: 2, requiresLevel: 4 },
  { id: 'second_wind', track: 'explorer', name: 'Second Wind', description: 'Planned: recover Vigour sooner after a long run.', position: [-48, -164], connects: ['measured_stride', 'horizon_chaser'], maxRank: 3, pointCost: 1, requiresLevel: 3 },
  { id: 'night_eyes', track: 'explorer', name: 'Night Eyes', description: 'Planned: see farther in darkness and notice dim landmarks.', position: [50, -164], connects: ['measured_stride', 'cave_whisperer'], maxRank: 3, pointCost: 1, requiresLevel: 3 },
  { id: 'cave_whisperer', track: 'explorer', name: 'Cave Whisperer', description: 'Planned: reveal subtler signs of hidden caves on the landscape.', position: [158, -112], connects: ['keen_senses', 'night_eyes', 'cartographer'], maxRank: 1, pointCost: 2, requiresLevel: 5 },
  { id: 'field_notes', track: 'explorer', name: 'Field Notes', description: 'Planned: discoveries grant more Explorer experience.', position: [154, 24], connects: ['keen_senses', 'deep_pockets'], maxRank: 3, pointCost: 1, requiresLevel: 4 },
  { id: 'steeplechase', track: 'explorer', name: 'Steeplechase', description: 'Planned: mounted companions can clear larger obstacles.', position: [-176, 96], connects: ['surefooted', 'deep_pockets'], maxRank: 1, pointCost: 2, requiresLevel: 8 },
  { id: 'horizon_chaser', track: 'explorer', name: 'Horizon Chaser', description: 'Planned: keep full running speed for longer journeys.', position: [-92, -218], connects: ['pathfinder', 'second_wind', 'cartographer'], maxRank: 1, pointCost: 3, requiresLevel: 10 },
  { id: 'cartographer', track: 'explorer', name: 'Cartographer', description: 'Planned: record discovered routes, caves, and destinations.', position: [94, -218], connects: ['cave_whisperer', 'horizon_chaser', 'deep_pockets'], maxRank: 1, pointCost: 3, requiresLevel: 10 },
  { id: 'deep_pockets', track: 'explorer', name: 'Deep Pockets', description: 'Planned: unlock additional carried-storage space.', position: [176, 96], connects: ['field_notes', 'steeplechase', 'cartographer'], maxRank: 4, pointCost: 1, requiresLevel: 8 },

  // Combat — weapon mastery and deliberate build choices.
  { id: 'combat_root', track: 'combat', name: 'Readiness', description: 'Keep your footing and choose your opening.', position: [0, 0], connects: ['archery_basics', 'blade_training', 'battle_conditioning'], maxRank: 0, pointCost: 0, root: true },
  { id: 'archery_basics', track: 'combat', name: 'Archery Basics', description: 'Planned: deal 3% more damage with arrows per rank.', position: [-92, -52], connects: ['combat_root', 'steady_draw', 'critical_eye'], maxRank: 5, pointCost: 1 },
  { id: 'blade_training', track: 'combat', name: 'Blade Training', description: 'Planned: deal 3% more damage with swords per rank.', position: [92, -52], connects: ['combat_root', 'quick_recovery', 'power_swing'], maxRank: 5, pointCost: 1 },
  { id: 'battle_conditioning', track: 'combat', name: 'Battle Conditioning', description: 'Planned: weapon attacks consume less Vigour per rank.', position: [0, 86], connects: ['combat_root', 'shield_discipline', 'battle_hardened'], maxRank: 4, pointCost: 1 },
  { id: 'steady_draw', track: 'combat', name: 'Steady Draw', description: 'Planned: reach full bow charge sooner without losing range.', position: [-154, -126], connects: ['archery_basics', 'piercing_shot'], maxRank: 3, pointCost: 1, requiresLevel: 3 },
  { id: 'critical_eye', track: 'combat', name: 'Critical Eye', description: 'Planned: improve ranged critical-strike chance per rank.', position: [-166, 26], connects: ['archery_basics', 'multishot'], maxRank: 3, pointCost: 1, requiresLevel: 4 },
  { id: 'quick_recovery', track: 'combat', name: 'Quick Recovery', description: 'Planned: shorten the recovery after a sword swing.', position: [154, -126], connects: ['blade_training', 'blade_dancer'], maxRank: 3, pointCost: 1, requiresLevel: 3 },
  { id: 'power_swing', track: 'combat', name: 'Power Swing', description: 'Planned: charge a heavy melee attack that breaks guard.', position: [166, 26], connects: ['blade_training', 'blade_dancer'], maxRank: 1, pointCost: 2, requiresLevel: 5 },
  { id: 'shield_discipline', track: 'combat', name: 'Shield Discipline', description: 'Planned: equip and actively guard with an off-hand shield.', position: [-92, 150], connects: ['battle_conditioning', 'battle_hardened'], maxRank: 1, pointCost: 2, requiresLevel: 5 },
  { id: 'battle_hardened', track: 'combat', name: 'Battle Hardened', description: 'Planned: gain Health and resist interruption per rank.', position: [92, 150], connects: ['battle_conditioning', 'shield_discipline', 'blade_dancer'], maxRank: 3, pointCost: 1, requiresLevel: 6 },
  { id: 'piercing_shot', track: 'combat', name: 'Piercing Shot', description: 'Planned: arrows retain damage through armoured targets.', position: [-86, -210], connects: ['steady_draw', 'perfect_volley'], maxRank: 1, pointCost: 3, requiresLevel: 9 },
  { id: 'multishot', track: 'combat', name: 'Multishot', description: 'Planned: loose a fan of arrows at additional ammo and Vigour cost.', position: [-214, 92], connects: ['critical_eye', 'perfect_volley'], maxRank: 1, pointCost: 3, requiresLevel: 10 },
  { id: 'blade_dancer', track: 'combat', name: 'Blade Dancer', description: 'Planned: consecutive sword hits build a short damage rhythm.', position: [194, 112], connects: ['quick_recovery', 'power_swing', 'battle_hardened'], maxRank: 1, pointCost: 3, requiresLevel: 10 },
  { id: 'perfect_volley', track: 'combat', name: 'Perfect Volley', description: 'Planned: fully charged shots can trigger a devastating volley.', position: [-174, -194], connects: ['piercing_shot', 'multishot'], maxRank: 1, pointCost: 4, requiresLevel: 15 },

  // Farming — soil, harvests, orchards, and farm automation.
  { id: 'farming_root', track: 'farming', name: 'Cultivator', description: 'Good harvests begin with patient hands.', position: [0, 0], connects: ['green_thumb', 'tender_hand', 'farmcraft'], maxRank: 0, pointCost: 0, root: true },
  { id: 'green_thumb', track: 'farming', name: 'Green Thumb', description: 'Planned: improve crop yield by 3% per rank.', position: [-92, -52], connects: ['farming_root', 'seed_saver', 'bountiful_harvest'], maxRank: 5, pointCost: 1 },
  { id: 'tender_hand', track: 'farming', name: 'Tender Hand', description: 'Planned: watering remains effective longer per rank.', position: [0, -92], connects: ['farming_root', 'soil_whisperer', 'grafting'], maxRank: 3, pointCost: 1 },
  { id: 'farmcraft', track: 'farming', name: 'Farmcraft', description: 'Planned: use farm stations with less wear and Vigour.', position: [92, -52], connects: ['farming_root', 'barreling', 'beekeeping'], maxRank: 3, pointCost: 1 },
  { id: 'seed_saver', track: 'farming', name: 'Seed Saver', description: 'Planned: harvested crops sometimes return extra seed.', position: [-154, -126], connects: ['green_thumb', 'master_grower'], maxRank: 3, pointCost: 1, requiresLevel: 3 },
  { id: 'bountiful_harvest', track: 'farming', name: 'Bountiful Harvest', description: 'Planned: occasionally gather an extra crop bundle.', position: [-166, 26], connects: ['green_thumb', 'sprinkler_engineering'], maxRank: 3, pointCost: 1, requiresLevel: 4 },
  { id: 'soil_whisperer', track: 'farming', name: 'Soil Whisperer', description: 'Planned: read soil moisture and crop needs at a glance.', position: [-48, -164], connects: ['tender_hand', 'master_grower'], maxRank: 1, pointCost: 2, requiresLevel: 4 },
  { id: 'grafting', track: 'farming', name: 'Grafting', description: 'Planned: improve and specialize mature orchard trees.', position: [50, -164], connects: ['tender_hand', 'greenhouse_charter'], maxRank: 1, pointCost: 2, requiresLevel: 6 },
  { id: 'barreling', track: 'farming', name: 'Barreling', description: 'Planned: unlock curing and preserving in farm barrels.', position: [154, -126], connects: ['farmcraft', 'greenhouse_charter'], maxRank: 1, pointCost: 2, requiresLevel: 5 },
  { id: 'beekeeping', track: 'farming', name: 'Beekeeping', description: 'Planned: tend hives and improve honey harvests.', position: [166, 26], connects: ['farmcraft', 'sprinkler_engineering'], maxRank: 1, pointCost: 2, requiresLevel: 5 },
  { id: 'sprinkler_engineering', track: 'farming', name: 'Sprinkler Engineering', description: 'Planned: unlock purchase and placement of farm sprinklers.', position: [194, 112], connects: ['bountiful_harvest', 'beekeeping', 'harvest_festival'], maxRank: 1, pointCost: 3, requiresLevel: 10 },
  { id: 'greenhouse_charter', track: 'farming', name: 'Greenhouse Charter', description: 'Planned: unlock a greenhouse homestead upgrade.', position: [94, -218], connects: ['grafting', 'barreling', 'harvest_festival'], maxRank: 1, pointCost: 3, requiresLevel: 10 },
  { id: 'master_grower', track: 'farming', name: 'Master Grower', description: 'Planned: reduce poor-weather and out-of-season growth penalties.', position: [-92, -218], connects: ['seed_saver', 'soil_whisperer', 'harvest_festival'], maxRank: 1, pointCost: 3, requiresLevel: 10 },
  { id: 'harvest_festival', track: 'farming', name: 'Harvest Festival', description: 'Planned: the first harvest of each day gains a major yield bonus.', position: [0, -270], connects: ['sprinkler_engineering', 'greenhouse_charter', 'master_grower'], maxRank: 1, pointCost: 4, requiresLevel: 15 },
] as const satisfies readonly SkillNodeDefinition[];

export const SKILL_NODE_DEFINITIONS: readonly SkillNodeDefinition[] = nodes;
const SKILL_NODE_BY_ID = new Map<string, SkillNodeDefinition>(nodes.map((node) => [node.id, node]));

export function isSkillTrack(value: string): value is SkillTrack {
  return (SKILL_TRACKS as readonly string[]).includes(value);
}

export function skillNodeDefinition(id: string): SkillNodeDefinition | null {
  return SKILL_NODE_BY_ID.get(id) ?? null;
}

export function skillNodesForTrack(track: SkillTrack): readonly SkillNodeDefinition[] {
  return nodes.filter((node) => node.track === track);
}

/** Total XP threshold for reaching `level`. Level zero always starts at zero. */
export function skillExperienceForLevel(level: number): bigint {
  const normalized = Math.max(0, Math.min(SKILL_LEVEL_CAP, Math.floor(level)));
  return BigInt(Math.floor(100 * normalized ** 1.7));
}

export function skillLevelForExperience(experience: bigint): number {
  const normalized = experience < 0n ? 0n : experience;
  let level = 0;
  while (level < SKILL_LEVEL_CAP && normalized >= skillExperienceForLevel(level + 1)) level += 1;
  return level;
}

export function availableSkillPoints(experience: bigint, spentPoints: number, bonusPoints = 0): number {
  return Math.max(0, skillLevelForExperience(experience) + Math.max(0, bonusPoints) - Math.max(0, spentPoints));
}

export function skillRespecCostBronze(respecCount: number): bigint {
  const ladder = [0n, 100n, 500n, 2_500n, 10_000n] as const;
  return ladder[Math.max(0, Math.min(ladder.length - 1, Math.floor(respecCount)))] ?? 10_000n;
}

export interface SkillPurchaseState {
  readonly experience: bigint;
  readonly spentPoints: number;
  readonly bonusPoints: number;
  readonly ranks: Readonly<Record<string, number>>;
}

export type SkillPurchaseRejection =
  | 'skill_not_found'
  | 'skill_root_owned'
  | 'skill_rank_maxed'
  | 'skill_level_required'
  | 'skill_not_connected'
  | 'skill_points_required';

export function skillPurchaseRejection(
  nodeId: string,
  state: SkillPurchaseState,
): SkillPurchaseRejection | null {
  const node = skillNodeDefinition(nodeId);
  if (node === null) return 'skill_not_found';
  if (node.root === true) return 'skill_root_owned';
  const currentRank = Math.max(0, state.ranks[node.id] ?? 0);
  if (currentRank >= node.maxRank) return 'skill_rank_maxed';
  if (skillLevelForExperience(state.experience) < (node.requiresLevel ?? 0)) return 'skill_level_required';
  const connected = node.connects.some((id) => {
    const neighbour = skillNodeDefinition(id);
    return neighbour?.root === true || (state.ranks[id] ?? 0) > 0;
  });
  if (!connected) return 'skill_not_connected';
  if (availableSkillPoints(state.experience, state.spentPoints, state.bonusPoints) < node.pointCost) {
    return 'skill_points_required';
  }
  return null;
}
