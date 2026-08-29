export const RENDER_BENCHMARK_SCENARIO_IDS = [
  'day-clear-baseline',
  'new-moon-player-lantern-dense-trees',
  'sixteen-steady-lights-one-moving-light',
  'forty-maximum-radius-blocked-lights',
  'rain-with-500-world-items',
  'three-level-nested-cliffs',
  'eight-level-two-channel-light-capacity',
  'repeated-cellar-excavation',
  'fifty-space-transitions',
  'cold-atlas-load',
] as const;

export type RenderBenchmarkScenarioId = (typeof RENDER_BENCHMARK_SCENARIO_IDS)[number];
export type BenchmarkWeather = 'clear' | 'rain';

export interface RenderBenchmarkScenario {
  readonly id: RenderBenchmarkScenarioId;
  readonly seed: number;
  readonly space: 'overworld' | 'homestead' | 'cellar' | 'synthetic';
  readonly cameraTileX: number;
  readonly cameraTileY: number;
  readonly clockTime: string;
  readonly lunarIlluminationPerMille: number;
  readonly weather: BenchmarkWeather;
  readonly steadyLightCount: number;
  readonly movingLightCount: number;
  readonly lightRadiusTiles: number;
  readonly worldItemCount: number;
  readonly elevationLevels: number;
  readonly lightChannels: number;
  readonly transitionCount: number;
  readonly excavationCount: number;
  readonly coldAssetLoad: boolean;
  readonly fixedRenderAlpha: number;
}

const COMMON = {
  seed: 0x47_2026,
  space: 'synthetic',
  cameraTileX: 96,
  cameraTileY: 96,
  clockTime: '12:00',
  lunarIlluminationPerMille: 1000,
  weather: 'clear',
  steadyLightCount: 0,
  movingLightCount: 0,
  lightRadiusTiles: 0,
  worldItemCount: 0,
  elevationLevels: 1,
  lightChannels: 1,
  transitionCount: 0,
  excavationCount: 0,
  coldAssetLoad: false,
  fixedRenderAlpha: 0.5,
} as const;

export const RENDER_BENCHMARK_SCENARIOS: Readonly<Record<
RenderBenchmarkScenarioId,
RenderBenchmarkScenario
>> = {
  'day-clear-baseline': {
    ...COMMON,
    id: 'day-clear-baseline',
    space: 'overworld',
  },
  'new-moon-player-lantern-dense-trees': {
    ...COMMON,
    id: 'new-moon-player-lantern-dense-trees',
    space: 'overworld',
    clockTime: '03:51',
    lunarIlluminationPerMille: 0,
    movingLightCount: 1,
    lightRadiusTiles: 9,
    worldItemCount: 240,
  },
  'sixteen-steady-lights-one-moving-light': {
    ...COMMON,
    id: 'sixteen-steady-lights-one-moving-light',
    clockTime: '23:00',
    steadyLightCount: 16,
    movingLightCount: 1,
    lightRadiusTiles: 12,
  },
  'forty-maximum-radius-blocked-lights': {
    ...COMMON,
    id: 'forty-maximum-radius-blocked-lights',
    clockTime: '23:00',
    steadyLightCount: 40,
    lightRadiusTiles: 12,
    worldItemCount: 300,
  },
  'rain-with-500-world-items': {
    ...COMMON,
    id: 'rain-with-500-world-items',
    space: 'overworld',
    weather: 'rain',
    worldItemCount: 500,
  },
  'three-level-nested-cliffs': {
    ...COMMON,
    id: 'three-level-nested-cliffs',
    space: 'overworld',
    clockTime: '23:00',
    steadyLightCount: 3,
    lightRadiusTiles: 12,
    elevationLevels: 3,
  },
  'eight-level-two-channel-light-capacity': {
    ...COMMON,
    id: 'eight-level-two-channel-light-capacity',
    clockTime: '23:00',
    steadyLightCount: 16,
    lightRadiusTiles: 12,
    elevationLevels: 8,
    lightChannels: 2,
  },
  'repeated-cellar-excavation': {
    ...COMMON,
    id: 'repeated-cellar-excavation',
    space: 'cellar',
    excavationCount: 100,
  },
  'fifty-space-transitions': {
    ...COMMON,
    id: 'fifty-space-transitions',
    transitionCount: 50,
  },
  'cold-atlas-load': {
    ...COMMON,
    id: 'cold-atlas-load',
    space: 'overworld',
    coldAssetLoad: true,
  },
};

export function renderBenchmarkScenario(id: RenderBenchmarkScenarioId): RenderBenchmarkScenario {
  return RENDER_BENCHMARK_SCENARIOS[id];
}
