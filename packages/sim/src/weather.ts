import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON, authorityDayIndex, authorityDayProgress } from './time.js';

export const WEATHER_MODES = ['auto', 'rain', 'clear', 'cloudy', 'wind'] as const;
export type WeatherMode = (typeof WEATHER_MODES)[number];
export const WIND_DIRECTION_MODES = ['auto', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type WindDirectionMode = (typeof WIND_DIRECTION_MODES)[number];

export interface WeatherVisualState {
  readonly raining: boolean;
  /** Opacity multiplier for authored cloud-shadow sprites. */
  readonly cloudShadow: number;
  /** Normalized strength used by wind gusts and vegetation particles. */
  readonly wind: number;
  /** Normalized top-down direction shared by shadows, vegetation, and debris. */
  readonly windDirectionX: number;
  readonly windDirectionY: number;
}

const DIAGONAL = Math.SQRT1_2;
const WIND_VECTORS: Readonly<Record<Exclude<WindDirectionMode, 'auto'>, readonly [number, number]>> = {
  n: [0, -1], ne: [DIAGONAL, -DIAGONAL], e: [1, 0], se: [DIAGONAL, DIAGONAL],
  s: [0, 1], sw: [-DIAGONAL, DIAGONAL], w: [-1, 0], nw: [-DIAGONAL, -DIAGONAL],
};

export function isWindDirectionMode(value: string): value is WindDirectionMode {
  return WIND_DIRECTION_MODES.includes(value as WindDirectionMode);
}

export function nextWindDirectionMode(mode: WindDirectionMode): WindDirectionMode {
  const index = WIND_DIRECTION_MODES.indexOf(mode);
  return WIND_DIRECTION_MODES[(index + 1) % WIND_DIRECTION_MODES.length] ?? 'auto';
}

export function windVectorAtTick(authorityTick: bigint): readonly [number, number] {
  const automatic = WIND_DIRECTION_MODES[
    1 + Number(authorityDayIndex(authorityTick) % BigInt(WIND_DIRECTION_MODES.length - 1))
  ] ?? 'e';
  return automatic === 'auto' ? WIND_VECTORS.e : WIND_VECTORS[automatic];
}

export function windVectorForMode(
  mode: WindDirectionMode,
  authorityTick: bigint,
): readonly [number, number] {
  return mode === 'auto' ? windVectorAtTick(authorityTick) : WIND_VECTORS[mode];
}

export function isWeatherMode(value: string): value is WeatherMode {
  return WEATHER_MODES.includes(value as WeatherMode);
}

export function nextWeatherMode(mode: WeatherMode): WeatherMode {
  const index = WEATHER_MODES.indexOf(mode);
  return WEATHER_MODES[(index + 1) % WEATHER_MODES.length] ?? 'auto';
}

export function scheduledRainAtTick(authorityTick: bigint): boolean {
  const day = authorityDayIndex(authorityTick);
  const progress = authorityDayProgress(authorityTick);
  const season = Number((day / BigInt(DAYS_PER_SEASON)) % 4n);
  const dayOfSeason = Number(day % BigInt(DAYS_PER_SEASON));
  const rainDays = season === 0 ? [1, 4]
    : season === 1 ? [3]
      : season === 2 ? [1, 5]
        : [4];
  const [begin, end] = season === 1 ? [0.22, 0.48]
    : season === 3 ? [0.18, 0.42]
      : [0.15, 0.55];
  return rainDays.includes(dayOfSeason) && progress >= begin && progress <= end;
}

export function rainForWeatherMode(mode: WeatherMode, authorityTick: bigint): boolean {
  return weatherVisualState(mode, authorityTick).raining;
}

function smoothStep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Smoothly enters, holds, then leaves a weather window within one game day. */
function weatherWindow(
  progress: number,
  begin: number,
  fullAt: number,
  fadeAt: number,
  end: number,
): number {
  if (progress <= begin || progress >= end) return 0;
  if (progress < fullAt) return smoothStep((progress - begin) / (fullAt - begin));
  if (progress <= fadeAt) return 1;
  return smoothStep((end - progress) / (end - fadeAt));
}

/**
 * Resolves all cosmetic weather from persisted mode plus the authoritative clock.
 * Nothing random is stored client-side, so every player sees the same weather phase.
 */
export function weatherVisualState(
  mode: WeatherMode,
  authorityTick: bigint,
  windDirection: WindDirectionMode = 'auto',
): WeatherVisualState {
  const progress = authorityDayProgress(authorityTick);
  const [windDirectionX, windDirectionY] = windVectorForMode(windDirection, authorityTick);
  const directed = (state: Omit<WeatherVisualState, 'windDirectionX' | 'windDirectionY'>): WeatherVisualState => ({
    ...state,
    windDirectionX,
    windDirectionY,
  });
  const daylight = weatherWindow(progress, 0.05, 0.1, 0.68, 0.76);
  const daylightClouds = (state: WeatherVisualState): WeatherVisualState => ({
    ...state,
    // There is no visible cloud sprite: these are ground shadows, so suppress them
    // outside sunlit hours unless rain is actively providing overcast shading.
    cloudShadow: state.raining ? state.cloudShadow : state.cloudShadow * daylight,
  });
  if (mode === 'clear') return directed({ raining: false, cloudShadow: 0, wind: 0.05 });
  if (mode === 'cloudy') return daylightClouds(directed({ raining: false, cloudShadow: 0.78, wind: 0.22 }));
  if (mode === 'wind') return daylightClouds(directed({ raining: false, cloudShadow: 0.42, wind: 1 }));
  if (mode === 'rain') return directed({ raining: true, cloudShadow: 0.9, wind: 0.58 });

  const day = authorityDayIndex(authorityTick);
  const season = Number((day / BigInt(DAYS_PER_SEASON)) % 4n);
  const seasonal = season === 0
    ? { cloudBase: 0.1, cloudPulse: 0.18, windBase: 0.08, windPulse: 0.12, rainWind: 0.34 }
    : season === 1
      ? { cloudBase: 0.05, cloudPulse: 0.14, windBase: 0.06, windPulse: 0.09, rainWind: 0.28 }
      : season === 2
        ? { cloudBase: 0.14, cloudPulse: 0.3, windBase: 0.12, windPulse: 0.26, rainWind: 0.42 }
        : { cloudBase: 0.1, cloudPulse: 0.22, windBase: 0.09, windPulse: 0.16, rainWind: 0.3 };
  const fairWeather = weatherWindow(progress, 0.24, 0.34, 0.52, 0.62);
  const dayStart = day * BigInt(AUTHORITY_TICKS_PER_DAY);
  const rainDay = scheduledRainAtTick(
    dayStart + BigInt(Math.round(AUTHORITY_TICKS_PER_DAY * 0.3)),
  );
  const rainBuildUp = rainDay ? weatherWindow(progress, 0.08, 0.14, 0.56, 0.68) : 0;
  const raining = scheduledRainAtTick(authorityTick);
  return daylightClouds(directed({
    raining,
    cloudShadow: raining
      ? 0.86
      : seasonal.cloudBase + Math.max(fairWeather * seasonal.cloudPulse, rainBuildUp * 0.38),
    wind: raining
      ? seasonal.rainWind
      : seasonal.windBase + Math.max(
        fairWeather * seasonal.windPulse,
        rainBuildUp * Math.max(0, seasonal.rainWind - seasonal.windBase),
      ),
  }));
}
