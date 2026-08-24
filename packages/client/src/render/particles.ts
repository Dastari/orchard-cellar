import { TICKS_PER_DAY } from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import { selectAtlasFrame } from './sprite.js';

export type ParticleSpace = 'world' | 'screen';
export type ParticleKind = 'rain_streak' | 'rain_splash';

export const RAIN_STREAK_VELOCITY = [-140, 280] as const;
export const RAIN_VISUAL_SCALE = 1.5;
export const RAIN_REFERENCE_WORLD_ZOOM = 2;

export interface ParticleSpawn {
  readonly space: ParticleSpace;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly lifetime: number;
  readonly kind?: ParticleKind;
}

export type ParticleExpire = (
  space: ParticleSpace,
  x: number,
  y: number,
  kind: ParticleKind,
) => void;

export class ParticlePool {
  private readonly active: Uint8Array;
  private readonly screenSpace: Uint8Array;
  private readonly kind: Uint8Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly depthY: Float32Array;
  private readonly velocityX: Float32Array;
  private readonly velocityY: Float32Array;
  private readonly lifetime: Float32Array;
  private readonly initialLifetime: Float32Array;
  private cursor = 0;
  private activeCountValue = 0;

  constructor(readonly capacity: number) {
    this.active = new Uint8Array(capacity);
    this.screenSpace = new Uint8Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.depthY = new Float32Array(capacity);
    this.velocityX = new Float32Array(capacity);
    this.velocityY = new Float32Array(capacity);
    this.lifetime = new Float32Array(capacity);
    this.initialLifetime = new Float32Array(capacity);
  }

  get activeCount(): number { return this.activeCountValue; }

  spawn(particle: ParticleSpawn): number {
    return this.spawnValues(
      particle.space,
      particle.x,
      particle.y,
      particle.velocityX,
      particle.velocityY,
      particle.lifetime,
      particle.kind,
      particle.y,
    );
  }

  spawnValues(
    space: ParticleSpace,
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    lifetime: number,
    kind: ParticleKind = 'rain_streak',
    depthY = y,
  ): number {
    for (let checked = 0; checked < this.capacity; checked += 1) {
      const index = (this.cursor + checked) % this.capacity;
      if (this.active[index] !== 0) continue;
      this.active[index] = 1;
      this.screenSpace[index] = space === 'screen' ? 1 : 0;
      this.kind[index] = kind === 'rain_splash' ? 1 : 0;
      this.x[index] = x;
      this.y[index] = y;
      this.depthY[index] = depthY;
      this.velocityX[index] = velocityX;
      this.velocityY[index] = velocityY;
      this.lifetime[index] = lifetime;
      this.initialLifetime[index] = lifetime;
      this.cursor = (index + 1) % this.capacity;
      this.activeCountValue += 1;
      return index;
    }
    return -1;
  }

