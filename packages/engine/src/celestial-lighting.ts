import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON, SEASONS, lunarCycleProgressAtAuthorityTick, lunarIlluminationAtAuthorityTick } from '@orchard/sim';
import type { RgbColor } from './lighting.js';
import { CELESTIAL_PRESET as preset } from './celestial-lighting-presets.js';

export interface CelestialSource {
  /** Unit vector toward the source: east, south, up. */
  readonly direction: readonly [number, number, number];
  readonly altitude: number;
  readonly color: RgbColor;
  readonly intensity: number;
  readonly illumination: RgbColor;
  readonly shadowKey: string;
}
export interface CelestialLighting {
  readonly sun: CelestialSource;
  readonly moon: CelestialSource;
  readonly diffuse: RgbColor;
  readonly combined: RgbColor;
  readonly clockHours: number;
  readonly lunarIllumination: number;
  readonly season: ReturnType<typeof seasonalLightingAtDay>;
}
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const wrap = (value: number, period: number): number => ((value % period) + period) % period;
const smooth = (value: number): number => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const colorMix = (a: RgbColor, b: RgbColor, t: number): RgbColor => ({ r: mix(a.r, b.r, t), g: mix(a.g, b.g, t), b: mix(a.b, b.b, t) });
const scaleColor = (color: RgbColor, weight: number): RgbColor => ({ r: Math.round(color.r * weight), g: Math.round(color.g * weight), b: Math.round(color.b * weight) });
export function maximumLight(...colors: readonly RgbColor[]): RgbColor {
  return { r: Math.max(...colors.map((c) => c.r)), g: Math.max(...colors.map((c) => c.g)), b: Math.max(...colors.map((c) => c.b)) };
}

export function seasonalLightingAtDay(continuousDay: number) {
  const position = wrap(continuousDay - DAYS_PER_SEASON / 2, DAYS_PER_SEASON * SEASONS.length) / DAYS_PER_SEASON;
  const from = Math.floor(position);
  const to = (from + 1) % SEASONS.length;
  const blend = smooth(position - from);
  const a = preset.seasons[from]!;
  const b = preset.seasons[to]!;
  return { from: SEASONS[from]!, to: SEASONS[to]!, blend,
    sunrise: mix(a.sunrise, b.sunrise, blend), sunset: mix(a.sunset, b.sunset, blend),
    sunAltitude: mix(a.sunAltitude, b.sunAltitude, blend), moonAltitude: mix(a.moonAltitude, b.moonAltitude, blend) };
}

function source(progress: number, maxAltitude: number, color: RgbColor, strength: number): CelestialSource {
  const above = progress > 0 && progress < 1;
  const altitude = above ? maxAltitude * Math.sin(Math.PI * progress) * Math.PI / 180 : 0;
  const heading = Math.PI * clamp(progress);
  const intensity = above ? strength * smooth(altitude / (10 * Math.PI / 180)) : 0;
  const direction: readonly [number, number, number] = [Math.cos(heading) * Math.cos(altitude), Math.sin(heading) * Math.cos(altitude), Math.sin(altitude)];
  return { direction, altitude, color, intensity, illumination: scaleColor(color, intensity),
    shadowKey: intensity === 0 ? 'below-horizon' : `${Math.round(heading * 180 / Math.PI)}:${Math.round(altitude * 180 / Math.PI)}:${Math.round(intensity * 64)}` };
}

/** Pure fixture seam. Runtime callers use the authority-clock wrapper below. */
export function celestialLightingAtCalendar(input: {
  readonly continuousDay: number; readonly clockHours: number;
  readonly lunarProgress: number; readonly lunarIllumination: number; readonly cloudCover?: number;
}): CelestialLighting {
  const season = seasonalLightingAtDay(input.continuousDay);
  const clockHours = wrap(input.clockHours, 24);
  const clouds = clamp(input.cloudCover ?? 0);
  const transmission = 1 - clouds * preset.cloudDirectLoss;
  const sunProgress = (clockHours - season.sunrise) / (season.sunset - season.sunrise);
  const sunAltitude = Math.max(0, Math.sin(Math.PI * clamp(sunProgress))) * season.sunAltitude;
  const sunColor = colorMix(preset.horizonSun, preset.highSun, smooth(sunAltitude / 20));
  const sun = source(sunProgress, season.sunAltitude, sunColor, transmission);
  const moonHourDifference = wrap(clockHours - wrap(input.lunarProgress, 1) * 24 + 12, 24) - 12;
  const lunarIllumination = clamp(input.lunarIllumination);
  const moon = source((moonHourDifference + 6) / 12, season.moonAltitude, preset.moon,
    preset.moonStrength * lunarIllumination * transmission);
  const twilight = preset.twilightHours;
  const dayWeight = smooth((clockHours - season.sunrise + twilight) / (twilight * 2))
    * smooth((season.sunset + twilight - clockHours) / (twilight * 2));
  const diffuse = maximumLight(preset.nightFloor,
    scaleColor(colorMix(preset.nightFloor, preset.diffuseDay, dayWeight), 1 - clouds * preset.cloudDiffuseLoss),
    scaleColor(moon.illumination, preset.moonDiffuseStrength));
  return { sun, moon, diffuse, combined: maximumLight(diffuse, sun.illumination, moon.illumination), clockHours, lunarIllumination, season };
}

/** BigInt modulo keeps old worlds precise. Seasons and the 29.5-day moon are
 * independent; fractional tick is shared by Basic and Dynamic. */
export function celestialLightingAtTick(tick: bigint, cloudCover = 0, fractionalTick = 0): CelestialLighting {
  const safeTick = tick < 0n ? 0n : tick;
  const fraction = clamp(fractionalTick);
  const ticksPerDay = BigInt(AUTHORITY_TICKS_PER_DAY);
  const yearTicks = ticksPerDay * BigInt(DAYS_PER_SEASON * SEASONS.length);
  const dayProgress = (Number(safeTick % ticksPerDay) + fraction) / AUTHORITY_TICKS_PER_DAY;
  return celestialLightingAtCalendar({
    continuousDay: (Number(safeTick % yearTicks) + fraction) / AUTHORITY_TICKS_PER_DAY,
    clockHours: dayProgress * 24 + 6,
    lunarProgress: lunarCycleProgressAtAuthorityTick(safeTick) + fraction / (AUTHORITY_TICKS_PER_DAY * 29.5),
    lunarIllumination: mix(lunarIlluminationAtAuthorityTick(safeTick), lunarIlluminationAtAuthorityTick(safeTick + 1n), fraction) / 1000,
    cloudCover,
  });
}