  update(deltaSeconds: number, onExpire?: ParticleExpire): void {
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index] === 0) continue;
      const remaining = this.lifetime[index] ?? 0;
      const movementSeconds = Math.min(deltaSeconds, Math.max(0, remaining));
      this.x[index] = (this.x[index] ?? 0) + (this.velocityX[index] ?? 0) * movementSeconds;
      this.y[index] = (this.y[index] ?? 0) + (this.velocityY[index] ?? 0) * movementSeconds;
      this.lifetime[index] = remaining - deltaSeconds;
      if ((this.lifetime[index] ?? 0) > 0) continue;
      onExpire?.(
        this.screenSpace[index] === 1 ? 'screen' : 'world',
        this.x[index] ?? 0,
        this.y[index] ?? 0,
        this.kind[index] === 1 ? 'rain_splash' : 'rain_streak',
      );
      this.active[index] = 0;
      this.activeCountValue -= 1;
    }
  }

  translate(deltaX: number, deltaY: number): void {
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index] === 0) continue;
      this.x[index] = (this.x[index] ?? 0) + deltaX;
      this.y[index] = (this.y[index] ?? 0) + deltaY;
      this.depthY[index] = (this.depthY[index] ?? 0) + deltaY;
    }
  }

  trim(maximumActive: number): void {
    let keep = Math.max(0, Math.floor(maximumActive));
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index] === 0) continue;
      if (keep > 0) {
        keep -= 1;
        continue;
      }
      this.active[index] = 0;
      this.activeCountValue -= 1;
    }
  }

  rescaleMotion(factor: number): void {
    const safeFactor = Math.max(0.01, factor);
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index] === 0) continue;
      this.velocityX[index] = (this.velocityX[index] ?? 0) * safeFactor;
      this.velocityY[index] = (this.velocityY[index] ?? 0) * safeFactor;
      this.lifetime[index] = (this.lifetime[index] ?? 0) / safeFactor;
      this.initialLifetime[index] = (this.initialLifetime[index] ?? 0) / safeFactor;
    }
  }

  draw(
    context: CanvasRenderingContext2D,
    cameraX: number,
    cameraY: number,
    scale: number,
    color = '#a9d9e870',
    screenPositionScale = scale,
    screenSizeScale = screenPositionScale,
    splashAsset: LoadedAsset | null = null,
    streakAsset: LoadedAsset | null = null,
    minimumDepth = Number.NEGATIVE_INFINITY,
    maximumDepth = Number.POSITIVE_INFINITY,
  ): number {
    context.fillStyle = color;
    let draws = 0;
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index] === 0) continue;
      const screen = this.screenSpace[index] !== 0;
      const sizeScale = screen ? screenSizeScale : scale;
      const positionScale = screen ? screenPositionScale : scale;
      const x = ((this.x[index] ?? 0) - (screen ? 0 : cameraX)) * positionScale;
      const y = ((this.y[index] ?? 0) - (screen ? 0 : cameraY)) * positionScale;
      const depth = ((this.depthY[index] ?? 0) - (screen ? 0 : cameraY)) * positionScale;
      if (depth < minimumDepth || depth >= maximumDepth) continue;
      if (this.kind[index] === 1) {
        if (splashAsset !== null) {
          const frameCount = splashAsset.metadata.animations['splash']?.length ?? 0;
          const progress = 1 - (this.lifetime[index] ?? 0) / Math.max(0.001, this.initialLifetime[index] ?? 0);
          const frame = selectAtlasFrame(
            splashAsset.metadata,
            'splash',
            animationFrameForProgress(frameCount, progress),
          );
          if (frame !== null) {
            context.drawImage(
              splashAsset.image,
              frame.x,
              frame.y,
              frame.width,
              frame.height,
              Math.round(x - splashAsset.anchor[0] * sizeScale),
              Math.round(y - splashAsset.anchor[1] * sizeScale),
              frame.width * sizeScale,
              frame.height * sizeScale,
            );
            draws += 1;
            continue;
          }
        }
        const pixel = Math.max(1, Math.round(sizeScale));
        const centerX = Math.round(x);
        const centerY = Math.round(y);
        context.fillRect(centerX - 2 * pixel, centerY, 5 * pixel, pixel);
        context.fillRect(centerX - 3 * pixel, centerY - pixel, pixel, pixel);
        context.fillRect(centerX + 2 * pixel, centerY - pixel, pixel, pixel);
        draws += 3;
      } else {
        if (streakAsset !== null) {
          const frame = selectAtlasFrame(streakAsset.metadata, 'base', 0);
          if (frame !== null) {
            context.drawImage(
              streakAsset.image,
              frame.x,
              frame.y,
              frame.width,
              frame.height,
              Math.round(x - streakAsset.anchor[0] * sizeScale),
              Math.round(y - streakAsset.anchor[1] * sizeScale),
              frame.width * sizeScale,
              frame.height * sizeScale,
            );
            draws += 1;
            continue;
          }
        }
        context.fillRect(
          Math.round(x),
          Math.round(y),
          Math.max(1, sizeScale),
          Math.max(2, 6 * sizeScale),
        );
        draws += 1;
      }
    }
    return draws;
  }
}

export function rainActiveAtTick(authorityTick: bigint): boolean {
  const day = authorityTick / BigInt(TICKS_PER_DAY);
  const progress = Number(authorityTick % BigInt(TICKS_PER_DAY)) / TICKS_PER_DAY;
  return day % 4n === 1n && progress >= 0.15 && progress <= 0.55;
}

export function animationFrameForProgress(frameCount: number, progress: number): number {
  if (frameCount <= 1) return 0;
  return Math.min(frameCount - 1, Math.max(0, Math.floor(progress * frameCount)));
}

export function screenParticleScale(worldScale: number, worldZoom: number): number {
  return worldScale / Math.max(0.01, worldZoom);
}

export function rainVisualScale(worldScale: number): number {
  return worldScale / RAIN_REFERENCE_WORLD_ZOOM * RAIN_VISUAL_SCALE;
}

export function rainMotionScale(worldZoom: number): number {
  return Math.max(0.01, worldZoom) / RAIN_REFERENCE_WORLD_ZOOM;
}

export function rainStreakTarget(worldZoom: number): number {
  const closeZoomRatio = Math.max(1, Math.max(0.01, worldZoom) / RAIN_REFERENCE_WORLD_ZOOM);
  return Math.max(24, Math.round(200 / (closeZoomRatio * closeZoomRatio)));
}

export function weatherCameraOffset(
  previousCenterX: number,
  previousCenterY: number,
  centerX: number,
  centerY: number,
  worldZoom: number,
): readonly [number, number] {
  return [
    -(centerX - previousCenterX) * worldZoom,
    -(centerY - previousCenterY) * worldZoom,
  ];
}

export class RainWeather {
  readonly streaks = new ParticlePool(220);
  readonly splashes = new ParticlePool(60);
  private randomState = 0x4f434852;
  private enabledValue = false;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private previousCenterX: number | null = null;
  private previousCenterY: number | null = null;
  private previousZoom: number | null = null;
  private motionScale = 1;
  private readonly splashAtStreakEnd: ParticleExpire = (space, x, y, kind) => {
    if (kind !== 'rain_streak') return;
    this.splashes.spawnValues(space, x, y, 0, 0, this.splashDuration(), 'rain_splash');
  };

  constructor(
    private readonly streakAsset: LoadedAsset | null = null,
    private readonly splashAsset: LoadedAsset | null = null,
  ) {}

  get enabled(): boolean { return this.enabledValue; }
  get activeCount(): number { return this.streaks.activeCount + this.splashes.activeCount; }
  get splashCount(): number { return this.splashes.activeCount; }

  update(
    enabled: boolean,
    viewportWidth: number,
    viewportHeight: number,
    worldZoom = RAIN_REFERENCE_WORLD_ZOOM,
  ): void {
    this.enabledValue = enabled;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    const nextMotionScale = rainMotionScale(worldZoom);
    if (Math.abs(nextMotionScale - this.motionScale) >= 0.001) {
      this.streaks.rescaleMotion(nextMotionScale / this.motionScale);
      this.motionScale = nextMotionScale;
    }
    if (enabled) {
      const target = rainStreakTarget(worldZoom);
      this.streaks.trim(target);
      while (this.streaks.activeCount < target) {
        this.spawnStreak(this.streaks.activeCount < Math.max(0, target - 10));
      }
    }
    this.streaks.update(1 / 60, this.splashAtStreakEnd);
    this.splashes.update(1 / 60);
  }

  drawDepthRange(
    context: CanvasRenderingContext2D,
    cameraX: number,
    cameraY: number,
    scale: number,
    worldZoom: number,
    minimumDepth = Number.NEGATIVE_INFINITY,
    maximumDepth = Number.POSITIVE_INFINITY,
  ): number {
    if (!this.enabledValue) return 0;
    const screenPositionScale = screenParticleScale(scale, worldZoom);
    const screenSizeScale = rainVisualScale(scale);
    const previousAlpha = context.globalAlpha;
    context.globalAlpha = previousAlpha * 0.8;
    const draws = this.streaks.draw(
      context,
      cameraX,
      cameraY,
      scale,
      '#a9d9e870',
      screenPositionScale,
      screenSizeScale,
      null,
      this.streakAsset,
      minimumDepth,
      maximumDepth,
    )
      + this.splashes.draw(
        context,
        cameraX,
        cameraY,
        scale,
        '#b7e6ed80',
        screenPositionScale,
        screenSizeScale,
        this.splashAsset,
        null,
        minimumDepth,
        maximumDepth,
      );
    context.globalAlpha = previousAlpha;
    return draws;
  }

  followViewport(centerX: number, centerY: number, worldZoom: number): void {
    if (
      this.previousCenterX !== null
      && this.previousCenterY !== null
      && this.previousZoom !== null
      && Math.abs(this.previousZoom - worldZoom) < 0.001
    ) {
      const [offsetX, offsetY] = weatherCameraOffset(
        this.previousCenterX,
        this.previousCenterY,
        centerX,
        centerY,
        worldZoom,
      );
      this.streaks.translate(offsetX, offsetY);
      this.splashes.translate(offsetX, offsetY);
    }
    this.previousCenterX = centerX;
    this.previousCenterY = centerY;
    this.previousZoom = worldZoom;
  }

  private splashDuration(): number {
    const frames = this.splashAsset?.metadata.animations['splash']?.length ?? 0;
    const fps = this.splashAsset?.metadata.animationMeta?.['splash']?.fps ?? 30;
    return Math.max(1 / 60, frames > 0 ? frames / fps : 0.12);
  }

  private spawnStreak(initial: boolean): void {
    const velocityX = RAIN_STREAK_VELOCITY[0] * this.motionScale;
    const velocityY = RAIN_STREAK_VELOCITY[1] * this.motionScale;
    const startY = initial ? this.random() * this.viewportHeight : -8;
    const minimumTravel = Math.min(12, Math.max(1, this.viewportHeight - startY));
    const groundY = startY + minimumTravel
      + this.random() * Math.max(0, this.viewportHeight - startY - minimumTravel);
    const lifetime = Math.max(1 / 60, (groundY - startY) / velocityY);
    const impactX = this.random() * this.viewportWidth;
    this.streaks.spawnValues(
      'screen',
      impactX - velocityX * lifetime,
      startY,
      velocityX,
      velocityY,
      lifetime,
      'rain_streak',
      groundY,
    );
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x1_0000_0000;
  }
}
